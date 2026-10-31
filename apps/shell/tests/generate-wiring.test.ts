import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { generateStrings } from '../src/renderer/src/i18n/strings-generate'
import { DEFAULT_GENERATE_PROMPTS } from '../src/shared/generate-default-prompts'

/**
 * Fixed by reading the source (index.ts needs a running Electron): the
 * generate path never reaches a provider, the shell wires it once, the tab
 * manager drops an untaken request with its tab, and every string exists in
 * all 21 languages.
 */

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const GENERATE_MODULES = [
  '../src/main/generate/handoff.ts',
  '../src/main/generate/session.ts',
  '../src/main/generate/materials.ts',
  '../src/main/generate/request.ts',
  '../src/main/generate/limits.ts',
  '../src/main/generate/open-materials.ts',
  '../src/main/generate/generate-window.ts',
  '../src/preload/generate.ts',
]

describe('no AI run starts from the generate path', () => {
  it('imports nothing that talks to a provider or the AI channels', () => {
    for (const path of GENERATE_MODULES) {
      const text = src(path)
      expect(text, path).not.toMatch(
        /@genoffice\/ai-provider|@genoffice\/agent-core|@genoffice\/ai-search/,
      )
      expect(text, path).not.toMatch(/['"]ai:|subscription/i)
    }
  })

  it('keeps the logic modules free of Electron so editors and tests can import them', () => {
    for (const path of GENERATE_MODULES.slice(0, 6)) {
      expect(src(path), path).not.toMatch(/from 'electron'/)
    }
  })

  it('reads material text only through the redaction-aware reader', () => {
    const materials = src('../src/main/generate/materials.ts')
    expect(materials).toMatch(/import \{[^}]*\bparseFileToText\b[^}]*\} from '@genoffice\/file-parse'/)
    expect(materials).not.toMatch(/readFile\(/)
  })
})

describe('the shell wiring', () => {
  it('configures the window once in the main process', () => {
    const index = src('../src/main/index.ts')
    expect(index.match(/configureGenerateWindow\(/g)).toHaveLength(1)
    expect(index).toMatch(/openGenerateTargetTab\(handoff\)/)
  })

  it('drops a request with the tab that never took it', () => {
    const tabs = src('../src/main/tab-manager.ts')
    const removeTab = tabs.slice(tabs.indexOf('private removeTab('))
    expect(removeTab.slice(0, removeTab.indexOf('\n  }\n'))).toMatch(/dropGenerateHandoff\(/)
    expect(tabs).toMatch(/queueGenerateHandoffFor\(contents, handoff\)/)
  })

  it('keeps the two preloads from sharing a value module (a shared chunk breaks a sandboxed preload)', () => {
    const valueImports = (text: string) =>
      [...text.matchAll(/^import (?!type )[^\n]*from '(\.[^']+)'/gm)].map((m) => m[1])
    const index = valueImports(src('../src/preload/index.ts'))
    const generate = valueImports(src('../src/preload/generate.ts'))
    expect(index.filter((path) => generate.includes(path))).toEqual([])
  })

  it('bundles the window’s own preload and page', () => {
    const config = src('../electron.vite.config.ts')
    expect(config).toMatch(/generate: resolve\(__dirname, 'src\/preload\/generate\.ts'\)/)
    expect(config).toMatch(/generate: resolve\(__dirname, 'src\/renderer\/generate\.html'\)/)
  })
})

describe('generate strings', () => {
  const keys = Object.keys(generateStrings.zh).sort()

  it('fills every key in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      const dict = generateStrings[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual(keys)
      for (const key of keys) expect(dict[key].trim(), `${lang}.${key}`).not.toBe('')
    }
  })

  it('translates rather than copying English', () => {
    const en = generateStrings.en as Record<string, string>
    for (const lang of LANGS) {
      if (lang === 'en') continue
      const dict = generateStrings[lang] as Record<string, string>
      const same = keys.filter((k) => dict[k] === en[k])
      expect(same.length, `${lang}: ${same.join(', ')}`).toBeLessThanOrEqual(2)
    }
  })

  it('never types the product name', () => {
    const all = JSON.stringify([generateStrings, DEFAULT_GENERATE_PROMPTS])
    expect(all).not.toMatch(/IeumOffice|이음오피스|GenOffice/)
  })

  it('has a default request per kind in every language', () => {
    for (const lang of LANGS) {
      for (const kind of ['slides', 'html', 'mindmap'] as const) {
        const text = DEFAULT_GENERATE_PROMPTS[lang][kind]
        expect(text.trim(), `${lang}.${kind}`).not.toBe('')
        if (lang !== 'en')
          expect(text, `${lang}.${kind}`).not.toBe(DEFAULT_GENERATE_PROMPTS.en[kind])
      }
    }
  })
})
