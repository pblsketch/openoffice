// @vitest-environment node
/**
 * The AI panel's attachments on the main-process side: which files are taken
 * (a mind map among them), that text is read through `parseFileToText` in
 * pages like the other editors, and that a file open elsewhere with unsaved
 * changes is not read at all. Then the panel's side of the same contract: it
 * asks for 24,000 characters at a time.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `mindmap-attach-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {},
  shell: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

const parsed = vi.fn()
vi.mock('@genoffice/file-parse', async (importOriginal) => {
  const real = await importOriginal<typeof import('@genoffice/file-parse')>()
  return {
    ...real,
    parseFileToText: (path: string) => {
      parsed(path)
      return real.parseFileToText(path)
    },
  }
})

import { UNSAVED_CHANGES_MESSAGE, setOpenFilesSource } from '@genoffice/electron-utils'
import { setUiLang } from '@genoffice/i18n'
import {
  ATTACHMENT_EXTS,
  collectAttachments,
  registerMindmapAiIpc,
  setMindmapProvisionalTitleHook,
} from '../src/main/ai-attachments'
import { MINDMAP_CHANNELS } from '../src/shared/ipc'
import type { AttachmentAddResult, AttachmentReadResult } from '../src/shared/ipc'
import { documentOf, plainSheet } from './helpers/fixtures'

let dir: string
let hasFile = false
registerMindmapAiIpc({ hasFile: () => hasFile })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-mindmap-attach-'))
  parsed.mockClear()
  hasFile = false
  setUiLang('en')
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  Promise.resolve(handlers.get(channel)!({ sender: { id: 7 } }, ...args) as T)

async function mapFile(name = 'plan.xmind'): Promise<string> {
  const path = join(dir, name)
  writeFileSync(path, await (await documentOf(plainSheet('Plan sheet'))).save())
  return path
}

describe('which files are taken', () => {
  it('takes a mind map, as the other editors do', async () => {
    expect(ATTACHMENT_EXTS.has('xmind')).toBe(true)
    const path = await mapFile()
    const result = await call<AttachmentAddResult>(MINDMAP_CHANNELS.filesAdd, [path])
    expect(result.accepted.map((a) => [a.name, a.ext])).toEqual([['plan.xmind', 'xmind']])
    expect(result.rejected).toEqual([])
  })

  it('names the files it does not take, and why', () => {
    const exe = join(dir, 'tool.exe')
    writeFileSync(exe, 'x')
    const result = collectAttachments([exe, join(dir, 'missing.txt'), 42])
    expect(result.accepted).toEqual([])
    expect(result.rejected).toHaveLength(2)
    expect(result.rejected[0]).toMatch(/tool\.exe: \.exe files are not supported/)
  })
})

describe('reading an attachment', () => {
  it('reads a mind map as its outline, through parseFileToText', async () => {
    const path = await mapFile()
    const read = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(read.ok).toBe(true)
    expect(read.text).toContain('# Plan sheet')
    expect(read.text).toContain('- Center')
    expect(read.text).toContain('  - One')
    expect(parsed).toHaveBeenCalledWith(path)
  })

  it('reads in pages and never more than 48,000 characters at once', async () => {
    const path = join(dir, 'long.txt')
    const text = 'abcdefghij'.repeat(6_000)
    writeFileSync(path, text)
    const first = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(first).toMatchObject({ ok: true, totalChars: 60_000, offset: 0 })
    expect(first.text).toHaveLength(24_000)
    const next = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 24_000, 24_000)
    expect(next.text).toBe(text.slice(24_000, 48_000))
    const greedy = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 1_000_000)
    expect(greedy.text).toHaveLength(48_000)
  })

  it('does not read a file open elsewhere with unsaved changes', async () => {
    const path = await mapFile()
    setOpenFilesSource(() => [{ filePath: path, dirty: true }])
    const read = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(read).toEqual({ ok: false, error: UNSAVED_CHANGES_MESSAGE })
    expect(parsed).not.toHaveBeenCalled()

    // saved, it is read
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    const again = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(again.ok).toBe(true)
  })

  it('reads no text out of a picture: it goes to the model as a picture', async () => {
    const path = join(dir, 'shot.png')
    writeFileSync(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const read = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(read.ok).toBe(false)
    const image = await call<{ ok: boolean; mime?: string }>(MINDMAP_CHANNELS.filesReadImage, path)
    expect(image).toMatchObject({ ok: true, mime: 'image/png' })
  })
})

describe('a draw.io diagram kept in a picture', () => {
  const fixtures = join(__dirname, '../../../packages/drawio-model/tests/fixtures')

  it('takes a .drawio.png that holds its diagram as diagram text, not as a picture', async () => {
    const path = join(dir, 'flow.drawio.png')
    writeFileSync(path, readFileSync(join(fixtures, 'out.drawio.png')))
    const added = await call<AttachmentAddResult>(MINDMAP_CHANNELS.filesAdd, [path])
    expect(added.accepted.map((a) => a.ext)).toEqual(['drawio.png'])
    const read = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(read.ok).toBe(true)
    expect(read.text).toContain('한글 처리 단계')
  })

  it('takes a .drawio.svg, which as a plain .svg it would not', async () => {
    const path = join(dir, 'flow.drawio.svg')
    writeFileSync(path, readFileSync(join(fixtures, 'out.drawio.svg')))
    const added = await call<AttachmentAddResult>(MINDMAP_CHANNELS.filesAdd, [path])
    expect(added.accepted.map((a) => a.ext)).toEqual(['drawio.svg'])
    const read = await call<AttachmentReadResult>(MINDMAP_CHANNELS.filesRead, path, 0, 24_000)
    expect(read.text).toContain('시작')
  })

  it('keeps a picture that only carries the name a picture', async () => {
    const path = join(dir, 'shot.drawio.png')
    writeFileSync(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const added = await call<AttachmentAddResult>(MINDMAP_CHANNELS.filesAdd, [path])
    expect(added.accepted.map((a) => a.ext)).toEqual(['png'])
    const image = await call<{ ok: boolean; mime?: string }>(MINDMAP_CHANNELS.filesReadImage, path)
    expect(image).toMatchObject({ ok: true, mime: 'image/png' })
  })
})

describe('the provisional name', () => {
  it('names the tab of a map without a file, and only that', async () => {
    const named: string[] = []
    setMindmapProvisionalTitleHook((_wc, title) => named.push(title))
    await call(MINDMAP_CHANNELS.provisionalTitle, '  Summer\n trip  ')
    hasFile = true
    await call(MINDMAP_CHANNELS.provisionalTitle, 'Ignored')
    expect(named).toEqual(['Summer trip'])
    setMindmapProvisionalTitleHook(null)
  })
})

describe('the panel reads attachments in pages of 24,000 characters', () => {
  it('asks for one page and says where the next one starts', async () => {
    const { createFilesSkill, READ_CHUNK_CHARS } = await import('../src/renderer/ai/files-skill')
    expect(READ_CHUNK_CHARS).toBe(24_000)
    const readAttachment = vi.fn(async (_path: string, offset: number, maxChars: number) => ({
      ok: true,
      name: 'long.txt',
      totalChars: 60_000,
      offset,
      text: 'x'.repeat(Math.min(maxChars, 60_000 - offset)),
    }))
    vi.stubGlobal('window', { mindmapApi: { readAttachment } })
    try {
      const skill = createFilesSkill(() => [
        { path: 'C:/long.txt', name: 'long.txt', ext: 'txt', sizeBytes: 60_000 },
      ])
      const first = await skill.executeTool({
        id: '1',
        name: 'read_attachment',
        input: { index: 0 },
      })
      expect(readAttachment).toHaveBeenLastCalledWith('C:/long.txt', 0, 24_000)
      expect(first.output).toContain('continue with offset=24000')
      await skill.executeTool({
        id: '2',
        name: 'read_attachment',
        input: { index: 0, offset: 48_000 },
      })
      expect(readAttachment).toHaveBeenLastCalledWith('C:/long.txt', 48_000, 24_000)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
