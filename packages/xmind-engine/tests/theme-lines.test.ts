import { describe, expect, it } from 'vitest'
// Through the package's front door, like the other theme tests: loading the
// index is what switches the default theme on.
import {
  applySheetRainbow,
  applySheetTapered,
  applySheetTheme,
  createXmindDocument,
  DEFAULT_THEME_ID,
  isBlankSheetTheme,
  isUnknownSheetTheme,
  recogniseSheetTheme,
  recogniseTheme,
  SHIPPED_THEME_TABLES,
  sheetLineSettings,
  THEME_IDS,
  themeTable,
  writeSheetRainbow,
  writeSheetTapered,
  writeSheetTheme,
  writtenThemeProperties,
  type ThemeId,
  type ThemeProperties,
  type XmindSheet,
} from '../src/index'
import { buildMapFile, CONTENT, openOk, text, unzip } from './helpers'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A theme from some other program: hand-written, every value invented here. */
function foreignTheme(): Record<string, any> {
  return {
    map: {
      id: 'foreign-map',
      properties: {
        'svg:fill': '#101820',
        'multi-line-colors': '#aa3355 #33aa55 #5533aa',
        'color-list': '#f0f0e8 #aa3355 #33aa55 #5533aa',
        'line-tapered': 'none',
      },
    },
    centralTopic: {
      id: 'foreign-central',
      properties: { 'fo:font-size': '30pt', 'line-class': 'org.xmind.branchConnection.curve' },
    },
    floatingTopic: { id: 'foreign-floating', properties: { 'svg:fill': '#33aa55' } },
    skeletonThemeId: 'made-up-skeleton',
  }
}

/** A table the way a file holds it: every level wrapped with an id. */
function asFileHoldsIt(properties: ThemeProperties): Record<string, any> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, level], index) => [
      name,
      { id: `level-${index}`, properties: { ...level } },
    ]),
  )
}

function sheetWith(theme: unknown): XmindSheet {
  const sheet: XmindSheet = { id: 'sheet', class: 'sheet', rootTopic: { id: 'root', title: 'R' } }
  if (theme !== undefined) sheet.theme = theme
  return sheet
}

/** A table with the two map-wide settings changed the way the theme panel changes them. */
function withSettings(
  theme: Record<string, any>,
  settings: { tapered?: string; rainbow?: string },
): Record<string, any> {
  const copy = structuredClone(theme)
  if (settings.tapered !== undefined) copy.map.properties['line-tapered'] = settings.tapered
  if (settings.rainbow !== undefined) copy.map.properties['multi-line-colors'] = settings.rainbow
  return copy
}

async function contentOf(bytes: Uint8Array): Promise<string> {
  return text((await unzip(bytes)).get(CONTENT)!)
}

describe('recognising a theme whose map-wide line settings were changed', () => {
  it.each<[string, { tapered?: string; rainbow?: string }]>([
    ['rainbow off', { rainbow: 'none' }],
    ['tapered on', { tapered: 'tapered' }],
    ['rainbow off and tapered on', { rainbow: 'none', tapered: 'tapered' }],
  ])('still recognises all 96 written tables with %s', (_what, settings) => {
    for (const id of THEME_IDS) {
      expect(recogniseTheme(withSettings(themeTable(id), settings)), id).toBe(id)
    }
  })

  it.each<[string, { tapered?: string; rainbow?: string }]>([
    ['rainbow off', { rainbow: 'none' }],
    ['tapered on', { tapered: 'tapered' }],
    ['rainbow off and tapered on', { rainbow: 'none', tapered: 'tapered' }],
  ])('still recognises every table an earlier release wrote with %s', (_what, settings) => {
    for (const { themeId, properties } of SHIPPED_THEME_TABLES) {
      expect(recogniseTheme(withSettings(asFileHoldsIt(properties), settings)), themeId).toBe(
        themeId,
      )
    }
  })

  it('does not compare the value of the tapered setting at all', () => {
    const id: ThemeId = 'capsule/moss/tint'
    expect(recogniseTheme(withSettings(themeTable(id), { tapered: 'something else' }))).toBe(id)
  })

  it('still asks for the theme’s own colours while the rainbow is on', () => {
    const id: ThemeId = 'block/plum/dark'
    const own = writtenThemeProperties(id).map!['multi-line-colors']!
    const other = writtenThemeProperties('pill/paper/light').map!['multi-line-colors']!
    expect(own).not.toBe(other)
    expect(recogniseTheme(withSettings(themeTable(id), { rainbow: other }))).toBeNull()
    expect(recogniseTheme(withSettings(themeTable(id), { rainbow: '#123456' }))).toBeNull()
    const missing = themeTable(id) as Record<string, any>
    delete missing.map.properties['multi-line-colors']
    expect(recogniseTheme(missing)).toBeNull()
  })

  it('still sees any other change to the map level', () => {
    const id: ThemeId = 'line/signal/light'
    const changed = withSettings(themeTable(id), { rainbow: 'none', tapered: 'tapered' })
    changed.map.properties['svg:fill'] = '#123456'
    expect(recogniseTheme(changed)).toBeNull()
  })
})

describe('reading the map-wide line settings', () => {
  it('reads the settings of one of ours as written', () => {
    const id: ThemeId = 'pill/clay/light'
    expect(sheetLineSettings(sheetWith(themeTable(id)))).toEqual({
      tapered: false,
      rainbow: true,
      rainbowColors: writtenThemeProperties(id).map!['multi-line-colors'],
    })
    const changed = withSettings(themeTable(id), { tapered: 'tapered', rainbow: 'none' })
    expect(sheetLineSettings(sheetWith(changed))).toEqual({
      tapered: true,
      rainbow: false,
      rainbowColors: null,
    })
  })

  it('reads a sheet without a theme, or with an unreadable one, as the default look', () => {
    const plain = { tapered: false, rainbow: true, rainbowColors: null }
    for (const theme of [undefined, null, {}, [], 'pill/paper/light', { map: 'x' }]) {
      expect(sheetLineSettings(sheetWith(theme)), JSON.stringify(theme)).toEqual(plain)
    }
  })

  it('reads a theme from elsewhere', () => {
    expect(sheetLineSettings(sheetWith(foreignTheme()))).toEqual({
      tapered: false,
      rainbow: true,
      rainbowColors: '#aa3355 #33aa55 #5533aa',
    })
  })
})

describe('turning the map-wide line settings on and off', () => {
  it('writes only that key on one of ours, which stays recognised', () => {
    const id: ThemeId = 'block/harbor/dark'
    const sheet = sheetWith(themeTable(id))
    const before = structuredClone(sheet.theme) as Record<string, any>

    expect(writeSheetTapered(sheet, true)).toBe(true)
    expect(sheet.theme).toEqual(withSettings(before, { tapered: 'tapered' }))
    expect(writeSheetRainbow(sheet, false)).toBe(true)
    expect(sheet.theme).toEqual(withSettings(before, { tapered: 'tapered', rainbow: 'none' }))
    // the order of the keys is kept: the value changes in its place
    expect(Object.keys((sheet.theme as any).map.properties)).toEqual(
      Object.keys(before.map.properties),
    )
    expect(recogniseSheetTheme(sheet)).toBe(id)
    expect(sheetLineSettings(sheet)).toMatchObject({ tapered: true, rainbow: false })

    // switched back on, the theme's own colours come back and it is the table written today
    expect(writeSheetTapered(sheet, false)).toBe(true)
    expect(writeSheetRainbow(sheet, true)).toBe(true)
    expect(sheet.theme).toEqual(before)
    expect(recogniseSheetTheme(sheet)).toBe(id)
  })

  it('puts the colours of an earlier release back on a table that release wrote', () => {
    const { themeId, properties } = SHIPPED_THEME_TABLES[17]!
    const theme = withSettings(asFileHoldsIt(properties), { rainbow: 'none' })
    const sheet = sheetWith(theme)
    expect(recogniseSheetTheme(sheet)).toBe(themeId)
    expect(writeSheetRainbow(sheet, true, '#010203')).toBe(true)
    expect(sheet.theme).toEqual(asFileHoldsIt(properties))
    expect(recogniseSheetTheme(sheet)).toBe(themeId)
  })

  it('writes nothing when the setting already has that value', () => {
    const sheet = sheetWith(themeTable('pill/paper/light'))
    const before = JSON.stringify(sheet)
    expect(writeSheetTapered(sheet, false)).toBe(false)
    expect(writeSheetRainbow(sheet, true)).toBe(false)
    expect(JSON.stringify(sheet)).toBe(before)

    const bare = sheetWith(undefined)
    expect(writeSheetTapered(bare, false)).toBe(false)
    expect(writeSheetRainbow(bare, true, '#aa3355')).toBe(false)
    expect('theme' in bare).toBe(false)
  })

  it('writes only that key into a theme from elsewhere, leaving every other value', () => {
    const sheet = sheetWith(foreignTheme())
    expect(writeSheetTapered(sheet, true)).toBe(true)
    expect(sheet.theme).toEqual(withSettings(foreignTheme(), { tapered: 'tapered' }))
    expect(writeSheetRainbow(sheet, false)).toBe(true)
    expect(sheet.theme).toEqual(
      withSettings(foreignTheme(), { tapered: 'tapered', rainbow: 'none' }),
    )
    expect(isUnknownSheetTheme(sheet)).toBe(true)
  })

  it('makes the map level of a theme that has none, and only that', () => {
    const theme = foreignTheme()
    delete theme.map
    const sheet = sheetWith(structuredClone(theme))
    expect(writeSheetRainbow(sheet, false)).toBe(true)
    const written = sheet.theme as Record<string, any>
    expect(Object.keys(written)).toEqual([...Object.keys(theme), 'map'])
    expect(Object.keys(written.map)).toEqual(['id', 'properties'])
    expect(written.map.id).toMatch(UUID_V4)
    expect(written.map.properties).toEqual({ 'multi-line-colors': 'none' })
    const { map: _made, ...rest } = written
    expect(rest).toEqual(theme)
  })

  it('makes the properties of a map level that has none', () => {
    const sheet = sheetWith({ map: { id: 'only-id' }, subTopic: { properties: { a: 'b' } } })
    expect(writeSheetTapered(sheet, true)).toBe(true)
    expect(sheet.theme).toEqual({
      map: { id: 'only-id', properties: { 'line-tapered': 'tapered' } },
      subTopic: { properties: { a: 'b' } },
    })
  })

  it('makes a theme on a sheet without one, which counts as no theme', () => {
    const sheet = sheetWith(undefined)
    expect(writeSheetTapered(sheet, true)).toBe(true)
    const written = sheet.theme as Record<string, any>
    expect(Object.keys(written)).toEqual(['map'])
    expect(written.map.id).toMatch(UUID_V4)
    expect(written.map.properties).toEqual({ 'line-tapered': 'tapered' })
    expect(writeSheetRainbow(sheet, false)).toBe(true)
    expect(written.map.properties).toEqual({
      'line-tapered': 'tapered',
      'multi-line-colors': 'none',
    })
    expect(recogniseSheetTheme(sheet)).toBeNull()
    expect(isBlankSheetTheme(sheet.theme)).toBe(true)
    expect(isUnknownSheetTheme(sheet)).toBe(false)
    expect(sheetLineSettings(sheet)).toEqual({ tapered: true, rainbow: false, rainbowColors: null })
  })

  it('takes a null theme as no theme', () => {
    const sheet = sheetWith(null)
    expect(writeSheetRainbow(sheet, false)).toBe(true)
    expect((sheet.theme as any).map.properties).toEqual({ 'multi-line-colors': 'none' })
  })

  it('turns down a theme it cannot add a key to, and changes nothing', () => {
    for (const theme of [[], 'pill/paper/light', 7, { map: 'x' }, { map: { properties: [] } }]) {
      const sheet = sheetWith(structuredClone(theme))
      const before = JSON.stringify(sheet)
      expect(writeSheetTapered(sheet, true), JSON.stringify(theme)).toBe(false)
      expect(JSON.stringify(sheet)).toBe(before)
    }
  })

  describe('switching the rainbow back on', () => {
    it('puts back the list it had before it was switched off', () => {
      const sheet = sheetWith(foreignTheme())
      const previous = sheetLineSettings(sheet).rainbowColors
      expect(previous).toBe('#aa3355 #33aa55 #5533aa')
      writeSheetRainbow(sheet, false)
      expect(writeSheetRainbow(sheet, true, previous)).toBe(true)
      expect(sheet.theme).toEqual(foreignTheme())
    })

    it('removes the key when there is no list to put back', () => {
      const sheet = sheetWith(foreignTheme())
      writeSheetRainbow(sheet, false)
      expect(writeSheetRainbow(sheet, true)).toBe(true)
      const expected = foreignTheme()
      delete expected.map.properties['multi-line-colors']
      expect(sheet.theme).toEqual(expected)
      expect(sheetLineSettings(sheet)).toEqual({
        tapered: false,
        rainbow: true,
        rainbowColors: null,
      })
    })

    it('takes no list that is not one', () => {
      for (const previous of ['none', '', null]) {
        const sheet = sheetWith(foreignTheme())
        writeSheetRainbow(sheet, false)
        expect(writeSheetRainbow(sheet, true, previous)).toBe(true)
        expect((sheet.theme as any).map.properties).not.toHaveProperty('multi-line-colors')
      }
    })

    it('leaves a sheet that had no theme without one again', () => {
      const sheet = sheetWith(undefined)
      writeSheetRainbow(sheet, false)
      expect(writeSheetRainbow(sheet, true)).toBe(true)
      expect('theme' in sheet).toBe(false)
    })

    it('keeps the other setting a theme-less sheet was given', () => {
      const sheet = sheetWith(undefined)
      writeSheetTapered(sheet, true)
      writeSheetRainbow(sheet, false)
      expect(writeSheetRainbow(sheet, true)).toBe(true)
      expect((sheet.theme as any).map.properties).toEqual({ 'line-tapered': 'tapered' })
    })

    it('uses the theme’s own colours over a list from before', () => {
      const id: ThemeId = 'capsule/slate/tint'
      const sheet = sheetWith(withSettings(themeTable(id), { rainbow: 'none' }))
      expect(writeSheetRainbow(sheet, true, '#aa3355 #33aa55')).toBe(true)
      expect(sheetLineSettings(sheet).rainbowColors).toBe(
        writtenThemeProperties(id).map!['multi-line-colors'],
      )
      expect(recogniseSheetTheme(sheet)).toBe(id)
    })
  })
})

describe('a theme that holds only the map-wide line settings', () => {
  it.each<[string, unknown]>([
    ['tapered only', { map: { id: 'm', properties: { 'line-tapered': 'tapered' } } }],
    ['rainbow only', { map: { id: 'm', properties: { 'multi-line-colors': 'none' } } }],
    [
      'both',
      { map: { id: 'm', properties: { 'line-tapered': 'none', 'multi-line-colors': 'none' } } },
    ],
    ['a level without an id', { map: { properties: { 'line-tapered': 'tapered' } } }],
    ['an empty map level', { map: { id: 'm', properties: {} } }],
    ['an empty theme', {}],
  ])('counts as no theme: %s', (_what, theme) => {
    expect(isBlankSheetTheme(theme)).toBe(true)
    expect(isUnknownSheetTheme(sheetWith(theme))).toBe(false)
    expect(recogniseTheme(theme)).toBeNull()
  })

  it.each<[string, unknown]>([
    ['another property', { map: { id: 'm', properties: { 'svg:fill': '#ffffff' } } }],
    ['another level', { map: { properties: {} }, subTopic: { properties: {} } }],
    ['a key beside the properties', { map: { id: 'm', note: 'x', properties: {} } }],
    ['a value that is not text', { map: { id: 'm', properties: { 'line-tapered': 1 } } }],
    ['a level that is not a table', { map: 'x' }],
    ['a theme from elsewhere', foreignTheme()],
  ])('is an unknown theme with %s', (_what, theme) => {
    expect(isBlankSheetTheme(theme)).toBe(false)
    expect(isUnknownSheetTheme(sheetWith(theme))).toBe(true)
  })

  it('tells no theme and one of ours from an unknown one, as the editor did', () => {
    expect(isUnknownSheetTheme(sheetWith(undefined))).toBe(false)
    expect(isUnknownSheetTheme(sheetWith(themeTable(DEFAULT_THEME_ID)))).toBe(false)
    const changed = withSettings(themeTable(DEFAULT_THEME_ID), { rainbow: 'none' })
    expect(isUnknownSheetTheme(sheetWith(changed))).toBe(false)
    // not a table at all: neither a theme nor one the editor would warn about
    for (const theme of [null, [], 'x', 7]) {
      expect(isUnknownSheetTheme(sheetWith(theme)), JSON.stringify(theme)).toBe(false)
    }
  })
})

describe('picking another theme', () => {
  it('carries the two settings over', () => {
    const sheet = sheetWith(themeTable('pill/paper/light'))
    writeSheetTapered(sheet, true)
    writeSheetRainbow(sheet, false)
    const id: ThemeId = 'block/moss/dark'
    writeSheetTheme(sheet, id)
    expect(recogniseSheetTheme(sheet)).toBe(id)
    expect(sheetLineSettings(sheet)).toEqual({ tapered: true, rainbow: false, rainbowColors: null })
    // everything else is the table written today, in its order
    const table = sheet.theme as Record<string, any>
    expect(Object.keys(table.map.properties)).toEqual(Object.keys(writtenThemeProperties(id).map!))
    const own = writtenThemeProperties(id).map!['multi-line-colors']!
    expect(withSettings(table, { tapered: 'none', rainbow: own })).toEqual(
      asFileHoldsIdsOf(table, writtenThemeProperties(id)),
    )
  })

  it('carries the settings over from a theme-less sheet and from a theme from elsewhere', () => {
    const bare = sheetWith(undefined)
    writeSheetTapered(bare, true)
    writeSheetTheme(bare, 'line/clay/light')
    expect(sheetLineSettings(bare)).toMatchObject({ tapered: true, rainbow: true })
    expect(recogniseSheetTheme(bare)).toBe('line/clay/light')

    const foreign = sheetWith(withSettings(foreignTheme(), { rainbow: 'none' }))
    writeSheetTheme(foreign, 'line/clay/light')
    expect(sheetLineSettings(foreign)).toMatchObject({ tapered: false, rainbow: false })
    expect(recogniseSheetTheme(foreign)).toBe('line/clay/light')
  })

  it('switching the rainbow on after a pick brings the new theme’s colours', () => {
    const sheet = sheetWith(withSettings(themeTable('pill/paper/light'), { rainbow: 'none' }))
    const id: ThemeId = 'pill/plum/dark'
    writeSheetTheme(sheet, id)
    expect(writeSheetRainbow(sheet, true)).toBe(true)
    expect(sheetLineSettings(sheet).rainbowColors).toBe(
      writtenThemeProperties(id).map!['multi-line-colors'],
    )
  })

  it('writes the table of today, letter for letter, when the settings are as written', () => {
    const sheet = sheetWith(themeTable('capsule/clay/light'))
    writeSheetTheme(sheet, 'block/clay/light')
    const table = sheet.theme as Record<string, any>
    expect(asFileHoldsIdsOf(table, writtenThemeProperties('block/clay/light'))).toEqual(table)
  })
})

describe('a document', () => {
  it('is marked changed only when a setting is written', async () => {
    const bytes = await buildMapFile({ content: [sheetWith(themeTable('line/signal/light'))] })
    const document = await openOk(bytes)

    expect(applySheetTapered(document, 0, false)).toBe(false)
    expect(applySheetRainbow(document, 0, true)).toBe(false)
    expect(document.changed).toBe(false)
    expect(await document.save()).toEqual(bytes)

    expect(applySheetTapered(document, 0, true)).toBe(true)
    expect(document.changed).toBe(true)
    const reopened = await openOk(await document.save())
    expect(recogniseSheetTheme(reopened.sheets[0]!)).toBe('line/signal/light')
    expect(sheetLineSettings(reopened.sheets[0]!).tapered).toBe(true)
  })

  it('keeps a theme from elsewhere byte for byte but for the one key', async () => {
    const theme = foreignTheme()
    const document = await openOk(await buildMapFile({ content: [sheetWith(theme)] }))
    expect(applySheetRainbow(document, 0, false)).toBe(true)
    const written = await contentOf(await document.save())
    expect(written).toContain(`"theme":${JSON.stringify(withSettings(theme, { rainbow: 'none' }))}`)
  })

  it('carries the settings over a picked theme', async () => {
    const document = await createXmindDocument({ sheetTitle: 'S', rootTitle: 'R' })
    applySheetRainbow(document, 0, false)
    applySheetTheme(document, 0, 'block/plum/dark')
    expect(recogniseSheetTheme(document.sheets[0]!)).toBe('block/plum/dark')
    expect(sheetLineSettings(document.sheets[0]!).rainbow).toBe(false)
  })

  it('turns down a sheet that does not exist', async () => {
    const document = await createXmindDocument({ sheetTitle: 'S', rootTitle: 'R' })
    expect(() => applySheetTapered(document, 1, true)).toThrow(/xmind:/)
    expect(() => applySheetRainbow(document, 1, false)).toThrow(/xmind:/)
    expect(document.changed).toBe(false)
  })
})

/** `properties` wrapped the way `table` holds them: the same level ids, in the same order. */
function asFileHoldsIdsOf(
  table: Record<string, any>,
  properties: ThemeProperties,
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, level]) => [
      name,
      { id: table[name].id, properties: { ...level } },
    ]),
  )
}
