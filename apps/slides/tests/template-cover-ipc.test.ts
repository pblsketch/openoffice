// @vitest-environment node
/**
 * The template cover preview channel: the main process builds a template's
 * sample cover with the same page builder generation uses and answers the
 * render tree for that one slide. It is registered by registerSlidesIpc (the
 * registration the shell runs too), takes only a catalog id and a cover
 * language, and leaves every open document and the temp folder alone.
 */
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { listSlideTemplates } from '@genoffice/pipelines/slides/templates'
import type { RenderSlide } from '@genoffice/pptx-render'

const CHANNEL = 'slides:template-cover-render'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  temp: '',
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resolve(__dirname, '..'),
    getPath: () => h.temp,
    getName: () => 'slides-test',
    getVersion: () => '0',
    whenReady: () => Promise.resolve(),
  },
  dialog: {},
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: { handle: () => {} }, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: { openPath: async () => '', openExternal: () => {}, showItemInFolder: () => {} },
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: () => null,
  shapedFamily: () => null,
  shapedMeasure: () => null,
}))

h.temp = mkdtempSync(join(tmpdir(), 'slides-cover-test-'))

import { registerSlidesIpc } from '../src/main/slides-main'
import { sessions } from '../src/main/session-state'

const event = { sender: { id: 7 } }
const render = (...args: unknown[]): Promise<RenderSlide | null> =>
  h.handlers.get(CHANNEL)!(event, ...args) as Promise<RenderSlide | null>

/** Every `text` string in a value (a render tree or a page spec), in order */
function textsOf(value: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k === 'text' && typeof child === 'string') out.push(child)
        else walk(child)
      }
    }
  }
  walk(value)
  return out
}

beforeAll(() => {
  registerSlidesIpc()
})

describe('template cover preview channel', () => {
  it('is registered by registerSlidesIpc, the registration the shell runs too', () => {
    expect(h.handlers.has(CHANNEL)).toBe(true)
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
    expect(read('src/main/ai-ipc.ts')).not.toContain(CHANNEL)
  })

  it('the preload exposes it as renderTemplateCover(id, lang)', () => {
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
    expect(read('src/preload/index.ts')).toContain(
      `renderTemplateCover: (id, lang) => ipcRenderer.invoke('${CHANNEL}', id, lang)`,
    )
    expect(read('src/shared/ipc.ts')).toMatch(
      /renderTemplateCover: \(id: string, lang: TemplateCoverLang\) => Promise<RenderSlide \| null>/,
    )
  })

  it('answers a drawable one-slide render tree for every template in both languages', async () => {
    for (const template of listSlideTemplates()) {
      for (const lang of ['ko', 'en'] as const) {
        const slide = await render(template.id, lang)
        expect(slide, `${template.id}/${lang}`).not.toBeNull()
        expect(slide!.widthPx).toBeGreaterThan(0)
        expect(slide!.heightPx / slide!.widthPx).toBeCloseTo(720 / 1280, 2)
        expect(slide!.nodes.length, `${template.id}/${lang}`).toBeGreaterThan(0)
      }
    }
  }, 120_000)

  it('draws the cover of the language asked for', async () => {
    const template = listSlideTemplates()[0]!
    const koText = textsOf((await render(template.id, 'ko'))!.nodes).join(' ')
    const enText = textsOf((await render(template.id, 'en'))!.nodes).join(' ')
    const koWord = textsOf(template.sampleCover.ko).find((s) => /[가-힣]/.test(s))
    expect(koWord).toBeDefined()
    expect(koText).toContain(koWord!.split(/\s+/)[0]!)
    expect(enText).not.toMatch(/[가-힣]/)
  })

  it('answers the same tree again from its cache', async () => {
    const id = listSlideTemplates()[1]!.id
    const first = await render(id, 'en')
    expect(await render(id, 'en')).toBe(first)
  })

  it('refuses anything that is not a catalog id and a cover language', async () => {
    const template = listSlideTemplates()[0]!
    await expect(render('no-such-template', 'en')).resolves.toBeNull()
    // a name is not an id: only the exact catalog id is looked up
    await expect(render(template.name.toUpperCase(), 'en')).resolves.toBeNull()
    await expect(render(template.id, 'ja')).resolves.toBeNull()
    await expect(render(template.id)).resolves.toBeNull()
    await expect(render({ elements: [] }, 'en')).resolves.toBeNull()
    await expect(render(template.id, 'en', { elements: [] })).resolves.not.toBeNull()
  })

  it('leaves open documents and the temp folder alone', async () => {
    const before = readdirSync(h.temp)
    expect(sessions.size).toBe(0)
    await render(listSlideTemplates()[2]!.id, 'ko')
    expect(sessions.size).toBe(0)
    expect(readdirSync(h.temp)).toEqual(before)
    const source = readFileSync(join(__dirname, '..', 'src/main/template-cover.ts'), 'utf8')
    expect(source).not.toMatch(/node:fs|writeFile|sessions/)
  })
})
