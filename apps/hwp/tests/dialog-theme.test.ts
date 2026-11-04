// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  DIALOG_THEME_ATTRIBUTE,
  DIALOG_THEME_CSS,
  DIALOG_THEME_STYLE_ID,
  DIALOG_THEME_VERSION,
  installDialogTheme,
} from '../studio-plugin/dialog-theme.mjs'

function page(): Document {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document
}

/** The rhwp-studio source that scripts/build-studio.mjs caches, if present. */
function studioSource(): string {
  // The cache is named after the engine's upstream tag, not its package version.
  const require = createRequire(import.meta.url)
  const { tag } = (require('@rhwp/core/package.json') as { rhwp: { tag: string } }).rhwp
  return join(__dirname, '..', 'node_modules', '.cache', 'rhwp-studio', tag, 'rhwp-studio', 'src')
}

interface Rule {
  selector: string
  props: string[]
}

/** Top-level style rules; at-rule blocks (@media, @keyframes) are skipped. */
function styleRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  let at = 0
  while (at < text.length) {
    const open = text.indexOf('{', at)
    if (open < 0) break
    const head = text.slice(at, open).trim()
    let depth = 1
    let end = open + 1
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth++
      else if (text[end] === '}') depth--
      end++
    }
    if (!head.startsWith('@')) {
      const props = text
        .slice(open + 1, end - 1)
        .split(';')
        .map((declaration) => declaration.split(':')[0].trim())
        .filter(Boolean)
      for (const selector of selectorList(head)) rules.push({ selector, props })
    }
    at = end
  }
  return rules
}

/** Splits a selector list on its top-level commas and expands `:where(a, b)`. */
function selectorList(head: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < head.length; i++) {
    if (head[i] === '(') depth++
    else if (head[i] === ')') depth--
    else if (head[i] === ',' && depth === 0) {
      parts.push(head.slice(start, i))
      start = i + 1
    }
  }
  parts.push(head.slice(start))
  return parts.flatMap((part) => {
    const selector = part.trim().replace(/\s+/g, ' ')
    const list = /:where\(([^()]*,[^()]*)\)/.exec(selector)
    if (!list) return [selector]
    return list[1]
      .split(',')
      .flatMap((item) => selectorList(selector.replace(list[0], item.trim())))
  })
}

/** Classes and pseudo-classes an ancestor of every dialog part carries. */
const SKELETON = new Set(['.modal-overlay', '.dialog-wrap', '.dialog-body'])

/**
 * Whether our rule can land on the element their rule styles: the same
 * pseudo-element, and no ancestor of ours that their selector does not name
 * (`.find-dialog-buttons .dialog-btn` never reaches the bookmark dialog).
 */
function reaches(ours: string, theirs: string): boolean {
  const pseudoElement = (selector: string) =>
    lastCompound(selector)
      .filter((token) => token.startsWith('::'))
      .join()
  if (pseudoElement(ours) !== pseudoElement(theirs)) return false
  const ancestors =
    ours
      .split(' ')
      .slice(0, -1)
      .join(' ')
      .match(/\.[\w-]+/g) ?? []
  return ancestors.every((name) => SKELETON.has(name) || theirs.includes(name))
}

/** Classes, pseudo-classes and the element name of a selector's last compound. */
function lastCompound(selector: string): string[] {
  const last = selector.split(/\s*[>+~]\s*|\s+/).pop() ?? ''
  return last.match(/[.:]{1,2}[\w-]+(?:\([^)]*\))?|^[a-z]+/g) ?? []
}

describe('HWP dialog design system', () => {
  it('installs one style sheet and turns the skin on', () => {
    const doc = page()
    expect(installDialogTheme(doc)).toBe(true)

    const style = doc.getElementById(DIALOG_THEME_STYLE_ID)
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent).toBe(DIALOG_THEME_CSS)
    expect(doc.documentElement.getAttribute(DIALOG_THEME_ATTRIBUTE)).toBe(
      String(DIALOG_THEME_VERSION),
    )
  })

  it('does not stack a second style sheet when called again', () => {
    const doc = page()
    installDialogTheme(doc)
    installDialogTheme(doc)
    const sheets = doc.querySelectorAll(`#${DIALOG_THEME_STYLE_ID}`)
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.textContent).toBe(DIALOG_THEME_CSS)
  })

  it('replaces stale styles after a dev reload', () => {
    const doc = page()
    installDialogTheme(doc)
    const style = doc.getElementById(DIALOG_THEME_STYLE_ID)!
    style.textContent = ':root {}'
    installDialogTheme(doc)
    expect(style.textContent).toBe(DIALOG_THEME_CSS)
  })

  it("leaves the user's oldschool studio skin alone, and follows a later switch", async () => {
    const doc = page()
    doc.documentElement.setAttribute('data-theme-skin', 'oldschool')
    expect(installDialogTheme(doc)).toBe(false)
    expect(doc.documentElement.hasAttribute(DIALOG_THEME_ATTRIBUTE)).toBe(false)

    doc.documentElement.removeAttribute('data-theme-skin')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(doc.documentElement.getAttribute(DIALOG_THEME_ATTRIBUTE)).toBe(
      String(DIALOG_THEME_VERSION),
    )

    doc.documentElement.setAttribute('data-theme-skin', 'oldschool')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(doc.documentElement.hasAttribute(DIALOG_THEME_ATTRIBUTE)).toBe(false)
  })

  it('has the same token names in both themes', () => {
    const tokens = (block: string): string[] =>
      [...block.matchAll(/--ieum-dialog-[a-z-]+/g)].map((m) => m[0])
    const lightStart = DIALOG_THEME_CSS.indexOf(':root[data-ieum-dialog-theme] {')
    const darkStart = DIALOG_THEME_CSS.indexOf(
      ":root[data-ieum-dialog-theme][data-theme-effective='dark'] {",
    )
    const motionStart = DIALOG_THEME_CSS.indexOf('3. Motion')
    expect(lightStart).toBeGreaterThan(-1)
    expect(darkStart).toBeGreaterThan(lightStart)
    expect(motionStart).toBeGreaterThan(darkStart)

    const light = new Set(tokens(DIALOG_THEME_CSS.slice(lightStart, darkStart)))
    const dark = new Set(tokens(DIALOG_THEME_CSS.slice(darkStart, motionStart)))
    // A dark block may leave shape/motion tokens alone, but every name it
    // overrides must exist in the light block (a typo would paint one theme).
    expect([...dark].every((name) => light.has(name))).toBe(true)
    expect(dark.size).toBeGreaterThan(15)
  })

  it('keeps the app-side memo modal tokens in step with the iframe skin', () => {
    const appCss = readFileSync(
      join(__dirname, '..', 'src', 'renderer', 'dialog-theme.css'),
      'utf8',
    )
    const declarations = (block: string): Map<string, string> => {
      const found = new Map<string, string>()
      for (const match of block.matchAll(/--ieum-dialog-[a-z-]+\s*:\s*([^;]+);/g)) {
        const name = match[0].slice(0, match[0].indexOf(':')).trim()
        found.set(name, match[1].replace(/\s+/g, ' ').trim())
      }
      return found
    }

    const lightStart = DIALOG_THEME_CSS.indexOf(':root[data-ieum-dialog-theme] {')
    const darkStart = DIALOG_THEME_CSS.indexOf(
      ":root[data-ieum-dialog-theme][data-theme-effective='dark'] {",
    )
    const motionStart = DIALOG_THEME_CSS.indexOf('3. Motion')
    const iframeLight = declarations(DIALOG_THEME_CSS.slice(lightStart, darkStart))
    const iframeDark = declarations(DIALOG_THEME_CSS.slice(darkStart, motionStart))

    const appLightStart = appCss.indexOf(':root {')
    const appDarkStart = appCss.indexOf("[data-theme='dark'] {")
    const appMediaStart = appCss.indexOf('@media (prefers-color-scheme: dark)')
    const appLight = declarations(appCss.slice(appLightStart, appDarkStart))
    const appDark = declarations(appCss.slice(appDarkStart, appMediaStart))
    const appFallback = declarations(
      appCss.slice(appMediaStart, appCss.indexOf('/* ─', appMediaStart)),
    )

    expect(Object.fromEntries(appLight)).toEqual(Object.fromEntries(iframeLight))
    expect(Object.fromEntries(appDark)).toEqual(Object.fromEntries(iframeDark))
    expect(Object.fromEntries(appFallback)).toEqual(Object.fromEntries(appDark))
    expect(appCss).toContain('.memo-modal')
    expect(appCss).toContain('.memo-textarea')
    expect(appCss).toContain('.memo-modal-actions .memo-button-primary')
  })

  it('keeps every colour after the token blocks behind a token', () => {
    const motion = DIALOG_THEME_CSS.indexOf('3. Motion')
    const componentCss = DIALOG_THEME_CSS.slice(motion)
    expect(componentCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(componentCss).not.toMatch(/rgba?\(/)
  })

  it('still matches the studio class names when the cached source is present', () => {
    const ui = join(studioSource(), 'ui')
    const dialog = join(ui, 'dialog.ts')
    if (!existsSync(dialog)) return

    const source = (name: string) => readFileSync(join(ui, name), 'utf8')
    const base = source('dialog.ts')
    for (const name of [
      'dialog-wrap',
      'dialog-title',
      'dialog-close',
      'dialog-body',
      'dialog-footer',
      'dialog-btn',
      'dialog-btn-primary',
    ]) {
      expect(base).toContain(name)
    }

    const cell = source('table-cell-props-dialog.ts')
    for (const name of [
      'dialog-tabs',
      'dialog-tab',
      'dialog-tab-panel',
      'dialog-section',
      'dialog-row',
      'dialog-label',
      'dialog-input',
      'dialog-select',
      'dialog-checkbox',
      'dialog-btn-group',
    ]) {
      expect(cell).toContain(name)
    }

    const field = source('field-insert-dialog.ts')
    for (const name of [
      'field-edit-body',
      'field-edit-panel',
      'field-edit-label',
      'field-edit-input',
      'field-edit-textarea',
      'field-edit-checkbox-row',
    ]) {
      expect(field).toContain(name)
    }
  })

  it("does not outweigh rhwp's own per-dialog layout rules", () => {
    const styles = join(studioSource(), 'styles')
    if (!existsSync(styles)) return

    // Rules under :root[...] outweigh any rhwp rule; rules under :where(...)
    // only replace rhwp's base rule. A rhwp rule scoped to one dialog or one
    // state must keep working unless we restyle that same case ourselves.
    const strongPrefix = `:root[${DIALOG_THEME_ATTRIBUTE}]`
    const strong = styleRules(DIALOG_THEME_CSS)
      .filter((rule) => rule.selector.startsWith(strongPrefix))
      .map((rule) => ({ ...rule, selector: rule.selector.slice(strongPrefix.length).trim() }))

    // Deliberate: every dialog gets the same capped shell, padding and accent.
    const allowed = new Set([
      '.dialog-wrap.recovery-dialog | display,flex-direction,max-height,overflow',
      '.recovery-dialog > .dialog-title | flex',
      '.recovery-dialog > .dialog-footer | flex',
      // rhwp devel's PDF import dialog uses the same capped shell as its recovery dialog
      '.dialog-wrap.dialog-pdf-import | display,flex-direction,max-height,overflow',
      '.dialog-pdf-import > .dialog-title | flex',
      '.dialog-pdf-import > .dialog-footer | flex',
      '.dialog-btn-primary.hml-save-format-primary | background,border-color',
      '.dialog-btn-primary.hml-save-format-primary:hover | background',
      '.dialog-wrap.tcp-dialog | display,flex-direction',
      '.dialog-wrap.tcp-dialog .dialog-body | flex,padding',
      '.dialog-wrap.tcp-dialog .dialog-footer | flex',
      '.dialog-wrap.tcp-border-bg-dialog | display,flex-direction',
      '.dialog-wrap.tcp-border-bg-dialog .dialog-body | flex,padding',
      '.dialog-wrap.tcp-border-bg-dialog .dialog-footer | flex',
      '.tcp-border-preview-wrap .tcp-dir-btn | border-radius,background,color',
      '.tcp-border-preview-wrap .tcp-dir-btn:hover | background,border-color',
      '.pp-dialog .dialog-body | flex',
    ])

    const overridden: string[] = []
    for (const file of readdirSync(styles)) {
      if (!file.endsWith('.css') || file === 'theme-oldschool.css') continue
      for (const theirs of styleRules(readFileSync(join(styles, file), 'utf8'))) {
        const tokens = lastCompound(theirs.selector)
        const key = tokens.find((token) => token.startsWith('.') && !token.startsWith('..'))
        const scoped = theirs.selector.includes(' ')
        if (!key || (!scoped && tokens.length < 2)) continue // a base rule: ours replaces it

        const covered = strong.some((ours) =>
          scoped
            ? ours.selector === theirs.selector
            : tokens.every((token) => lastCompound(ours.selector).includes(token)),
        )
        if (covered) continue

        const props = new Set<string>()
        for (const ours of strong) {
          if (!lastCompound(ours.selector).includes(key)) continue
          if (!reaches(ours.selector, theirs.selector)) continue
          for (const prop of ours.props) if (theirs.props.includes(prop)) props.add(prop)
        }
        if (props.size === 0) continue
        const entry = `${theirs.selector} | ${theirs.props.filter((p) => props.has(p)).join(',')}`
        if (!allowed.has(entry)) overridden.push(`${file}: ${entry}`)
      }
    }
    expect(overridden).toEqual([])
  })

  it('puts no accent stripe on a dialog edge or in front of a heading', () => {
    const appCss = readFileSync(
      join(__dirname, '..', 'src', 'renderer', 'dialog-theme.css'),
      'utf8',
    )
    const decorated = [...styleRules(DIALOG_THEME_CSS), ...styleRules(appCss)]
      .map((rule) => rule.selector)
      .filter((selector) =>
        /\.(dialog-wrap|memo-modal|find-dialog|dialog-section-title)::(before|after)$/.test(
          selector,
        ),
      )
    expect(decorated).toEqual([])
    expect(DIALOG_THEME_CSS).not.toMatch(
      /border-(top|left):\s*[2-9]px solid var\(--ieum-dialog-accent\)/,
    )
  })

  it('does not grey out drop-downs as read-only', () => {
    // Chromium matches every <select> with :read-only.
    const readOnly = styleRules(DIALOG_THEME_CSS).filter((rule) =>
      rule.selector.endsWith(':read-only'),
    )
    expect(readOnly.length).toBeGreaterThan(0)
    expect(readOnly.filter((rule) => rule.selector.includes('select'))).toEqual([])
  })

  it('styles the shared skeleton, the memo form and the cell-properties dialog', () => {
    for (const selector of [
      '.dialog-wrap',
      '.dialog-title',
      '.dialog-tabs',
      '.dialog-btn-primary',
      '.dialog-input',
      '.field-edit-textarea',
      '.tcp-all-spinner-btn',
      '.find-dialog',
      '.find-dialog-input',
    ]) {
      expect(DIALOG_THEME_CSS).toContain(selector)
    }
    expect(DIALOG_THEME_CSS).toContain('--ieum-dialog-accent-ink: #ffffff;')
    expect(DIALOG_THEME_CSS).toContain('--ieum-dialog-accent-ink: #111a2b;')
  })
})
