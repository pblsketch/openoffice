// @vitest-environment node
/**
 * Internal links, the main side: a followed link is resolved against the
 * view's own file and opened through the shell router, a heading reaches the
 * views showing the target once, embeds grant only the pictures they resolved,
 * and a closed view loses what it was granted.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) => handlers.set(channel, fn),
  },
}))

import { MARKDOWN_CHANNELS } from '../src/shared/ipc'
import { forgetLinkState, isEmbedGranted, registerMarkdownLinkIpc } from '../src/main/link-ipc'

class FakeView {
  destroyed = false
  sent: string[] = []
  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  send(channel: string): void {
    this.sent.push(channel)
  }
}

let vault: string
let note: string
let other: string
let picture: string
const shown = new Map<FakeView, string>()
const opened: string[] = []
let routerAccepts = true

function invoke(channel: string, id: number, arg?: unknown): Promise<unknown> {
  const handler = handlers.get(channel) as unknown as (
    e: { sender: { id: number; isDestroyed(): boolean } },
    arg?: unknown,
  ) => unknown
  return Promise.resolve(handler({ sender: { id, isDestroyed: () => false } }, arg))
}

beforeAll(() => {
  vault = mkdtempSync(join(tmpdir(), 'md-link-ipc-'))
  mkdirSync(join(vault, '.obsidian'))
  mkdirSync(join(vault, 'img'))
  note = join(vault, 'Note.md')
  other = join(vault, 'Other.md')
  picture = join(vault, 'img', 'p.png')
  writeFileSync(note, '# Note')
  writeFileSync(other, '# Part')
  writeFileSync(picture, 'x')
  writeFileSync(join(vault, 'sheet.xlsx'), 'x')
})

afterAll(() => {
  rmSync(vault, { recursive: true, force: true })
})

const noteView = new FakeView(1)
const otherView = new FakeView(2)

beforeEach(() => {
  handlers.clear()
  shown.clear()
  opened.length = 0
  routerAccepts = true
  noteView.sent = []
  otherView.sent = []
  shown.set(noteView, note)
  shown.set(otherView, other)
  registerMarkdownLinkIpc({
    documentPath: (id) => [...shown].find(([v]) => v.id === id)?.[1] ?? null,
    views: () => shown.entries(),
    openPath: (path) => {
      opened.push(path)
      return routerAccepts
    },
  })
})

describe('markdown:open-link', () => {
  it('opens a wiki link through the router and leaves the heading for its tab once', async () => {
    expect(
      await invoke(MARKDOWN_CHANNELS.openLink, 1, {
        kind: 'wiki',
        target: 'Other',
        heading: 'Part',
      }),
    ).toEqual({ ok: true })
    expect(opened).toEqual([other])
    expect(otherView.sent).toEqual([MARKDOWN_CHANNELS.linkHeadingReady])
    expect(noteView.sent).toEqual([])
    expect(await invoke(MARKDOWN_CHANNELS.linkHeadingTake, 2)).toBe('Part')
    expect(await invoke(MARKDOWN_CHANNELS.linkHeadingTake, 2)).toBeNull()
  })

  it('opens a relative path; a heading is only left for a Markdown file', async () => {
    expect(
      await invoke(MARKDOWN_CHANNELS.openLink, 1, {
        kind: 'path',
        path: 'sheet.xlsx',
        heading: 'x',
      }),
    ).toEqual({ ok: true })
    expect(opened).toEqual([join(vault, 'sheet.xlsx')])
    expect(otherView.sent).toEqual([])
  })

  it('reports what the router or the resolver refused', async () => {
    routerAccepts = false
    expect(await invoke(MARKDOWN_CHANNELS.openLink, 1, { kind: 'wiki', target: 'Other' })).toEqual({
      ok: false,
      reason: 'blocked',
    })
    routerAccepts = true
    opened.length = 0
    expect(await invoke(MARKDOWN_CHANNELS.openLink, 1, { kind: 'wiki', target: 'Nope' })).toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(
      await invoke(MARKDOWN_CHANNELS.openLink, 1, { kind: 'path', path: '\\\\srv\\share\\a.md' }),
    ).toEqual({ ok: false, reason: 'blocked' })
    expect(await invoke(MARKDOWN_CHANNELS.openLink, 9, { kind: 'path', path: 'Other.md' })).toEqual(
      { ok: false, reason: 'untitled' },
    )
    expect(opened).toEqual([])
  })

  it('rejects malformed requests without touching the disk', async () => {
    for (const bad of [null, 'Other.md', { kind: 'exec', path: 'x' }, { kind: 'path' }]) {
      expect(await invoke(MARKDOWN_CHANNELS.openLink, 1, bad)).toEqual({
        ok: false,
        reason: 'not-found',
      })
    }
    expect(
      await invoke(MARKDOWN_CHANNELS.openLink, 1, { kind: 'wiki', target: 'x'.repeat(5000) }),
    ).toEqual({ ok: false, reason: 'not-found' })
    expect(opened).toEqual([])
  })
})

describe('markdown:resolve-embed', () => {
  it('grants only the resolved picture, until the view closes', async () => {
    const found = (await invoke(MARKDOWN_CHANNELS.resolveEmbed, 1, 'p.png')) as string
    expect(found.toLowerCase().endsWith(join('img', 'p.png').toLowerCase())).toBe(true)
    expect(isEmbedGranted(found)).toBe(true)
    expect(isEmbedGranted(note)).toBe(false)
    expect(await invoke(MARKDOWN_CHANNELS.resolveEmbed, 1, 'Other.md')).toBeNull()
    forgetLinkState(1)
    expect(isEmbedGranted(found)).toBe(false)
  })
})

describe('markdown:suggest-notes', () => {
  it('lists the vault notes for a saved view only', async () => {
    const items = (await invoke(MARKDOWN_CHANNELS.suggestNotes, 1, 'oth')) as { name: string }[]
    expect(items.map((i) => i.name)).toEqual(['Other'])
    expect(await invoke(MARKDOWN_CHANNELS.suggestNotes, 9, '')).toEqual([])
  })
})

describe('wiring', () => {
  const source = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  it('md-asset serves embed grants and a closed view forgets them', () => {
    const main = source('../src/main/markdown-main.ts')
    expect(main).toMatch(/!inDocDir && !isEmbedGranted\(target\)/)
    expect(main).toMatch(/once\('destroyed'[\s\S]*?forgetLinkState\(wcId\)/)
    expect(main).toMatch(/openPath: \(path\) => runtime\.openLinkedPath\?\.\(path\) \?\? false/)
  })

  it('the shell routes followed links through its document router', () => {
    const shell = source('../../shell/src/main/index.ts')
    expect(shell).toMatch(
      /configureMarkdownRuntime\(\{[\s\S]*?openLinkedPath: \(path\) => openDocumentPath\(path\)/,
    )
  })
})
