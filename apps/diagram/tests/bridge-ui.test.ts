// @vitest-environment node
// The bridge's own rules inside draw.io: what counts as a change (page
// switches do not), which link clicks go to the host and only once, F1, and
// that every item draw.io's File menu shows in the tab either works or is
// hidden (read from the built bundle when there is one).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isViewOnlyEdit, lastContentEdit } from '../src/bridge/dirty'
import { clickedLinkUrl, createLinkGate, isInPageHref } from '../src/bridge/link-clicks'
import { isHelpKey } from '../src/bridge/shortcuts'
import {
  HIDDEN_ACTIONS,
  HIDDEN_SUBMENUS,
  REDIRECTED_ACTIONS,
  drawioStartUrl,
} from '../src/shared/drawio-start'

describe('what counts as a change', () => {
  const content = (name: string) => ({ name, changes: [{}] })
  const pageSwitch = (name: string) => ({ name, changes: [{}], ignoreEdit: true })

  it('skips the steps draw.io marks as view-only (showing another page)', () => {
    expect(isViewOnlyEdit(pageSwitch('s'))).toBe(true)
    expect(isViewOnlyEdit(content('a'))).toBe(false)
    expect(isViewOnlyEdit(null)).toBe(false)
  })

  it('finds the newest content step at the undo position', () => {
    const a = content('a')
    const s1 = pageSwitch('s1')
    const b = content('b')
    const s2 = pageSwitch('s2')
    expect(lastContentEdit({ history: [], indexOfNextAdd: 0 })).toBeNull()
    expect(lastContentEdit({ history: [s1], indexOfNextAdd: 1 })).toBeNull()
    expect(lastContentEdit({ history: [a, s1], indexOfNextAdd: 2 })).toBe(a)
    expect(lastContentEdit({ history: [a, s1, b, s2], indexOfNextAdd: 4 })).toBe(b)
    // undone steps (past the position) do not count
    expect(lastContentEdit({ history: [a, s1, b, s2], indexOfNextAdd: 2 })).toBe(a)
    expect(lastContentEdit(null)).toBeNull()
  })

  it('keeps a diagram clean across page switches and their undo, dirty after a real change', () => {
    // the bridge compares the content step now with the one at the last save
    const a = content('a')
    const history: unknown[] = [a]
    const manager = { history, indexOfNextAdd: 1 }
    const saved = lastContentEdit(manager)
    history.push(pageSwitch('s'))
    manager.indexOfNextAdd = 2
    expect(lastContentEdit(manager)).toBe(saved)
    manager.indexOfNextAdd = 1 // undo the switch
    expect(lastContentEdit(manager)).toBe(saved)
    manager.indexOfNextAdd = 0 // undo the change itself
    expect(lastContentEdit(manager)).not.toBe(saved)
    history.splice(0, history.length, content('c'))
    manager.indexOfNextAdd = 1
    expect(lastContentEdit(manager)).not.toBe(saved)
  })
})

describe('link clicks', () => {
  const base = 'drawio-app://editor/index.html?embed=1'

  it('hands web and mail links to the host, nothing else', () => {
    expect(clickedLinkUrl('https://example.com/a?b=1', base)).toBe('https://example.com/a?b=1')
    expect(clickedLinkUrl('http://example.com', base)).toBe('http://example.com/')
    expect(clickedLinkUrl('mailto:someone@example.com', base)).toBe('mailto:someone@example.com')
    expect(clickedLinkUrl('file:///C:/Windows/System32/calc.exe', base)).toBeNull()
    expect(clickedLinkUrl('data:page/id,pg2', base)).toBeNull()
    expect(clickedLinkUrl('shortcuts.svg', base)).toBeNull()
    expect(clickedLinkUrl('http://[bad', base)).toBeNull()
  })

  it('leaves in-page anchors and script links to draw.io', () => {
    expect(isInPageHref('', base)).toBe(true)
    expect(isInPageHref('#top', base)).toBe(true)
    expect(isInPageHref('javascript:void(0);', base)).toBe(true)
    expect(isInPageHref('index.html?x=1', base)).toBe(true)
    expect(isInPageHref('https://example.com', base)).toBe(false)
    expect(isInPageHref('data:action/json,{}', base)).toBe(false)
  })

  it('passes one link once per click, however many ways the click arrives', () => {
    let now = 0
    const gate = createLinkGate(1000, () => now)
    expect(gate('https://a.example/')).toBe(true)
    now = 50
    expect(gate('https://a.example/')).toBe(false)
    expect(gate('https://b.example/')).toBe(true)
    now = 2000
    expect(gate('https://b.example/')).toBe(true)
  })
})

describe('F1', () => {
  const key = (
    k: string,
    mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  })
  it('is the help key on its own', () => {
    expect(isHelpKey(key('F1'))).toBe(true)
    expect(isHelpKey(key('F1', { ctrlKey: true }))).toBe(false)
    expect(isHelpKey(key('F2'))).toBe(false)
  })
})

// ---- draw.io's File menu in the tab, read from the built bundle ----

const bundle = join(__dirname, '../out/drawio/js/app.min.js')

/** draw.io items the tab keeps because they work there as they are. */
const WORKING = new Set([
  'importFrom', // Device… (draw.io's own file chooser); Browser… is off (`browser=0`)
  'exportAs',
  'pageSetup',
  'keyboardShortcuts',
])

/** draw.io items its code adds only in modes the tab never starts in. */
const NOT_IN_THIS_START = new Set([
  'newLibrary', // `libraries=1`
  'openLibraryFrom', // `libraries=1`
  'saveAndExit', // `saveAndExit=0`
  'exit', // `noExitBtn=1`
])

/** The quoted item names in `addMenuItems`/`addMenuItem`/`addSubmenu` calls of a piece of draw.io's code. */
function itemNames(code: string): string[] {
  const names = new Set<string>()
  for (const call of code.matchAll(/add(?:MenuItems|MenuItem|Submenu)\(([^)]*)\)/g)) {
    for (const quoted of call[1]!.matchAll(/"([^"]+)"/g)) {
      for (const name of quoted[1]!.split(' ')) if (/^[a-zA-Z]+$/.test(name)) names.add(name)
    }
  }
  return [...names]
}

describe.skipIf(!existsSync(bundle))('draw.io File menu in the tab (built bundle)', () => {
  const code = existsSync(bundle) ? readFileSync(bundle, 'utf8') : ''
  const accounted = new Set<string>([
    ...Object.keys(REDIRECTED_ACTIONS),
    ...HIDDEN_ACTIONS,
    ...HIDDEN_SUBMENUS,
    ...WORKING,
    ...NOT_IN_THIS_START,
  ])
  const menuBody = (name: string, end: string): string => {
    const marker = new RegExp(`this\\.put\\("${name}",\\s*new Menu\\(`, 'g')
    const start = [...code.matchAll(marker)].pop()?.index ?? -1
    expect(start).toBeGreaterThan(0)
    const stop = code.indexOf(end, start)
    expect(stop).toBeGreaterThan(start)
    return code.slice(start, stop)
  }

  it('every embed File menu item works in the app or is hidden', () => {
    const file = menuBody('file', 'else if(G)')
    const names = itemNames(file)
    expect(names).toEqual(expect.arrayContaining(['importFrom', 'exportAs', 'print', 'save']))
    expect(names.filter((name) => !accounted.has(name))).toEqual([])
  })

  it('every Export as item works in the app or is hidden', () => {
    const exportAs = menuBody('exportAs', 'this.put("importFrom"')
    const names = itemNames(exportAs)
    expect(names).toEqual(
      expect.arrayContaining(['exportPng', 'exportSvg', 'exportPdf', 'exportJpg']),
    )
    expect(names.filter((name) => !accounted.has(name))).toEqual([])
  })

  it('Import from › Browser is off in the tab', () => {
    expect(code).toContain(
      'isLocalStorage&&"0"!=urlParams.browser&&p.addItem(mxResources.get("browser")',
    )
    expect(new URL(drawioStartUrl({ lang: 'en', dark: false })).searchParams.get('browser')).toBe(
      '0',
    )
  })
})
