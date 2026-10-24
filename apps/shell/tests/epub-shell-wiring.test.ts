import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { strings } from '../src/renderer/src/strings'

/**
 * The EPUB editor is hosted like the mind map editor: every place the shell
 * routes, lists, menus and serves an editor has a book entry. The main entry
 * (src/main/index.ts) and Home.tsx cannot be imported in a node test, so their
 * lists and wiring are read out of the source, as odt-shell-wiring.test.ts does.
 */
const main = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
const home = readFileSync(join(__dirname, '../src/renderer/src/Home.tsx'), 'utf8')

/** the declaration `const NAME …` up to the blank line that ends it */
function literal(source: string, name: string): string {
  const start = source.indexOf(`const ${name}`)
  if (start < 0) throw new Error(`no ${name}`)
  const end = source.indexOf('\n\n', start)
  return source.slice(start, end < 0 ? undefined : end)
}

/** a function's source, from `function NAME(` to the next top-level function */
function fnSource(name: string): string {
  const start = main.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`no ${name}`)
  const end = main.indexOf('\nfunction ', start + 1)
  return main.slice(start, end < 0 ? undefined : end)
}

/** one locale's slice of the main-process table */
function localeBlock(locale: string): string {
  const head = locale.includes('-') ? `'${locale}'` : locale
  const start = main.indexOf(`\n  ${head}: {\n`)
  if (start < 0) throw new Error(`no ${locale} block`)
  const rest = main.slice(start + 1)
  const end = rest.search(/\n {2}\S+: \{/)
  return end < 0 ? rest : rest.slice(0, end)
}

describe('opening a book', () => {
  it('routes .epub to a book tab, and an open book to its tab', () => {
    const route = fnSource('routeDocumentPath')
    expect(route).toContain('if (EPUB_RE.test(filePath)) {')
    expect(route).toContain('tabManager.findEpubTabByPath(filePath)')
    expect(route).toContain('tabManager.openEpubTab(filePath)')
  })

  it('offers .epub in the open dialog with its own filter', () => {
    expect(literal(main, 'OPEN_DIALOG_EXTENSIONS')).toContain("'epub'")
    expect(main).toContain("{ name: tm('filterEpub'), extensions: ['epub'] },")
  })

  it('follows a rename into the book tab', () => {
    expect(fnSource('afterFileMoved')).toContain(
      "else if (t.kind === 'epub') epubFileRenamed(t.webContents, oldPath, newPath)",
    )
  })

  it('keeps the tab title, recents and the path in step with a Save As', () => {
    const at = main.indexOf('setEpubFileSavedHook((wc, path) => {')
    expect(at).toBeGreaterThan(0)
    const hook = main.slice(at, main.indexOf('\n  })', at))
    expect(hook).toContain('manager.setTabFileFor(wc.id, path)')
    expect(hook).toContain('detachedSetFileFor(wc.id, path)')
    expect(hook).toContain('recordRecentFile(path)')
  })
})

describe('the book editor runtime', () => {
  it('is configured with the shell’s data folder, job migration and open-tab check', () => {
    const at = main.indexOf('configureEpubRuntime({')
    const config = main.slice(at, main.indexOf('\n})', at))
    expect(config).toContain("preloadPath: join(EPUB_OUT, 'preload', 'index.js')")
    expect(config).toContain('rendererUrl: process.env.EPUB_RENDERER_URL')
    expect(config).toContain("rendererFile: join(EPUB_OUT, 'renderer', 'index.html')")
    expect(config).toContain("userDataDir: () => app.getPath('userData')")
    expect(config).toContain('migrateJobRecords,')
    expect(config).toContain('isPathOpenInTab: (path) => isPathOpenInAnyTab(path)')
    expect(main).toContain("import { migrateJobRecords } from './pdf-structure/job-migration'")
  })

  it('asks every tab and detached window whether a path is open', () => {
    const check = fnSource('isPathOpenInAnyTab')
    expect(check).toContain('tabManager?.openFilePaths()')
    expect(check).toContain('detachedFilePaths()')
    expect(check).toContain('canonicalPath')
  })

  it('registers the asset scheme in the single privileged-scheme call, before ready', () => {
    expect(main.match(/registerPrivilegedSchemes\(\[/g)).toHaveLength(1)
    expect(main).toContain('registerPrivilegedSchemes([EPUB_ASSET_SCHEME_PRIVILEGE])')
    expect(main.indexOf('registerPrivilegedSchemes([')).toBeLessThan(
      main.indexOf('app.whenReady().then(async () => {'),
    )
  })

  it('serves the renderer and the book assets after ready', () => {
    const ready = main.slice(main.indexOf('app.whenReady().then(async () => {'))
    expect(ready).toContain("epub: join(EPUB_OUT, 'renderer'),")
    expect(ready.indexOf('registerEpubAssetProtocol()')).toBeGreaterThan(0)
    expect(ready.indexOf('registerEpubAssetProtocol()')).toBeLessThan(
      ready.indexOf('if (headlessArgv.kind'),
    )
  })

  it('lets the in-app MCP server read and save an open book', () => {
    expect(main).toMatch(/epub: \{\s*read: epubReadText,\s*save: epubSaveToPath,\s*\}/)
  })
})

describe('the book menu', () => {
  const menu = fnSource('buildEpubMenu')

  it('is the application menu of a book tab', () => {
    expect(fnSource('applyMenuFor')).toMatch(/case 'epub':\s*buildEpubMenu\(\)/)
  })

  it('saves and saves as through the editor', () => {
    expect(menu).toContain("requestEpubSave(tab.webContents, 'save')")
    expect(menu).toContain("requestEpubSave(tab.webContents, 'saveAs')")
  })

  it('sends every editor command to the book', () => {
    for (const command of [
      'undo',
      'redo',
      'find',
      'replace',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'translate-book',
    ]) {
      expect(menu, command).toContain(`'${command}')`)
    }
    expect(menu).toContain('sendEpubMenuCommand(tab.webContents, command)')
  })

  it('offers no new book: a book is always a file', () => {
    expect(menu).not.toContain('menuSectionNew')
  })

  it('names its items and the dialog filter in every language', () => {
    expect(LANGS).toHaveLength(21)
    const keys = ['filterEpub', 'menuFind', 'menuReplace', 'menuTranslateBook']
    const english = localeBlock('en')
    const valueIn = (block: string, key: string) =>
      block.match(new RegExp(`\\n {4}${key}: '([^']*)'`))?.[1]
    expect(valueIn(english, 'filterEpub')).toBe('E-books (EPUB)')
    expect(valueIn(english, 'menuTranslateBook')).toBe('Translate Book…')
    expect(valueIn(localeBlock('ko'), 'filterEpub')).toBe('전자책 (EPUB)')
    expect(valueIn(localeBlock('ko'), 'menuTranslateBook')).toBe('책 번역…')
    for (const lang of LANGS) {
      const block = localeBlock(lang)
      for (const key of keys) {
        const value = valueIn(block, key)
        expect(value, `${lang} ${key}`).toBeTruthy()
        if (lang !== 'en') expect(value, `${lang} ${key}`).not.toBe(valueIn(english, key))
      }
      expect(valueIn(block, 'filterEpub'), lang).toMatch(/\(EPUB\)$/)
    }
  })
})

describe('the home screen', () => {
  it('lists, filters and draws books, and makes no new one', () => {
    expect(literal(home, 'OPEN_LOCAL_EXTENSIONS')).toContain('.epub')
    expect(literal(home, 'FILE_ICONS')).toContain('epub: iconEpub')
    expect(literal(home, 'FILTERS')).toContain("{ key: 'epub', label: 'filterEpub' }")
    expect(home).not.toMatch(/newEpub/)
    for (const lang of Object.keys(strings) as Array<keyof typeof strings>) {
      expect(strings[lang].filterEpub).toBe('EPUB')
    }
  })
})
