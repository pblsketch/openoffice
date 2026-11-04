import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { RECOVERY_EDITOR_KINDS } from '@genoffice/electron-utils'
import { strings } from '../src/renderer/src/strings'
import { OFFICE_TYPES } from '../src/main/default-app'
import { RECOVERY_LIST_EDITOR_KINDS } from '../src/shared/recovery-list-api'
import { HOME_CHANNELS } from '../src/shared/home-api'
import { HOME_KINDS } from '../src/shared/home-kinds'

/**
 * The diagram editor is hosted like the mind map editor: every place the
 * shell routes, lists, menus, serves and restores an editor has a diagram
 * entry. The main entry (src/main/index.ts) and the Home screen cannot be
 * imported in a node test, so their lists and wiring are read out of the
 * source, as epub-shell-wiring.test.ts does.
 */
const main = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
const home = readFileSync(join(__dirname, '../src/renderer/src/Home.tsx'), 'utf8')
const preload = readFileSync(join(__dirname, '../src/preload/index.ts'), 'utf8')
const homeKindsSetting = readFileSync(
  join(__dirname, '../src/renderer/src/SettingsHomeKinds.tsx'),
  'utf8',
)
const sessionRecord = readFileSync(join(__dirname, '../src/main/session-record.ts'), 'utf8')
const recoveryList = readFileSync(join(__dirname, '../src/renderer/src/RecoveryList.tsx'), 'utf8')

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

const valueIn = (block: string, key: string) =>
  block.match(new RegExp(`\\n {4}${key}: '([^']*)'`))?.[1]

describe('opening a diagram', () => {
  it('routes diagrams to a diagram tab, and an open one (or its Visio source) to its tab', () => {
    const route = fnSource('routeDocumentPath')
    expect(route).toContain('if (DIAGRAM_RE.test(filePath)) {')
    expect(route).toContain('tabManager.findDiagramTabByPath(filePath)')
    expect(route).toContain('tabManager.openDiagramTab(path)')
  })

  it('checks a diagram before its tab opens: a broken file gets only the reason (spec 3.1, 3.5)', () => {
    const route = fnSource('routeDocumentPath')
    const branch = route.slice(route.indexOf('if (DIAGRAM_RE.test(filePath)) {'))
    // every open path routes here; the tab opens only through the checked gate
    expect(branch).toContain('return openDiagramChecked(filePath, {')
    expect(branch).not.toContain('tabManager.openDiagramTab(filePath)')
    expect(branch).toContain(
      'refusal: (path) => diagramOpenRefusal(path, { hasRecoveryCopy: diagramHasRecoveryCopy }),',
    )
    expect(branch).toContain('visioRefusal: (path) => visioOpenRefusal(path),')
    expect(branch).toContain('warn: (message, path) => showAppWarning(message, basename(path)),')
    // a refused file is not put in Recent: only the open (or an open tab) records it
    const beforeGate = branch.slice(0, branch.indexOf('return openDiagramChecked'))
    expect(beforeGate.match(/recordRecentFile\(/g)).toHaveLength(1)
    expect(beforeGate).toContain('if (existing) {')
  })

  it('closes a tab whose Visio import failed and shows the reason as an app warning', () => {
    const at = main.indexOf('setDiagramOpenFailedHook((wc, message) => {')
    expect(at).toBeGreaterThan(0)
    const hook = main.slice(at, main.indexOf('\n  })', at))
    expect(hook).toContain('manager.tabIdForWebContents(wc.id)')
    expect(hook).toContain('detachedDocumentFor(wc.id)?.id')
    expect(hook).toContain('manager.closeTabWithoutPrompt(tabId)')
    expect(hook).toContain('closeDetachedWithoutPrompt(detachedId)')
    expect(hook).toContain('showAppWarning(message)')
    expect(hook).toContain('return true')
  })

  it('offers every diagram form in the open dialog, with its own filter', () => {
    const extensions = literal(main, 'OPEN_DIALOG_EXTENSIONS')
    for (const ext of ['drawio', 'dio', 'drawio.svg', 'drawio.png', 'vsdx']) {
      expect(extensions, ext).toContain(`'${ext}'`)
    }
    // a plain picture stays out of the supported list
    expect(extensions).not.toContain("'svg'")
    expect(extensions).not.toContain("'png'")
    expect(main).toContain("name: tm('filterDiagram'),")
    expect(main).toContain("extensions: ['drawio', 'dio', 'drawio.svg', 'drawio.png', 'vsdx'],")
  })

  it('follows a rename into the diagram tab', () => {
    expect(fnSource('afterFileMoved')).toContain(
      "else if (t.kind === 'diagram') diagramFileRenamed(t.webContents, oldPath, newPath)",
    )
  })

  it('keeps the tab title, recents and the path in step with a first save or Save As', () => {
    const at = main.indexOf('setDiagramFileSavedHook((wc, path) => {')
    expect(at).toBeGreaterThan(0)
    const hook = main.slice(at, main.indexOf('\n  })', at))
    expect(hook).toContain('manager.setTabFileFor(wc.id, path)')
    expect(hook).toContain('detachedSetFileFor(wc.id, path)')
    expect(hook).toContain('recordRecentFile(path)')
    expect(hook).toContain('applyPendingDir(wc.id, path)')
  })

  it("opens the app's manual at the diagram topic from draw.io's Help", () => {
    const at = main.indexOf('setDiagramHelpHook(')
    expect(at).toBeGreaterThan(0)
    const hook = main.slice(at, main.indexOf('\n  })', at))
    expect(hook).toContain("tabManager?.openHelpTab('diagram')")
  })

  it('names an untitled diagram tab from the first AI request, as the mind map does', () => {
    const at = main.indexOf('setDiagramProvisionalTitleHook((wc, title) => {')
    expect(at).toBeGreaterThan(0)
    const hook = main.slice(at, main.indexOf('\n  })', at))
    expect(hook).toContain('manager.setTabTitleFor(wc.id, title)')
    expect(hook).toContain('detachedSetTitleFor(wc.id, title)')
  })
})

describe('the in-app MCP server', () => {
  it('reads and saves open diagrams through the editor, and drives the two diagram tools', () => {
    expect(main).toContain('diagram: { read: diagramReadText, save: diagramSaveToPath },')
    const at = main.indexOf('diagramControl: createDiagramControl({')
    expect(at).toBeGreaterThan(0)
    const control = main.slice(at, main.indexOf('\n    }),', at))
    // a restored tab is loaded first, as for every other open-document tool
    expect(control).toContain('webContentsFor: (tabId) => liveDocumentContents(tabId)')
    expect(control).toContain('readPage: diagramReadPage')
    expect(control).toContain('applyOps: diagramApplyOps')
  })
})

describe('the diagram editor runtime', () => {
  it('is configured with the module paths, the draw.io bundle and the project folder', () => {
    const at = main.indexOf('configureDiagramRuntime({')
    const config = main.slice(at, main.indexOf('\n})', at))
    expect(config).toContain("preloadPath: join(DIAGRAM_OUT, 'preload', 'index.js')")
    expect(config).toContain('rendererUrl: process.env.DIAGRAM_RENDERER_URL')
    expect(config).toContain("rendererFile: join(DIAGRAM_OUT, 'renderer', 'index.html')")
    expect(config).toContain("drawioDir: join(DIAGRAM_OUT, 'drawio')")
    expect(config).toContain("bridgeFile: join(DIAGRAM_OUT, 'bridge', 'bridge.js')")
    expect(config).toContain('packaged: app.isPackaged')
    expect(config).toContain('newDocumentDir: (id) => newDocumentFolderFor(id)')
    expect(literal(main, 'DIAGRAM_OUT')).toContain(
      "join(process.resourcesPath, 'modules', 'diagram')",
    )
  })

  it('registers the draw.io scheme in the single privileged-scheme call, before ready', () => {
    expect(main.match(/registerPrivilegedSchemes\(\[/g)).toHaveLength(1)
    expect(main).toContain(
      'registerPrivilegedSchemes([EPUB_ASSET_SCHEME_PRIVILEGE, DRAWIO_SCHEME_PRIVILEGE])',
    )
    expect(main.indexOf('configureDiagramRuntime({')).toBeLessThan(
      main.indexOf('app.whenReady().then(async () => {'),
    )
    // the standalone registration would be a second call in the same process
    expect(main).not.toContain('registerDiagramPrivilegedSchemes')
  })

  it('serves the editor page from the default session after ready', () => {
    const ready = main.slice(main.indexOf('app.whenReady().then(async () => {'))
    expect(ready).toContain("diagram: join(DIAGRAM_OUT, 'renderer'),")
  })

  it('keeps recovery copies and the session record for diagram tabs (decision 0061)', () => {
    expect(RECOVERY_EDITOR_KINDS).toContain('diagram')
    expect(RECOVERY_LIST_EDITOR_KINDS).toContain('diagram')
    expect(literal(sessionRecord, 'DOCUMENT_KINDS')).toContain("'diagram'")
    expect(literal(recoveryList, 'KIND_ICONS')).toContain('diagram: iconDiagram')
    expect(literal(recoveryList, 'KIND_LABELS')).toContain("diagram: 'filterDiagram'")
  })
})

describe('the diagram menu', () => {
  const menu = fnSource('buildDiagramMenu')

  it('is the application menu of a diagram tab', () => {
    expect(fnSource('applyMenuFor')).toMatch(/case 'diagram':\s*buildDiagramMenu\(\)/)
  })

  it('makes a new diagram, saves and saves as through the editor', () => {
    expect(menu).toContain('click: () => newDiagramTab()')
    expect(menu).toContain("requestDiagramSave(tab.webContents, 'save')")
    expect(menu).toContain("requestDiagramSave(tab.webContents, 'saveAs')")
  })

  it('exports PNG, SVG and PDF and prints through the editor', () => {
    expect(menu).toContain("exportItem(tm('menuExportMapImage'), 'png')")
    expect(menu).toContain("exportItem(tm('menuExportSvg'), 'svg')")
    expect(menu).toContain("exportItem(tm('menuExportPdf'), 'pdf')")
    expect(menu).toContain('sendDiagramExportRequest(tab.webContents, format)')
    expect(menu).toContain('sendDiagramPrintRequest(tab.webContents)')
  })

  it('sends every editor command to the diagram', () => {
    for (const command of [
      'undo',
      'redo',
      'find',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'zoom-fit',
    ]) {
      expect(menu, command).toContain(`'${command}')`)
    }
    expect(menu).toContain('sendDiagramMenuCommand(tab.webContents, command)')
  })

  it('offers a new diagram from the tab strip and the home menu', () => {
    // the tab strip's "+" menu and home's File menu both list NEW_KIND_MENU in home's order
    expect(main).toContain(
      "drawio: { label: 'menuNewDiagram', icon: 'diagram', open: () => newDiagramTab() },",
    )
    expect(HOME_KINDS).toContain('drawio')
    expect(main).toContain('diagram: loadMenuIcon(menuDiagramIcon1x, menuDiagramIcon2x)')
  })

  it('names its items, the untitled tab and the dialog filter in every language', () => {
    expect(LANGS).toHaveLength(21)
    const keys = [
      'filterDiagram',
      'untitledDiagram',
      'menuNewDiagram',
      'menuExportSvg',
      'menuZoomFit',
    ]
    const english = localeBlock('en')
    expect(valueIn(english, 'filterDiagram')).toBe('Diagrams (draw.io, VSDX)')
    expect(valueIn(english, 'untitledDiagram')).toBe('Untitled Diagram')
    expect(valueIn(localeBlock('ko'), 'menuNewDiagram')).toBe('다이어그램')
    expect(valueIn(localeBlock('ko'), 'untitledDiagram')).toBe('제목 없는 다이어그램')
    for (const lang of LANGS) {
      const block = localeBlock(lang)
      for (const key of keys) expect(valueIn(block, key), `${lang} ${key}`).toBeTruthy()
      expect(valueIn(block, 'filterDiagram'), lang).toMatch(/\(draw\.io, VSDX\)$/)
      if (lang !== 'en') {
        expect(valueIn(block, 'untitledDiagram'), lang).not.toBe('Untitled Diagram')
        expect(valueIn(block, 'menuZoomFit'), lang).not.toBe('Fit to Window')
      }
    }
  })
})

describe('the home screen', () => {
  it('lists, filters and draws diagrams', () => {
    const formats = literal(home, 'OPEN_LOCAL_EXTENSIONS')
    for (const ext of ['.drawio', '.dio', '.drawio.svg', '.drawio.png', '.vsdx']) {
      expect(formats, ext).toContain(ext)
    }
    const icons = literal(home, 'FILE_ICONS')
    for (const ext of ['drawio', 'dio', "'drawio.svg'", "'drawio.png'", 'vsdx']) {
      expect(icons, ext).toContain(`${ext}: iconDiagram`)
    }
    expect(literal(home, 'FILTERS')).toContain("{ key: 'drawio', label: 'filterDiagram' }")
    expect(literal(home, 'FILTER_FAMILY')).toContain(
      "drawio: ['drawio', 'dio', 'drawio.svg', 'drawio.png', 'vsdx'],",
    )
  })

  it('makes a new, untitled diagram from its tile', () => {
    expect(home).toContain('drawio: () => window.aiOffice.newDiagram(newFileOpts),')
    expect(homeKindsSetting).toContain("drawio: { title: 'newDiagram', sub: '.drawio' },")
    expect(HOME_CHANNELS.newDiagram).toBe('home:new-diagram')
    expect(preload).toContain('ipcRenderer.invoke(HOME_CHANNELS.newDiagram, opts)')
    const at = main.indexOf('ipcMain.handle(HOME_CHANNELS.newDiagram')
    expect(at).toBeGreaterThan(0)
    expect(main.slice(at, main.indexOf('\n  })', at))).toContain('newDiagramTab()')
    expect(fnSource('newDiagramTab')).toContain(
      "bindPendingDir('diagram', tabManager?.openDiagramTab())",
    )
  })

  it('names the tile and the filter in every language', () => {
    for (const lang of Object.keys(strings) as Array<keyof typeof strings>) {
      expect(strings[lang].newDiagram, lang).toBeTruthy()
      expect(strings[lang].filterDiagram, lang).toBe(strings[lang].newDiagram)
    }
    expect(strings.ko.newDiagram).toBe('다이어그램')
    expect(strings.en.newDiagram).toBe('Diagram')
  })
})

describe('the default-app list', () => {
  it('offers .drawio and .dio under the ProgId the installer registers', () => {
    for (const ext of ['drawio', 'dio']) {
      expect(
        OFFICE_TYPES.find((type) => type.ext === ext),
        ext,
      ).toMatchObject({
        uti: 'com.jgraph.drawio',
        mime: 'application/vnd.jgraph.mxfile',
        progId: 'IeumOffice.Diagram',
      })
    }
    expect(OFFICE_TYPES.map((type) => type.ext)).not.toContain('vsdx')
  })
})
