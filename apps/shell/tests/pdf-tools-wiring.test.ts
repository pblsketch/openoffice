import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { pdfToolsStrings } from '../src/renderer/src/i18n/strings-pdf-tools'
import { strings as pdfEditorStrings } from '../../pdf/src/renderer/i18n/strings'
import { strings as homeStrings } from '../src/renderer/src/strings'

/**
 * The PDF tools window (decision 0030), fixed by reading the source where
 * Electron would be needed: it never reaches an AI provider, paths stay in
 * the main process, the window is sandboxed and wired once, and every string
 * exists in all 21 languages with the editor's own names for its commands.
 */

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const MODULES = [
  '../src/main/pdf-tools/tools.ts',
  '../src/main/pdf-tools/pdf-tools-window.ts',
  '../src/preload/pdf-tools.ts',
  '../src/renderer/src/pdf-tools/PdfToolsWindow.tsx',
]

describe('no AI on the PDF tools path', () => {
  it('imports nothing that talks to a provider or the AI channels', () => {
    for (const path of MODULES) {
      const text = src(path)
      expect(text, path).not.toMatch(
        /@genoffice\/ai-provider|@genoffice\/agent-core|@genoffice\/ai-search/,
      )
      expect(text, path).not.toMatch(/['"]ai:|subscription/i)
    }
  })

  it('keeps the tool logic free of Electron so tests can run it', () => {
    expect(src('../src/main/pdf-tools/tools.ts')).not.toMatch(/from 'electron'/)
  })
})

describe('paths stay in the main process', () => {
  const win = src('../src/main/pdf-tools/pdf-tools-window.ts')

  it('takes inputs only from its own open dialog and hands out ids', () => {
    expect(win).toMatch(/showOpenDialogWithMemory\(dialog, owner/)
    expect(win).toMatch(/inputs\.set\(input\.id, input\)/)
    expect(win).toMatch(/out\.inputs\.push\(\{ id: input\.id, name, pages: input\.pages, size \}\)/)
  })

  it('writes only where the save dialog points, never over a source or an unsaved open file', () => {
    expect(win).toMatch(/showSaveDialogWithMemory\(dialog, owner/)
    expect(win).toMatch(/error: 'same-as-source'/)
    expect(win).toMatch(/await fileHasUnsavedChanges\(target\)/)
  })

  it('answers only its own window, and Home only from the shell window', () => {
    const handlers = win.match(/ipcMain\.handle\(PDF_TOOLS_CHANNELS\.\w+/g) ?? []
    expect(handlers.length).toBeGreaterThanOrEqual(7)
    expect(win.match(/fromWindow\(event\)/g)!.length).toBeGreaterThanOrEqual(handlers.length)
    expect(win).toMatch(/event\.sender !== parent\.webContents/)
  })

  it('opens a picked PDF without reloading an open tab, and only its own results with a reload', () => {
    expect(win).toMatch(/deps\.openForEditing\(path\)/)
    expect(win).toMatch(/results\.get\(id\)[\s\S]*deps\?\.openResult\(path\)/)
  })
})

describe('the window and its wiring', () => {
  it('is sandboxed and isolated like every shell window', () => {
    const win = src('../src/main/pdf-tools/pdf-tools-window.ts')
    expect(win).toMatch(/contextIsolation: true/)
    expect(win).toMatch(/nodeIntegration: false/)
    expect(win).toMatch(/sandbox: true/)
    expect(win).toMatch(/safeExternalUrl\(url\)/)
  })

  it('is configured once and built as its own preload and page', () => {
    const index = src('../src/main/index.ts')
    expect(index.match(/configurePdfToolsWindow\(/g)).toHaveLength(1)
    const vite = src('../electron.vite.config.ts')
    expect(vite).toMatch(/'pdf-tools': resolve\(__dirname, 'src\/preload\/pdf-tools\.ts'\)/)
    expect(vite).toMatch(/'pdf-tools': resolve\(__dirname, 'src\/renderer\/pdf-tools\.html'\)/)
  })

  it('shares no value import between the shell preload and the window preload', () => {
    const home = src('../src/preload/index.ts')
    const window = src('../src/preload/pdf-tools.ts')
    expect(home).not.toMatch(/^import \{[^}]*\} from '\.\.\/shared\/pdf-tools-api'/m)
    expect(window).not.toMatch(/pdf-tools-home-channels/)
  })
})

describe('strings', () => {
  const keys = Object.keys(pdfToolsStrings.zh).sort()

  it('fills every key in all 21 languages', () => {
    for (const lang of LANGS) {
      const dict = (pdfToolsStrings as Record<string, Record<string, string>>)[lang]!
      expect(Object.keys(dict).sort(), lang).toEqual(keys)
      for (const key of keys) expect(dict[key]!.trim(), `${lang}.${key}`).not.toBe('')
    }
  })

  it('names each command as the PDF editor ribbon does', () => {
    const same: [string, string][] = [
      ['toolMerge', 'mergePdf'],
      ['toolSplit', 'splitPdf'],
      ['toolNup', 'mergePages'],
      ['toolReverse', 'reversePages'],
      ['toolPageSize', 'pageSize'],
    ]
    for (const lang of LANGS) {
      const ours = (pdfToolsStrings as Record<string, Record<string, string>>)[lang]!
      const editor = (pdfEditorStrings as unknown as Record<string, Record<string, string>>)[lang]!
      for (const [mine, theirs] of same) expect(ours[mine], `${lang}.${mine}`).toBe(editor[theirs])
    }
  })

  it('names no product and no teacher-only paperwork', () => {
    for (const lang of LANGS) {
      const dict = (pdfToolsStrings as Record<string, Record<string, string>>)[lang]!
      for (const value of Object.values(dict)) {
        expect(value).not.toMatch(/IeumOffice|이음오피스|GenOffice|생활기록부|학생/)
      }
    }
  })

  it('labels the Home card in all 21 languages', () => {
    for (const lang of LANGS) {
      const dict = (homeStrings as unknown as Record<string, Record<string, string>>)[lang]!
      expect(dict.pdfToolsCard, lang).toBeTruthy()
      expect(dict.pdfToolsCardSub, lang).toBeTruthy()
    }
  })
})
