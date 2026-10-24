import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The split-view wiring lives in src/main/index.ts, which can only be imported
 * under a running Electron — so the wiring is pinned by reading the source, the
 * same way main-locale-tables.test.ts and subscription-lifetime.test.ts do.
 * These checks cover what the sibling tasks rely on the shell to provide: the
 * menu entries and their 21 languages, the drag zones and intents (T1/T2), the
 * launch restore (T3), the pane-role channels (T1/T6/T8-T10) and the
 * same-document save probe (T4/T11-T13).
 */
const source = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
const tabManagerSource = readFileSync(join(__dirname, '../src/main/tab-manager.ts'), 'utf8')
const recoveryShellSource = readFileSync(join(__dirname, '../src/main/recovery-shell.ts'), 'utf8')

/** One locale's slice of the inline table, from its `xx: {` header to the next. */
function localeBlock(locale: string): string {
  const start = source.search(new RegExp(`\\n {2}${locale}: \\{`))
  if (start < 0) throw new Error(`no ${locale} block in the main-process locale table`)
  const rest = source.slice(start + 1)
  const end = rest.search(/\n {2}\S+: \{/)
  return end < 0 ? rest : rest.slice(0, end)
}

const LOCALES = [
  'zh',
  'en',
  'vi',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'th',
  'id',
  'ru',
  'ar',
  'pt',
  'it',
  'pl',
  'cs',
  'nl',
  'ms',
  'he',
  'hi',
  "'zh-TW'",
]

const MENU_KEYS = ['menuSplitRight', 'menuSplitDown', 'menuUnsplit']

describe('the tab context menu split entries', () => {
  const valueIn = (locale: string, key: string): string => {
    const value = localeBlock(locale).match(new RegExp(`\\n {4}${key}: '([^']*)'`))?.[1]
    if (value === undefined) throw new Error(`no ${key} in the ${locale} block`)
    return value
  }

  it.each(LOCALES)('are all present in the %s block', (locale) => {
    for (const key of MENU_KEYS) expect(valueIn(locale, key).length, key).toBeGreaterThan(0)
  })

  it('are translated: no locale but English carries the English text', () => {
    for (const key of MENU_KEYS) {
      const english = valueIn('en', key)
      for (const locale of LOCALES) {
        if (locale === 'en') continue
        expect(valueIn(locale, key), `${key} in ${locale}`).not.toBe(english)
      }
    }
  })

  it('read as written in Korean and English', () => {
    expect(valueIn('ko', 'menuSplitRight')).toBe('오른쪽에 나누기')
    expect(valueIn('ko', 'menuSplitDown')).toBe('아래에 나누기')
    expect(valueIn('ko', 'menuUnsplit')).toBe('나누기 풀기')
    expect(valueIn('en', 'menuSplitRight')).toBe('Split Right')
    expect(valueIn('en', 'menuSplitDown')).toBe('Split Down')
    expect(valueIn('en', 'menuUnsplit')).toBe('Unsplit')
  })

  it('apply the drag rules to the clicked tab (T1 decideSplitDrop -> T2 splitWith)', () => {
    expect(source).toMatch(/split: tabManager\.splitState\(\)/)
    expect(source).toMatch(/isPaneTab: tabManager\.isPaneTab\(id\)/)
    expect(source).toMatch(/const intent = decideSplitDrop\(\{/)
    expect(source).toMatch(/if \(intent\) tabManager\.splitWith\(id, intent\)/)
    expect(source).toMatch(/\(tabManager\.isPaneTab\(id\)/)
    expect(source).toMatch(/tabManager\?\.unsplit\(\)/)
  })

  it('stay off Home, the manual and chrome-free Present tabs', () => {
    // Home returns before the menu is built; Present is excluded by canDetachTab
    expect(source).toMatch(/tab\.kind === 'home'\) return/)
    expect(source).toMatch(/canDetachTab\(id\) && tab\.kind !== 'help'/)
  })
})

describe('the split and pane-role channels', () => {
  it('are registered next to the tab IPC', () => {
    expect(source).toMatch(/registerTabsIpc\(\)\s*registerSplitIpc\(\)/)
  })

  it('serve the strip split state and the divider ratio', () => {
    expect(source).toMatch(
      /ipcMain\.handle\(SPLIT_TABS_CHANNELS\.get, \(\) => tabManager\?\.splitState\(\) \?\? null\)/,
    )
    expect(source).toMatch(
      /if \(typeof ratio === 'number' && Number\.isFinite\(ratio\)\) tabManager\?\.setSplitRatio\(ratio\)/,
    )
  })

  it('serve the pane-role bridge by sender webContents', () => {
    expect(source).toMatch(
      /SPLIT_PANE_CHANNELS\.getRole,\s*\(event\) => tabManager\?\.splitRoleOf\(event\.sender\.id\) \?\? null/,
    )
    expect(source).toMatch(/SPLIT_PANE_CHANNELS\.requestFocus/)
    expect(source).toMatch(/SPLIT_PANE_CHANNELS\.reportFocus/)
    // both the rail click and the fallback ping reach the same focus mover
    const focusCalls = source.match(/focusPaneByWebContents\(event\.sender\.id\)/g) ?? []
    expect(focusCalls.length).toBe(2)
  })

  it('push a role to every tab view on each split change', () => {
    expect(source).toMatch(
      /wc\.send\(SPLIT_PANE_CHANNELS\.roleChanged, manager\.splitRoleOf\(wc\.id\)\)/,
    )
    expect(source).toMatch(/for \(const tab of manager\.list\(\)\)/)
    expect(source).toMatch(/manager\.webContentsForTab\(tab\.id\)/)
    // the manager's onSplitChanged slot is the trigger
    expect(source).toMatch(/\(state\) => handleSplitChanged\(win, manager, state\)/)
  })

  it('withdraw the pane role when a view leaves the strip', () => {
    // a detached / torn view is beyond the tab broadcast, so both detach
    // routes withdraw its last role before the window is created
    expect(source).toMatch(/function clearPaneRole\(record: DetachedTab\): void \{/)
    expect(source).toMatch(/webContents\.send\(SPLIT_PANE_CHANNELS\.roleChanged, null\)/)
    const clears = source.match(/clearPaneRole\(record\)/g) ?? []
    expect(clears.length).toBe(2)
  })

  it('push the split state and the drop hint to the strip webContents', () => {
    expect(source).toMatch(/win\.webContents\.send\(SPLIT_TABS_CHANNELS\.changed, state\)/)
    expect(source).toMatch(/webContents\.send\(SPLIT_TABS_CHANNELS\.hint, hint\)/)
    // identical consecutive hint frames are suppressed
    expect(source).toMatch(/sameSplitHint\(hint, lastSplitHint\)/)
    // and every way out of a drag withdraws the hint
    const clears = source.match(/sendSplitHint\(null\)/g) ?? []
    expect(clears.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the tear-off split drop', () => {
  it('reads the drop zone in window-content coordinates while the pointer moves', () => {
    expect(source).toMatch(/splitDropZone\(screenX - bounds\.x, screenY - bounds\.y/)
    expect(source).toMatch(/shellWindow\.getContentBounds\(\)/)
    expect(source).toMatch(/dragTornWindow\(x, y\)\s*updateSplitHint\(x, y\)/)
  })

  it('decides with decideSplitDrop and the drag-start arrangement', () => {
    expect(source).toMatch(/tornSplitDrag = tearOffSplitContext\(id\)/)
    expect(source).toMatch(/splitAtStart: manager\.splitState\(\)/)
    expect(source).toMatch(
      /const split = paneAtStart \? drag\.splitAtStart : manager\.splitState\(\)/,
    )
    expect(source).toMatch(/tornSplitDrop = decideSplitDrop\(\{/)
  })

  it('hints the b pane in the pane-layout coordinates the renderer shares', () => {
    // panes live below the strip: the content rect carries TAB_STRIP_HEIGHT,
    // the orientation is the drop zone and the ratio is the live one (or half)
    expect(source).toMatch(/paneRects\(\s*\{\s*x: 0,\s*y: TAB_STRIP_HEIGHT,/)
    expect(source).toMatch(/height: Math\.max\(0, bounds\.height - TAB_STRIP_HEIGHT\),/)
    expect(source).toMatch(/},\s*zone,\s*split\?\.ratio \?\? SPLIT_EVEN_RATIO,/)
    expect(source).toMatch(/left: rects\.b\.x,\s*top: rects\.b\.y,/)
    expect(source).toMatch(/orientation: zone/)
  })

  it('re-homes the torn tab without activating it and applies the intent', () => {
    expect(source).toMatch(/takeTornTab\(\)/)
    expect(source).toMatch(/const newTabId = manager\.attachTab\(record, undefined, false\)/)
    expect(source).toMatch(/manager\.splitWith\(newTabId, intent\)/)
    // a pane tab's flip / noop rebuilds the split it was torn out of, with the
    // dragged id swapped for the re-attached tab
    expect(source).toMatch(/start\.aTabId === drag\.tabId \? newTabId : start\.aTabId/)
    expect(source).toMatch(/intent\.kind === 'flip' \? intent\.orientation : start\.orientation/)
  })

  it('ends a no-intent drag through the existing dock / tear-off flow', () => {
    const intercepts = source.match(/if \(applyTornSplitDrop\(\)\) return/g) ?? []
    expect(intercepts.length).toBe(2)
    expect(source).toMatch(/endTornDrag\(\)/)
  })

  it('leaves the tab manager with only the quiet re-attach branch', () => {
    expect(tabManagerSource).toMatch(
      /attachTab\(record: DetachedTab, index\?: number, activate = true\)/,
    )
    expect(tabManagerSource).toMatch(/if \(activate\) this\.activateTab\(id\)/)
    expect(tabManagerSource).toMatch(/else this\.onChanged\(\)/)
  })
})

describe('the split memory wiring', () => {
  it('saves on every split change and clears when the split is gone', () => {
    expect(source).toMatch(/writeSplitMemory\(\s*\{/)
    expect(source).toMatch(/aTabIdPath: tabs\.get\(state\.aTabId\)\?\.filePath/)
    expect(source).toMatch(/writeSplitMemory\(null, \{ settingsPath: APP_SETTINGS_PATH \}\)/)
  })

  it('reads the memory leniently through the T3 module', () => {
    expect(source).toMatch(/readSplitMemory\(\{ settingsPath: APP_SETTINGS_PATH \}\)/)
    // broken values are swallowed and the home screen opens instead
    expect(source).toMatch(/manager\.openHomeTab\(\)/)
  })

  it('restores at launch only when no file was given', () => {
    // the launch goes through crash recovery (recovery-shell.ts), which runs
    // today's launch when there is nothing to restore or ask
    expect(source).toMatch(
      /runLaunchRecovery\(\{[\s\S]*?launchPaths,\s*openLaunchPaths,\s*restoreSplitMemoryOrHome,/,
    )
    expect(recoveryShellSource).toMatch(
      /if \(deps\.launchPaths\.length > 0\) deps\.openLaunchPaths\(deps\.launchPaths\)/,
    )
    expect(recoveryShellSource).toMatch(/else deps\.restoreSplitMemoryOrHome\(\)/)
  })

  it('opens the remembered documents and rebuilds the arrangement', () => {
    expect(source).toMatch(/routeDocumentPath\(path\)/)
    expect(source).toMatch(/tabManager\?\.findTabByPath\(path\)\?\.id/)
    expect(source).toMatch(/existsSync\(path\) \? path : undefined/)
    expect(source).toMatch(/canonicalPath\(aPath\) === canonicalPath\(bPath\)/)
    expect(source).toMatch(/const bTabId = manager\.openDuplicatePaneTab\(aTabId\)/)
    expect(source).toMatch(/manager\.beginSplit\(aTabId, bTabId, orientation, ratio, focus\)/)
  })
})

describe('the same-document save probe', () => {
  it('counts the copies open in tabs and detached windows', () => {
    expect(source).toMatch(/setOpenPathProbe\(\(path\) => \{/)
    expect(source).toMatch(/for \(const tab of tabManager\?\.list\(\) \?\? \[\]\)/)
    expect(source).toMatch(/for \(const openPath of detachedFilePaths\(\)\)/)
    expect(source).toMatch(/return copies > 1/)
  })
})
