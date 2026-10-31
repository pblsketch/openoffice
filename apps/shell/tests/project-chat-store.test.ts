import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AppendProjectChatArgs,
  ProjectChatAppendedEvent,
  ProjectChatInfo,
  ProjectChatMessage,
  ProjectTrustAnswer,
} from '@genoffice/project-store'
import { ProjectGuide } from '../src/main/projects/project-guide'
import {
  CHAT_TITLE_CHARS,
  ProjectChatStore,
  type ChatSender,
  type ProjectChatStoreDeps,
} from '../src/main/projects/chat-store'

/** Chats inside a project folder (spec 3, 5.3, 5.7) */

let base: string
let settingsPath: string
let clock: number
let guide: ProjectGuide
let trashed: string[]
let trashDir: string

function folder(...parts: string[]): string {
  const path = join(base, ...parts)
  mkdirSync(path, { recursive: true })
  return path
}

function makeGuide(): ProjectGuide {
  return new ProjectGuide({
    settingsPath,
    homeDir: folder('home'),
    userData: folder('appdata', 'IeumOffice'),
    defaultParentDir: () => folder('documents', 'IeumOffice'),
    env: {},
    language: () => 'en',
    now: () => new Date(clock),
  })
}

const trash = vi.fn(async (path: string) => {
  trashed.push(path)
  renameSync(path, join(trashDir, `${trashed.length}-${basename(path)}`))
})

function makeStore(extra: Partial<ProjectChatStoreDeps> = {}): ProjectChatStore {
  let n = 0
  return new ProjectChatStore({
    guide,
    trash,
    now: () => new Date((clock += 1000)),
    newId: () => `chat${++n}`,
    ...extra,
  })
}

const answer = (value: ProjectTrustAnswer) => vi.fn(async () => value)

async function addProject(
  name: string,
  trust: ProjectTrustAnswer = 'use',
): Promise<{
  id: string
  root: string
}> {
  const root = folder(name)
  const result = await guide.addFolder(root, answer(trust))
  if (result.status !== 'added') throw new Error(`not added: ${JSON.stringify(result)}`)
  return { id: result.project.id, root: result.project.path }
}

function chatsDir(root: string): string {
  return join(root, '.ieumoffice', 'chats')
}

function infoOf(root: string, chatId: string): ProjectChatInfo {
  return JSON.parse(readFileSync(join(chatsDir(root), `${chatId}.json`), 'utf8')) as ProjectChatInfo
}

function linesOf(root: string, chatId: string): ProjectChatMessage[] {
  return readFileSync(join(chatsDir(root), `${chatId}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ProjectChatMessage)
}

function plantChat(
  root: string,
  chatId: string,
  info: Partial<ProjectChatInfo>,
  messages: Array<Partial<ProjectChatMessage> | string>,
): void {
  mkdirSync(chatsDir(root), { recursive: true })
  const full: ProjectChatInfo = {
    version: 1,
    id: chatId,
    projectId: 'x',
    title: chatId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    origin: guide.installId(),
    lastEditor: 'docs',
    documents: [],
    ...info,
  }
  writeFileSync(join(chatsDir(root), `${chatId}.json`), JSON.stringify(full))
  writeFileSync(
    join(chatsDir(root), `${chatId}.jsonl`),
    messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + '\n',
  )
}

function msg(seq: number, extra: Partial<ProjectChatMessage> = {}): Partial<ProjectChatMessage> {
  return {
    seq,
    ts: '2026-01-01T00:00:00.000Z',
    role: seq % 2 === 0 ? 'user' : 'assistant',
    text: `m${seq}`,
    editor: 'docs',
    origin: guide.installId(),
    ...extra,
  }
}

const home: ChatSender = { editor: 'home', docPath: null }

function args(
  ref: { projectId: string; chatId: string },
  role: 'user' | 'assistant',
  text: string,
  extra: Partial<AppendProjectChatArgs> = {},
): AppendProjectChatArgs {
  return { ...ref, role, text, ...extra }
}

beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'project-chats-')))
  settingsPath = join(folder('appdata', 'IeumOffice'), 'app-settings.json')
  trashDir = folder('trash')
  clock = Date.UTC(2026, 9, 29, 12, 0, 0)
  guide = makeGuide()
  trashed = []
  trash.mockClear()
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('new chat ids', () => {
  it('makes pattern-valid ids without writing anything', async () => {
    const { id, root } = await addProject('p')
    const store = new ProjectChatStore({ guide, trash })
    const a = await store.newChat(id)
    const b = await store.newChat(id)
    expect(a.chatId).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.chatId).not.toBe(b.chatId)
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
  })

  it('skips an id whose files already exist', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'chat1', { projectId: id }, [msg(0)])
    const store = makeStore()
    expect((await store.newChat(id)).chatId).toBe('chat2')
  })

  it('refuses an unknown project', async () => {
    await expect(makeStore().newChat('nope')).rejects.toThrow()
  })
})

describe('appending', () => {
  it('writes no file before the first assistant reply', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    const first = await store.append(args(ref, 'user', 'hello'), home)
    expect(first.status).toBe('pending')
    expect(existsSync(join(root, '.ieumoffice'))).toBe(false)
    expect(await store.listChats(id)).toEqual([])

    const reply = await store.append(args(ref, 'assistant', 'hi'), home)
    expect(reply.status).toBe('saved')
    const lines = linesOf(root, ref.chatId)
    expect(lines.map((m) => [m.seq, m.role, m.text])).toEqual([
      [0, 'user', 'hello'],
      [1, 'assistant', 'hi'],
    ])
    expect(lines.every((m) => m.editor === 'home' && m.origin === guide.installId())).toBe(true)
    const info = infoOf(root, ref.chatId)
    expect(info).toMatchObject({
      version: 1,
      id: ref.chatId,
      projectId: id,
      title: 'hello',
      origin: guide.installId(),
      lastEditor: 'home',
      documents: [],
    })
    // The first write also gives the folder its identity
    expect(existsSync(join(root, '.ieumoffice', 'project.json'))).toBe(true)
  })

  it('materializes the buffer early at 200 opening messages', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    for (let i = 0; i < 199; i++) {
      expect((await store.append(args(ref, 'user', `q${i}`), home)).status).toBe('pending')
    }
    expect((await store.append(args(ref, 'user', 'q199'), home)).status).toBe('saved')
    expect(linesOf(root, ref.chatId)).toHaveLength(200)
  }, 60_000)

  it('titles a chat with the first user message, cut to the title length', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    const long = `  first line\nsecond ${'x'.repeat(100)}`
    await store.append(args(ref, 'user', long), home)
    await store.append(args(ref, 'assistant', 'ok'), home)
    const title = infoOf(root, ref.chatId).title
    expect(Array.from(title)).toHaveLength(CHAT_TITLE_CHARS)
    expect(title.startsWith('first line second x')).toBe(true)
    await store.append(args(ref, 'user', 'later question'), home)
    expect(infoOf(root, ref.chatId).title).toBe(title)
  })

  it('caps stored fields as project-store does', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    const tools = Array.from({ length: 70 }, (_, i) => ({
      name: `t${i}`,
      summary: 's',
      input: 'i'.repeat(20_000),
      output: { big: 'o'.repeat(20_000) } as unknown as string,
    }))
    const attachments = Array.from({ length: 40 }, (_, i) => ({ name: `a${i}.txt` }))
    await store.append(args(ref, 'user', 'q', { attachments }), home)
    await store.append(args(ref, 'assistant', 'y'.repeat(40_000), { tools }), home)
    const [user, assistant] = linesOf(root, ref.chatId)
    expect(user!.attachments).toHaveLength(32)
    expect(assistant!.text).toBe('y'.repeat(32_000) + '\n\n[truncated]')
    expect(assistant!.tools).toHaveLength(64)
    expect(assistant!.tools![0]!.input).toHaveLength(16_000)
    expect(assistant!.tools![0]!.output).toHaveLength(16_000)
  })

  it('rejects a bad role, text or editor', async () => {
    const { id } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, chatId: 'c1' }
    await expect(
      store.append({ ...ref, role: 'system' as 'user', text: 'x' }, home),
    ).rejects.toThrow()
    await expect(
      store.append({ ...ref, role: 'user', text: 5 as unknown as string }, home),
    ).rejects.toThrow()
    await expect(
      store.append(args(ref, 'user', 'x'), { editor: 'word' as 'docs', docPath: null }),
    ).rejects.toThrow()
    await expect(
      store.append(args({ projectId: id, chatId: '../x' }, 'user', 'x'), home),
    ).rejects.toThrow()
  })

  it('keeps seq monotonic across two windows appending at once', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'a'), home)
    const a: ChatSender = { editor: 'docs', docPath: null }
    const b: ChatSender = { editor: 'hwp', docPath: null }
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.append(args(ref, i % 2 ? 'assistant' : 'user', `w${i}`), i % 3 ? a : b),
      ),
    )
    const seqs = results.map((r) => (r.status === 'saved' ? r.message.seq : -1))
    expect(new Set(seqs).size).toBe(20)
    const fileSeqs = linesOf(root, ref.chatId).map((m) => m.seq)
    expect(fileSeqs).toEqual(Array.from({ length: 22 }, (_, i) => i))
  }, 60_000)

  it('continues seq from the file maximum with a fresh store', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'old', { projectId: id }, [msg(0), msg(1), msg(41)])
    const store = makeStore()
    const saved = await store.append(args({ projectId: id, chatId: 'old' }, 'user', 'next'), home)
    expect(saved.status).toBe('saved')
    expect(saved.status === 'saved' && saved.message.seq).toBe(42)
  })

  it('holds a bounded number of chat states and rebuilds a dropped one from the file', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore({ stateCacheLimit: 2 })
    const chats: Array<{ projectId: string; chatId: string }> = []
    for (let i = 0; i < 5; i++) {
      const ref = { projectId: id, ...(await store.newChat(id)) }
      chats.push(ref)
      await store.append(args(ref, 'user', `q${i}`), home)
      await store.append(args(ref, 'assistant', `a${i}`), home)
    }
    expect(store.heldStateCount()).toBeLessThanOrEqual(2)
    // the first chat's state was dropped: its next seq comes from the file again
    const next = await store.append(args(chats[0]!, 'user', 'again'), home)
    expect(next.status === 'saved' && next.message.seq).toBe(2)
    expect(linesOf(root, chats[0]!.chatId).map((m) => m.seq)).toEqual([0, 1, 2])
    expect(store.heldStateCount()).toBeLessThanOrEqual(2)
  })

  it('never drops a chat whose opening messages are still in memory', async () => {
    const { id } = await addProject('p')
    const store = makeStore({ stateCacheLimit: 1 })
    const waiting = { projectId: id, ...(await store.newChat(id)) }
    expect((await store.append(args(waiting, 'user', 'first question'), home)).status).toBe(
      'pending',
    )
    for (let i = 0; i < 3; i++) {
      const ref = { projectId: id, ...(await store.newChat(id)) }
      await store.append(args(ref, 'user', `q${i}`), home)
      await store.append(args(ref, 'assistant', `a${i}`), home)
    }
    const opened = await store.append(args(waiting, 'assistant', 'answer'), home)
    expect(opened.status === 'saved' && opened.message.seq).toBe(1)
    const read = await store.openChat({ projectId: id, chatId: waiting.chatId })
    expect(read.status === 'ok' && read.messages.map((m) => m.text)).toEqual([
      'first question',
      'answer',
    ])
  })

  it('remembers a bounded number of foreign-message scans', async () => {
    const { id, root } = await addProject('p')
    for (let i = 0; i < 6; i++) {
      plantChat(root, `c${i}`, { projectId: id }, [msg(0, i % 2 ? { origin: 'otherPc' } : {})])
    }
    const store = makeStore({ foreignCacheLimit: 3 })
    const first = await store.listChats(id)
    expect(store.heldForeignScanCount()).toBeLessThanOrEqual(3)
    // still correct after the scans were dropped
    expect(await store.listChats(id)).toEqual(first)
    expect(
      first
        .filter((c) => c.foreign)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['c1', 'c3', 'c5'])
  })

  it('starts a new line when the file does not end with a newline', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'cut', { projectId: id }, [msg(0), msg(1)])
    const path = join(chatsDir(root), 'cut.jsonl')
    writeFileSync(path, readFileSync(path, 'utf8').trimEnd())
    await makeStore().append(args({ projectId: id, chatId: 'cut' }, 'user', 'next'), home)
    expect(linesOf(root, 'cut').map((m) => m.seq)).toEqual([0, 1, 2])
  })
})

describe('documents of a chat', () => {
  it('keeps folder-relative paths in last-used order and the last editor', async () => {
    const { id, root } = await addProject('p')
    const sub = folder('p', 'sub')
    const a = join(root, 'a.docx')
    const b = join(sub, 'b.hwp')
    writeFileSync(a, '')
    writeFileSync(b, '')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), { editor: 'docs', docPath: a })
    await store.append(args(ref, 'assistant', 'r'), { editor: 'docs', docPath: a })
    expect(infoOf(root, ref.chatId).documents).toEqual(['a.docx'])
    await store.append(args(ref, 'user', 'q2'), { editor: 'hwp', docPath: b })
    expect(infoOf(root, ref.chatId)).toMatchObject({
      documents: ['a.docx', 'sub/b.hwp'],
      lastEditor: 'hwp',
    })
    const again = await store.append(args(ref, 'user', 'q3'), { editor: 'docs', docPath: a })
    expect(infoOf(root, ref.chatId).documents).toEqual(['sub/b.hwp', 'a.docx'])
    expect(again.status === 'saved' && again.message.fileRef).toBe('a.docx')
  })

  it('records a document outside the folder in settings, not in documents', async () => {
    const { id, root } = await addProject('p')
    const outside = join(folder('elsewhere'), 'x.docx')
    writeFileSync(outside, '')
    const spy = vi.spyOn(guide, 'recordOutsideChat')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    const sender: ChatSender = { editor: 'docs', docPath: outside }
    const pending = await store.append(args(ref, 'user', 'q'), sender)
    expect(spy).not.toHaveBeenCalled()
    const saved = await store.append(args(ref, 'assistant', 'r'), sender)
    expect(spy).toHaveBeenCalledWith(outside, id, ref.chatId)
    expect(infoOf(root, ref.chatId).documents).toEqual([])
    expect(pending.status === 'pending' && pending.message.fileRef).toBe('x.docx')
    expect(saved.status === 'saved' && saved.message.fileRef).toBe('x.docx')
  })
})

describe('listing and opening', () => {
  it('lists only this project id, newest first, and marks other-PC chats', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'mine', { projectId: id, updatedAt: '2026-03-01T00:00:00.000Z' }, [msg(0)])
    plantChat(root, 'copied', { projectId: 'otherProject' }, [msg(0)])
    plantChat(
      root,
      'theirInfo',
      { projectId: id, origin: 'otherPc', updatedAt: '2026-02-01T00:00:00.000Z' },
      [msg(0)],
    )
    plantChat(root, 'theirMsg', { projectId: id, updatedAt: '2026-04-01T00:00:00.000Z' }, [
      msg(0),
      msg(1, { origin: 'otherPc' }),
    ])
    writeFileSync(join(chatsDir(root), 'broken.json'), '{nope')
    writeFileSync(join(chatsDir(root), 'bad id!.json'), JSON.stringify({ projectId: id }))
    const listed = await makeStore().listChats(id)
    expect(listed.map((c) => [c.id, c.foreign])).toEqual([
      ['theirMsg', true],
      ['mine', false],
      ['theirInfo', true],
    ])
    expect(listed[0]).toMatchObject({ title: 'theirMsg', lastEditor: 'docs' })
  })

  it('hides other-PC chats under "without"', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'mine', { projectId: id }, [msg(0)])
    plantChat(root, 'theirs', { projectId: id }, [msg(0, { origin: 'otherPc' })])
    await guide.decideTrust(id, 'without', answer(null))
    const store = makeStore()
    expect((await store.listChats(id)).map((c) => c.id)).toEqual(['mine'])
    expect(await store.openChat({ projectId: id, chatId: 'theirs' })).toEqual({
      status: 'not-found',
    })
    expect((await store.openChat({ projectId: id, chatId: 'mine' })).status).toBe('ok')
  })

  it('opens the tail leniently', async () => {
    const { id, root } = await addProject('p')
    const lines: Array<Partial<ProjectChatMessage> | string> = []
    for (let i = 0; i < 250; i++) lines.push(msg(i))
    lines.splice(10, 0, '{broken json')
    lines.splice(20, 0, JSON.stringify({ ...msg(999), seq: null }))
    lines.push(msg(250, { origin: 'otherPc' }))
    plantChat(root, 'long', { projectId: id }, lines)
    const store = makeStore()
    const opened = await store.openChat({ projectId: id, chatId: 'long' })
    if (opened.status !== 'ok') throw new Error('not opened')
    expect(opened.messages).toHaveLength(200)
    expect(opened.messages.at(-1)!.seq).toBe(250)
    expect(opened.foreign).toBe(true)
    const few = await store.openChat({ projectId: id, chatId: 'long', limit: 3 })
    expect(few.status === 'ok' && few.messages.map((m) => m.seq)).toEqual([248, 249, 250])
    const all = await store.openChat({ projectId: id, chatId: 'long', limit: 1e9 })
    expect(all.status === 'ok' && all.messages).toHaveLength(251)
  })

  it('reads only the last 8 MiB, widening past one oversized record', async () => {
    const { id, root } = await addProject('p')
    const huge = 'z'.repeat(9 * 1024 * 1024)
    const store = makeStore()
    plantChat(root, 'tail', { projectId: id }, [msg(0), msg(1, { text: huge }), msg(2)])
    const tail = await store.openChat({ projectId: id, chatId: 'tail' })
    expect(tail.status === 'ok' && tail.messages.map((m) => m.seq)).toEqual([2])
    plantChat(root, 'big', { projectId: id }, [msg(0), msg(1, { text: huge })])
    const big = await store.openChat({ projectId: id, chatId: 'big' })
    expect(big.status === 'ok' && big.messages.map((m) => m.seq)).toEqual([0, 1])
  })

  it('does not open a chat of another project id or a missing one', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'copied', { projectId: 'otherProject' }, [msg(0)])
    const store = makeStore()
    expect((await store.openChat({ projectId: id, chatId: 'copied' })).status).toBe('not-found')
    expect((await store.openChat({ projectId: id, chatId: 'none' })).status).toBe('not-found')
  })
})

describe('chat for a document (spec 5.3.1)', () => {
  it('picks the latest visible chat that used the document', async () => {
    const { id, root } = await addProject('p')
    const doc = join(root, 'r.docx')
    writeFileSync(doc, '')
    plantChat(
      root,
      'older',
      { projectId: id, updatedAt: '2026-01-01T00:00:00.000Z', documents: ['r.docx'] },
      [msg(0)],
    )
    plantChat(
      root,
      'newer',
      { projectId: id, updatedAt: '2026-02-01T00:00:00.000Z', documents: ['r.docx', 'z.docx'] },
      [msg(0)],
    )
    plantChat(
      root,
      'copied',
      { projectId: 'otherProject', updatedAt: '2026-09-01T00:00:00.000Z', documents: ['r.docx'] },
      [msg(0)],
    )
    plantChat(
      root,
      'foreign',
      {
        projectId: id,
        origin: 'otherPc',
        updatedAt: '2026-08-01T00:00:00.000Z',
        documents: ['r.docx'],
      },
      [msg(0)],
    )
    plantChat(
      root,
      'unrelated',
      { projectId: id, updatedAt: '2026-07-01T00:00:00.000Z', documents: ['q.docx'] },
      [msg(0)],
    )
    const store = makeStore()
    expect(await store.chatForDocument(id, doc)).toBe('foreign')
    await guide.decideTrust(id, 'without', answer(null))
    expect(await store.chatForDocument(id, doc)).toBe('newer')
    expect(await store.chatForDocument(id, join(root, 'none.docx'))).toBeNull()
  })

  it('uses the recorded last chat of a document outside the folder while visible', async () => {
    const { id, root } = await addProject('p')
    const outside = join(folder('elsewhere'), 'x.docx')
    writeFileSync(outside, '')
    const store = makeStore()
    expect(await store.chatForDocument(id, outside)).toBeNull()
    await guide.setSelection({ kind: 'document', path: outside }, id)
    plantChat(root, 'kept', { projectId: id }, [msg(0)])
    await guide.recordOutsideChat(outside, id, 'kept')
    expect(await store.chatForDocument(id, outside)).toBe('kept')
    await guide.recordOutsideChat(outside, id, 'gone')
    expect(await store.chatForDocument(id, outside)).toBeNull()
    plantChat(root, 'theirs', { projectId: id, origin: 'otherPc' }, [msg(0)])
    await guide.recordOutsideChat(outside, id, 'theirs')
    await guide.decideTrust(id, 'without', answer(null))
    expect(await store.chatForDocument(id, outside)).toBeNull()
  })
})

describe('attaching a just-saved document (spec 5.3.6)', () => {
  it('adds the path to a saved chat at once', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), { editor: 'docs', docPath: null })
    await store.append(args(ref, 'assistant', 'r'), { editor: 'docs', docPath: null })
    const doc = join(root, 'new.docx')
    writeFileSync(doc, '')
    expect(await store.attachDocument(ref, doc)).toEqual({ status: 'ok' })
    expect(infoOf(root, ref.chatId).documents).toEqual(['new.docx'])
    expect(await store.chatForDocument(id, doc)).toBe(ref.chatId)
  })

  it('carries the path into a chat that has no file yet', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), { editor: 'docs', docPath: null })
    const doc = join(root, 'new.docx')
    writeFileSync(doc, '')
    expect(await store.attachDocument(ref, doc)).toEqual({ status: 'ok' })
    expect(existsSync(chatsDir(root))).toBe(false)
    await store.append(args(ref, 'assistant', 'r'), { editor: 'docs', docPath: doc })
    expect(infoOf(root, ref.chatId).documents).toEqual(['new.docx'])
  })

  it('ignores a document saved outside the project folder', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'r'), home)
    const outside = join(folder('elsewhere'), 'x.docx')
    writeFileSync(outside, '')
    expect(await store.attachDocument(ref, outside)).toEqual({ status: 'ok' })
    expect(infoOf(root, ref.chatId).documents).toEqual([])
  })
})

describe('rename and delete', () => {
  it('renames a chat and keeps the title against later messages', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'r'), home)
    expect(await store.renameChat({ ...ref, title: '  My\nchat ' })).toEqual({ status: 'ok' })
    expect(infoOf(root, ref.chatId).title).toBe('My chat')
    await store.append(args(ref, 'user', 'another'), home)
    expect(infoOf(root, ref.chatId).title).toBe('My chat')
    await expect(store.renameChat({ ...ref, title: '   ' })).rejects.toThrow()
  })

  it('a rename before the first reply wins over the automatic title', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.renameChat({ ...ref, title: 'Named' })
    expect(existsSync(chatsDir(root))).toBe(false)
    await store.append(args(ref, 'assistant', 'r'), home)
    expect(infoOf(root, ref.chatId).title).toBe('Named')
  })

  it('moves both files to the trash and never deletes', async () => {
    const { id, root } = await addProject('p')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'r'), home)
    expect(await store.deleteChat(ref)).toEqual({ status: 'ok' })
    expect(trashed.map((p) => basename(p)).sort()).toEqual([
      `${ref.chatId}.json`,
      `${ref.chatId}.jsonl`,
    ])
    expect(readdirSync(chatsDir(root))).toEqual([])
    expect(readdirSync(trashDir)).toHaveLength(2)
    expect(await store.listChats(id)).toEqual([])
  })

  it('does not delete a chat of another project id', async () => {
    const { id, root } = await addProject('p')
    plantChat(root, 'copied', { projectId: 'otherProject' }, [msg(0)])
    await makeStore().deleteChat({ projectId: id, chatId: 'copied' })
    expect(trash).not.toHaveBeenCalled()
    expect(existsSync(join(chatsDir(root), 'copied.json'))).toBe(true)
  })

  it('reports a failed trash as unwritable', async () => {
    const { id } = await addProject('p')
    const store = makeStore({ trash: async () => Promise.reject(new Error('no trash')) })
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'r'), home)
    expect(await store.deleteChat(ref)).toEqual({ status: 'unwritable' })
  })
})

describe('unwritable folders (spec 5.7)', () => {
  it('surfaces unwritable, keeps the messages, and writes them after a retry', async () => {
    const { id, root } = await addProject('p')
    // `.ieumoffice` as a plain file: every write into it fails
    writeFileSync(join(root, '.ieumoffice'), 'blocker')
    const store = makeStore()
    const ref = { projectId: id, ...(await store.newChat(id)) }
    expect((await store.append(args(ref, 'user', 'q'), home)).status).toBe('pending')
    expect(await store.append(args(ref, 'assistant', 'r'), home)).toEqual({ status: 'unwritable' })
    expect(guide.isUnwritable(id)).toBe(true)
    expect(await store.append(args(ref, 'user', 'q2'), home)).toEqual({ status: 'unwritable' })

    rmSync(join(root, '.ieumoffice'))
    expect(await guide.retryUnwritable(id)).toEqual({ status: 'ok' })
    const after = await store.append(args(ref, 'assistant', 'r2'), home)
    expect(after.status).toBe('saved')
    expect(linesOf(root, ref.chatId).map((m) => [m.seq, m.text])).toEqual([
      [0, 'q'],
      [1, 'r'],
      [2, 'q2'],
      [3, 'r2'],
    ])
  })
})

describe('append events', () => {
  it('emits each message after it is written, with its sender', async () => {
    const { id } = await addProject('p')
    const store = makeStore()
    const seen: Array<[ProjectChatAppendedEvent, ChatSender]> = []
    const off = store.onAppended((event, sender) => seen.push([event, sender]))
    const ref = { projectId: id, ...(await store.newChat(id)) }
    const sender: ChatSender = { editor: 'docs', docPath: null, key: 7 }
    await store.append(args(ref, 'user', 'q'), sender)
    expect(seen).toEqual([])
    await store.append(args(ref, 'assistant', 'r'), sender)
    expect(seen.map(([event, from]) => [event.chatId, event.message.text, from.key])).toEqual([
      [ref.chatId, 'q', 7],
      [ref.chatId, 'r', 7],
    ])
    off()
    await store.append(args(ref, 'user', 'q2'), sender)
    expect(seen).toHaveLength(2)
  })

  it('emits nothing when the write fails', async () => {
    const { id, root } = await addProject('p')
    writeFileSync(join(root, '.ieumoffice'), 'blocker')
    const store = makeStore()
    const listener = vi.fn()
    store.onAppended(listener)
    const ref = { projectId: id, ...(await store.newChat(id)) }
    await store.append(args(ref, 'user', 'q'), home)
    await store.append(args(ref, 'assistant', 'r'), home)
    expect(listener).not.toHaveBeenCalled()
  })
})
