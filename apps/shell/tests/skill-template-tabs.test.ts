/**
 * Template copies in new tabs (spec 5.6, 5.7): a byte copy opens as a new
 * untitled document of its editor with the request handed over; a template
 * preview keeps the original for its "save as is" and tells the original tab
 * how it ended; closing the preview unsaved writes nothing.
 */
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { USER_SKILLS_CHANNELS } from '@genoffice/electron-utils/user-skills-channels'
import {
  queuedSkillHandoffs,
  resetGenerateHandoffsForTest,
} from '@genoffice/electron-utils/generate-handoff'
import {
  copyFileNameOf,
  createTemplateTabs,
  type TemplateCopy,
  type TemplateTabsDeps,
} from '../src/main/user-skills/template-tabs'

class FakeContents extends EventEmitter {
  destroyed = false
  constructor(readonly id: number) {
    super()
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

class FakeOwner {
  sent: Array<{ channel: string; payload: unknown }> = []
  destroyed = false
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload })
  }
}

const TEMPLATE_BYTES = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])

function setup(overrides: Partial<TemplateTabsDeps> = {}) {
  const files = new Map<string, Uint8Array>()
  const removed: string[] = []
  const opened: TemplateCopy[] = []
  const tabs: FakeContents[] = []
  const focused: string[] = []
  let dirs = 0
  let ids = 0
  files.set('/skills/letter/assets/letter.hwpx', TEMPLATE_BYTES)
  const deps: TemplateTabsDeps = {
    makeCopyDir: async () => `/tmp/copy-${++dirs}`,
    writeFile: async (path, bytes) => {
      files.set(path, new Uint8Array(bytes))
    },
    readFile: async (path) => {
      const bytes = files.get(path)
      if (!bytes) throw new Error('ENOENT')
      return bytes
    },
    removeDir: async (dir) => {
      removed.push(dir)
    },
    templateFileOf: async (id) =>
      id === 'app:letter'
        ? {
            ok: true,
            path: '/skills/letter/assets/letter.hwpx',
            fileName: 'letter.hwpx',
            title: 'Letter',
          }
        : id === 'app:gone'
          ? { ok: false, reason: 'no-template' }
          : { ok: false, reason: 'not-found' },
    openCopy: async (copy) => {
      opened.push(copy)
      const contents = new FakeContents(100 + opened.length)
      tabs.push(contents)
      return { tabId: `t${opened.length}`, contents }
    },
    focusTab: (tabId) => {
      focused.push(tabId)
      return tabId.startsWith('t')
    },
    newId: () => `id-${++ids}`,
    now: () => 5,
    ...overrides,
  }
  return { deps, files, removed, opened, tabs, focused, templates: createTemplateTabs(deps) }
}

afterEach(() => resetGenerateHandoffsForTest())

describe('opening a template skill in a new tab', () => {
  it('opens a byte copy of the template in its editor and hands the request over', async () => {
    const { templates, opened, files } = setup()
    const chips = [
      { id: 'app:letter', source: 'app', title: 'Letter' },
      { id: 'app:tone', source: 'app', title: 'Tone' },
    ]
    const result = await templates.openTemplate({
      skillId: 'app:letter',
      text: 'for Friday',
      chips,
    })
    expect(result).toEqual({ ok: true, tabId: 't1' })
    expect(opened).toHaveLength(1)
    const copy = opened[0]!
    expect(copy.editor).toBe('hwp')
    expect(copy.path).toBe(join('/tmp/copy-1', 'letter.hwpx'))
    expect(copy.title).toBe('letter')
    // a copy, never the template file itself
    expect(copy.path).not.toBe('/skills/letter/assets/letter.hwpx')
    expect([...files.get(copy.path)!]).toEqual([...TEMPLATE_BYTES])
    expect(queuedSkillHandoffs()).toEqual([{ webContentsId: 101, target: 'hwp', id: 'id-1' }])
    const handoff = templates.takeHandoff('hwp', 101)
    expect(handoff).toMatchObject({ mode: 'skill', target: 'hwp', text: 'for Friday', chips })
    expect(handoff?.preview).toBeUndefined()
    expect(templates.takeHandoff('hwp', 101)).toBeNull()
  })

  it('tells the shell which panel the copy was opened for, so it follows that project', async () => {
    const followed: Array<[number, number]> = []
    const { templates } = setup({
      copyOpenedFor: (contents, openerId) => void followed.push([contents.id, openerId]),
    })
    await templates.openTemplate({ skillId: 'app:letter', text: 'x', chips: [] }, 7)
    expect(followed).toEqual([[101, 7]])
    // no opener (another caller), or a copy that did not open: nothing to follow
    await templates.openTemplate({ skillId: 'app:letter', text: 'x', chips: [] })
    await templates.openTemplate({ skillId: 'app:gone', text: 'x', chips: [] }, 7)
    expect(followed).toEqual([[101, 7]])
  })

  it('opens nothing and says so when the template file is missing', async () => {
    const { templates, opened } = setup()
    expect(await templates.openTemplate({ skillId: 'app:gone', text: 'x', chips: [] })).toEqual({
      ok: false,
      reason: 'no-template',
    })
    expect(opened).toEqual([])
    expect(queuedSkillHandoffs()).toEqual([])
  })

  it('treats a file that vanished before the read as missing', async () => {
    const { templates, files, opened } = setup()
    files.delete('/skills/letter/assets/letter.hwpx')
    const result = await templates.openTemplate({ skillId: 'app:letter', text: 'x', chips: [] })
    expect(result).toEqual({ ok: false, reason: 'no-template' })
    expect(opened).toEqual([])
  })

  it('removes the copy folder when the tab could not open or closes', async () => {
    const failing = setup({ openCopy: async () => null })
    const result = await failing.templates.openTemplate({
      skillId: 'app:letter',
      text: 'x',
      chips: [],
    })
    expect(result.ok).toBe(false)
    expect(failing.removed).toEqual(['/tmp/copy-1'])

    const { templates, tabs, removed } = setup()
    await templates.openTemplate({ skillId: 'app:letter', text: 'x', chips: [] })
    expect(removed).toEqual([])
    tabs[0]!.destroy()
    await Promise.resolve()
    expect(removed).toEqual(['/tmp/copy-1'])
  })

  it('leaves the folder to an editor that removes it itself', async () => {
    const { templates, tabs, removed } = setup({
      openCopy: async () => ({ tabId: 't1', contents: new FakeContents(7), ownsCopy: true }),
    })
    await templates.openTemplate({ skillId: 'app:letter', text: 'x', chips: [] })
    tabs.forEach((t) => t.destroy())
    expect(removed).toEqual([])
  })
})

describe('the template preview (make a blank template)', () => {
  const previewInput = (patch: Record<string, unknown> = {}) => ({
    bytes: new Uint8Array([1, 2, 3]),
    fileName: 'report.docx',
    title: 'Report',
    tabTitle: 'Template preview - Report',
    text: 'clear the filled values',
    originalRedacted: false,
    proposal: { key: 'k1', title: 'Report', description: 'd', body: 'b' },
    draft: { title: 'My report', invoke: 'manual' },
    ...patch,
  })

  it('opens the copy titled as the preview and hands over the request and the proposal', async () => {
    const { templates, opened } = setup()
    const owner = new FakeOwner(1)
    const result = await templates.openPreview(owner, previewInput())
    expect(result).toEqual({ ok: true, tabId: 't1', previewId: 'id-1' })
    expect(opened[0]).toMatchObject({
      editor: 'docs',
      fileName: 'Template preview - Report.docx',
      title: 'Template preview - Report',
    })
    const handoff = templates.takeHandoff('docs', 101)
    expect(handoff).toMatchObject({
      text: 'clear the filled values',
      chips: [],
      preview: {
        previewId: 'id-1',
        title: 'Report',
        fileName: 'report.docx',
        originalRedacted: false,
        proposal: { key: 'k1' },
        draft: { title: 'My report' },
      },
    })
  })

  it('gives the original bytes to the preview tab only', async () => {
    const { templates } = setup()
    await templates.openPreview(new FakeOwner(1), previewInput())
    expect(templates.previewOriginal(1, 'id-1')).toEqual({ ok: false, reason: 'not-found' })
    expect(templates.previewOriginal(101, 'id-1')).toEqual({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'report.docx',
    })
  })

  it('never gives out an original its editor reported as withholding something', async () => {
    const { templates } = setup()
    await templates.openPreview(new FakeOwner(1), previewInput({ originalRedacted: true }))
    // the preview tab's own button is off for it; main refuses even when asked
    expect(templates.previewOriginal(101, 'id-1')).toEqual({ ok: false, reason: 'redacted' })
  })

  it('tells the original tab once when the preview was saved', async () => {
    const { templates } = setup()
    const owner = new FakeOwner(1)
    await templates.openPreview(owner, previewInput())
    const ended = {
      previewId: 'id-1',
      outcome: 'saved' as const,
      skillId: 'app:report',
      title: 'R',
    }
    expect(templates.finishPreview(1, ended)).toEqual({ ok: false, reason: 'not-found' })
    expect(templates.finishPreview(101, ended)).toEqual({ ok: true })
    expect(templates.finishPreview(101, ended)).toEqual({ ok: true })
    expect(owner.sent).toEqual([{ channel: USER_SKILLS_CHANNELS.previewEnded, payload: ended }])
  })

  it('ends as not saved when the preview tab closes first, and writes nothing', async () => {
    const { templates, tabs, files } = setup()
    const owner = new FakeOwner(1)
    await templates.openPreview(owner, previewInput())
    const before = [...files.keys()]
    tabs[0]!.destroy()
    expect(owner.sent).toEqual([
      {
        channel: USER_SKILLS_CHANNELS.previewEnded,
        payload: { previewId: 'id-1', outcome: 'unsaved' },
      },
    ])
    expect(templates.openPreviewIds()).toEqual([])
    expect([...files.keys()]).toEqual(before)
    expect(
      before.every((path) => path.startsWith(join('/tmp')) || path.startsWith('/skills/')),
    ).toBe(true)
  })

  it('does not report an unsaved end after a cancel was already reported', async () => {
    const { templates, tabs } = setup()
    const owner = new FakeOwner(1)
    await templates.openPreview(owner, previewInput())
    templates.finishPreview(101, { previewId: 'id-1', outcome: 'unsaved' })
    tabs[0]!.destroy()
    expect(owner.sent).toHaveLength(1)
  })

  it('refuses a document no editor opens', async () => {
    const { templates, opened } = setup()
    const result = await templates.openPreview(
      new FakeOwner(1),
      previewInput({ fileName: 'settings.json' }),
    )
    expect(result).toEqual({ ok: false, reason: 'bad-template' })
    expect(opened).toEqual([])
  })
})

describe('copy names and tabs', () => {
  it('makes a plain file name from a title', () => {
    expect(copyFileNameOf('Template preview - a/b:c?', '.docx')).toBe(
      'Template preview - a b c.docx',
    )
    expect(copyFileNameOf('...', '.md')).toBe('template.md')
    expect(copyFileNameOf('양식 미리보기 - 공문', '.hwpx')).toBe('양식 미리보기 - 공문.hwpx')
  })

  it('brings a tab to the front', () => {
    const { templates, focused } = setup()
    expect(templates.focusTab('t3')).toEqual({ ok: true })
    expect(templates.focusTab('x')).toEqual({ ok: false, reason: 'not-found' })
    expect(focused).toEqual(['t3', 'x'])
  })
})

describe('a copy for another caller (the agent window)', () => {
  it('opens any document copy with a request handed over', async () => {
    const { templates, opened } = setup()
    const result = await templates.openCopy({
      bytes: new Uint8Array([1]),
      fileName: 'report.md',
      title: 'Report',
      text: 'summarise',
      chips: [],
    })
    expect(result).toEqual({ ok: true, tabId: 't1' })
    expect(opened[0]).toMatchObject({ editor: 'markdown', fileName: 'report.md', title: 'Report' })
    expect(templates.takeHandoff('markdown', 101)).toMatchObject({ text: 'summarise', chips: [] })
  })
})
