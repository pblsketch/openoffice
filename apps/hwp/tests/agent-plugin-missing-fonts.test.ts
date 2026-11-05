// @vitest-environment jsdom
/**
 * The fonts of a document that are not on this PC, as the plugin tells the app, against the
 * real rhwp engine: the names the text uses, once the editor's look at the PC's fonts is
 * over, and nothing changed in the document.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import {
  MISSING_FONTS_EVENT,
  agentPlugin,
  type AgentMissingFontsDetail,
  type AgentPluginHost,
} from '../studio-plugin/agent-plugin.mjs'
import { fontOnPc, installFontPresence, refreshPcFonts } from '../studio-plugin/pc-fonts.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const labels = { tag: 'Not on this PC', hint: 'Drawn with another font.' }

/** A document built with the engine: two lines, the second in 맑은 고딕. */
function openDocument() {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.insertText(0, 0, 0, '본인부담금은 면제한다.')
  doc.splitParagraph(0, 0, doc.getParagraphLength(0, 0))
  doc.insertText(0, 1, 0, '신청은 3월 31일까지 한다.')
  const ids = Array.from({ length: 7 }, (_, lang) =>
    doc.findOrCreateFontIdForLang(lang, '맑은 고딕'),
  )
  doc.applyCharFormat(0, 1, 0, doc.getParagraphLength(0, 1), JSON.stringify({ fontIds: ids }))
  const before = doc.exportHwp()
  let changes = 0
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      changes += 1
      return fn({ doc: () => doc, deferPagination: () => {} } as never)
    },
    events: { on: () => 0 },
    automation: { execute: () => ({ ok: false }) },
  } as unknown as AgentPluginHost
  const used = JSON.parse(doc.getDocumentInfo()).fontsUsed as string[]
  return {
    plugin: agentPlugin.activate(host),
    used,
    unchanged: () => changes === 0 && doc.exportHwp().length === before.length,
  }
}

/** The next MISSING_FONTS_EVENT's fonts. */
const nextMissing = () =>
  new Promise<string[]>((resolve) => {
    const on = (event: Event) => {
      window.removeEventListener(MISSING_FONTS_EVENT, on)
      resolve((event as CustomEvent<AgentMissingFontsDetail>).detail.fonts)
    }
    window.addEventListener(MISSING_FONTS_EVENT, on)
  })

/** The editor's start-up look, with 맑은 고딕 the only font of this PC that the text uses. */
async function lookAtThePc() {
  installFontPresence({
    resolveLocalFont: (name: string) => (name === '맑은 고딕' ? { family: 'Malgun Gothic' } : null),
    records: () => [],
    detected: () => [],
    state: () => ({ source: 'local-font-access' }),
  })
  await refreshPcFonts({
    queryLocalFonts: async () => [],
    loadStored: async () => {},
    records: () => [],
    detect: async () => {},
    changed: () => {},
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('watchMissingFonts', () => {
  it('tells the fonts the text uses that are not on this PC, and changes nothing', async () => {
    const { plugin, used, unchanged } = openDocument()
    expect(used).toContain('맑은 고딕')
    await lookAtThePc()
    const told = nextMissing()
    expect(plugin.watchMissingFonts(labels)).toEqual({ ok: true })
    const fonts = await told
    expect(fonts).toEqual(used.filter((name) => name !== '맑은 고딕'))
    expect(fonts.length).toBeGreaterThan(0)
    for (const name of fonts) expect(fontOnPc(name)).toBe(false)
    expect(unchanged()).toBe(true)
  })

  it('refuses labels that are missing or empty', () => {
    const { plugin } = openDocument()
    expect(() => plugin.watchMissingFonts({ tag: '', hint: 'x' })).toThrow(/tag and hint/)
    expect(() =>
      plugin.watchMissingFonts(undefined as unknown as { tag: string; hint: string }),
    ).toThrow(/tag and hint/)
  })
})
