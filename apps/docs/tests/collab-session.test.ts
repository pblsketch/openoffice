/**
 * Word co-editing over an in-memory relay (decision 0073): two real editors,
 * the host's and a guest's, bound the way the app binds them. Covers what the
 * shared body must keep right for the host's save: remote edits are nobody's
 * tracked change and count as the host's unsaved changes, undo stays per
 * person, and a host save's re-based file reaches every guest.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { clearCollabHistory } from '@genoffice/collab/tiptap'
import { parseDocx, readSections, saveDocx, type ParsedDocFull } from '@genoffice/docx-engine'
import { collabText, startHosting, takeGuestSession, type CollabSession } from '@genoffice/collab'
import { FakeRelay } from '../../../packages/collab/tests/fake-relay'
import { editorExtensions, TABLE_TRAILING_SKIP } from '../src/renderer/editor/extensions'
import { TRACK_IGNORE } from '../src/renderer/editor/revisions'
import {
  blocksToPmDoc,
  pmDocOptions,
  pmDocToSavePlan,
  type PmNode,
} from '../src/renderer/editor/convert'
import type { FileActionContext } from '../src/renderer/file-actions'
import { getLang } from '../src/renderer/i18n/locale'

// jsdom has no CSS.escape; the document stylesheet uses it
;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s }

const toast = vi.fn()
vi.mock('../src/renderer/components/toast-bus', () => ({
  showToast: (...args: unknown[]) => toast(...args),
  setToastEmitter: () => {},
}))

const { bindDocs, describeDocs, dirtiesDocument, docsShareBlock, shareBaseline } =
  await import('../src/renderer/collab')
const { setCollabGate } = await import('../src/renderer/collab-gate')
const { save, writeRecoveryCopy } = await import('../src/renderer/file-actions')
type Link = Parameters<typeof bindDocs>[1]

const FIXTURE = join(__dirname, 'pagination-corpus/docx/simple.docx')

interface Peer {
  editor: Editor
  ctx: FileActionContext
  state: Record<string, unknown>
  calls: Array<[string, unknown[]]>
  link: Link
  session?: CollabSession
  unbind?: () => void
}

const editors = new Set<Editor>()
const unbinds = new Set<() => void>()

beforeEach(() => {
  ;(window as unknown as { desktop: unknown }).desktop = {
    collabGuest: async () => {},
    collabServeMedia: async () => true,
    materializeDocx: async () => null,
  }
  toast.mockClear()
})

afterEach(() => {
  for (const unbind of unbinds) unbind()
  unbinds.clear()
  for (const editor of editors) editor.destroy()
  editors.clear()
  setCollabGate(null)
})

/** the App state the file actions see, recording every setter */
function peerOf(parsed: ParsedDocFull): Peer {
  const editor = new Editor({
    extensions: editorExtensions,
    content: blocksToPmDoc(parsed.blocks, readSections(parsed), pmDocOptions(parsed)) as never,
  })
  editors.add(editor)
  const calls: Array<[string, unknown[]]> = []
  const state: Record<string, unknown> = {
    editor,
    doc: { parsed, filePath: null, fileName: 'plan.docx', hash: '', format: 'docx' },
    dirtyRef: { current: false },
    saveInFlightRef: { current: false },
    saveIncompleteRef: { current: false },
    sectionsDirty: [],
    hfVariantsDirty: [],
    pgNumDirtySections: [],
    sectionHfEdits: {},
    hfLinks: {},
    styleUpserts: {},
    trailingStartType: null,
    pgNumEdit: null,
  }
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      if (key.startsWith('set')) {
        return (...args: unknown[]) => {
          calls.push([key, args])
          if (key === 'setDoc') {
            const next = args[0]
            target.doc = typeof next === 'function' ? next(target.doc) : next
          }
        }
      }
      return key.endsWith('Dirty') ? false : undefined
    },
  }) as unknown as FileActionContext
  return { editor, ctx, state, calls, link: { ctx: () => ctx, session: null, sent: null } }
}

async function openBase(bytes: Uint8Array): Promise<ParsedDocFull> {
  return parseDocx(bytes.slice())
}

async function share(relay: FakeRelay, host: Peer): Promise<Uint8Array> {
  const doc = await describeDocs(() => host.ctx)
  if (!doc) throw new Error('nothing to share')
  const started = await startHosting(
    relay.host(),
    { kind: 'docs', ...doc },
    { name: 'Host', color: 1 },
    (session) => {
      host.unbind = bindDocs(session, host.link)
      unbinds.add(host.unbind)
    },
  )
  if (!started.ok) throw new Error(started.reason)
  host.session = started.session
  return doc.base
}

async function joinAs(relay: FakeRelay, base: Uint8Array, name: string): Promise<Peer> {
  const bridge = relay.guest('docs')
  await relay.flush()
  // the guest's tab opened the host's file first, like a template copy
  const guest = peerOf(await openBase(base))
  const session = await takeGuestSession(bridge, { name, color: 3 })
  if (!session) throw new Error('no ticket')
  await relay.flush()
  await session.synced
  guest.session = session
  guest.unbind = bindDocs(session, guest.link)
  unbinds.add(guest.unbind)
  await relay.flush()
  return guest
}

const text = (peer: Peer) => peer.editor.state.doc.textContent
const typeAt = (peer: Peer, at: number, value: string) =>
  peer.editor.view.dispatch(peer.editor.state.tr.insertText(value, at))
/** the position right after the first block's text */
const firstBlockEnd = (peer: Peer) => peer.editor.state.doc.firstChild!.nodeSize - 1

describe('sharing a Word document', () => {
  it('shares only the saved file and refuses what cannot travel', async () => {
    const parsed = await openBase(new Uint8Array(readFileSync(FIXTURE)))
    const host = peerOf(parsed)
    expect(docsShareBlock(host.ctx)).toBeNull()
    const doc = await describeDocs(() => host.ctx)
    expect(doc?.fileName).toBe('plan.docx')
    expect(Buffer.from(doc!.base).equals(Buffer.from(parsed.internal.originalBytes))).toBe(true)

    host.state.dirtyRef = { current: true }
    expect(docsShareBlock(host.ctx)).toBe('save-first')
    host.state.dirtyRef = { current: false }
    host.state.doc = { ...(host.state.doc as object), encrypted: true }
    expect(docsShareBlock(host.ctx)).toBe('encrypted')
    host.state.doc = { ...(host.state.doc as object), encrypted: false, format: 'odt', odt: {} }
    expect(docsShareBlock(host.ctx)).toBe('unsupported')
  })

  it('carries edits both ways; remote ones are the host’s unsaved changes and nobody’s tracked change', async () => {
    const relay = new FakeRelay()
    const host = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    const hostTrs: Transaction[] = []
    host.editor.on('update', ({ transaction }) => hostTrs.push(transaction))
    host.editor.storage.trackChanges.enabled = true
    const base = await share(relay, host)
    const guest = await joinAs(relay, base, 'Jun')
    expect(guest.editor.getJSON()).toEqual(host.editor.getJSON())

    // the first render of the shared state changed nothing, so nothing counts as an edit
    expect(hostTrs).toEqual([])
    setCollabGate({ role: 'host', othersIn: true })

    typeAt(guest, firstBlockEnd(guest), ' guest')
    await relay.flush()
    expect(text(host)).toContain(' guest')
    const remote = hostTrs.at(-1)!
    expect(remote.getMeta(TRACK_IGNORE)).toBe(true)
    expect(remote.getMeta(TABLE_TRAILING_SKIP)).toBe(true)
    expect(dirtiesDocument(remote)).toBe(true)
    // the host records its own edits only
    let insMarks = 0
    host.editor.state.doc.descendants((node) => {
      if (node.marks.some((m) => m.type.name === 'ins')) insMarks++
    })
    expect(insMarks).toBe(0)

    typeAt(host, 1, 'Host: ')
    await relay.flush()
    expect(text(guest)).toBe(text(host))
    // the host's own typing is its tracked change, and the guest sees it as such
    expect(guest.editor.getJSON()).toEqual(host.editor.getJSON())

    // a guest's editor never counts anything as its own change
    setCollabGate({ role: 'guest', othersIn: true })
    expect(dirtiesDocument(remote)).toBe(false)
    expect(guest.ctx.dirtyRef.current).toBe(false)
  })

  it('undo takes back only this person’s edits', async () => {
    const relay = new FakeRelay()
    const host = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    const guest = await joinAs(relay, await share(relay, host), 'Jun')
    typeAt(guest, firstBlockEnd(guest), ' from guest')
    await relay.flush()
    typeAt(host, 1, 'Host says ')
    await relay.flush()
    expect(guest.editor.can().undo()).toBe(true)
    guest.editor.commands.undo()
    await relay.flush()
    expect(text(host)).not.toContain(' from guest')
    expect(text(host)).toContain('Host says ')
    expect(text(guest)).toBe(text(host))
  })

  it('undoing a new paragraph keeps what someone else typed into it', async () => {
    const relay = new FakeRelay()
    const host = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    const guest = await joinAs(relay, await share(relay, host), 'Jun')
    const { schema } = guest.editor
    const after = guest.editor.state.doc.firstChild!.nodeSize
    guest.editor.view.dispatch(
      guest.editor.state.tr.insert(
        after,
        schema.nodes.docParagraph.create(null, schema.text('Jun line')),
      ),
    )
    await relay.flush()
    typeAt(host, after + 1 + 'Jun line'.length, ' and Mina')
    await relay.flush()
    guest.editor.commands.undo()
    await relay.flush()
    expect(text(host)).not.toContain('Jun line')
    expect(text(host)).toContain(' and Mina')
    expect(text(guest)).toBe(text(host))
  })

  it('clearing the shared undo keeps the binding and its undo alive', async () => {
    const relay = new FakeRelay()
    const host = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    const guest = await joinAs(relay, await share(relay, host), 'Jun')
    typeAt(host, 1, 'one ')
    expect(clearCollabHistory(host.editor)).toBe(true)
    expect(host.editor.can().undo()).toBe(false)
    typeAt(host, 1, 'two ')
    await relay.flush()
    host.editor.commands.undo()
    await relay.flush()
    expect(text(host).startsWith('one ')).toBe(true)
    expect(text(guest)).toBe(text(host))
    // an editor that is not shared has nothing to clear
    const alone = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    expect(clearCollabHistory(alone.editor)).toBe(false)
  })

  it('a host save’s re-based file reaches every guest, late joiners included', async () => {
    const relay = new FakeRelay()
    const parsed = await openBase(new Uint8Array(readFileSync(FIXTURE)))
    const host = peerOf(parsed)
    const base = await share(relay, host)
    const guest = await joinAs(relay, base, 'Jun')
    typeAt(guest, firstBlockEnd(guest), ' typed before the save')
    await relay.flush()

    // the host saves: the body is re-based on the file it wrote
    const plan = pmDocToSavePlan(host.editor.getJSON() as PmNode, parsed.blocks)
    const saved = new Uint8Array(await saveDocx(parsed, plan.saveBlocks, {}))
    const reparsed = await openBase(saved)
    host.state.doc = { ...(host.state.doc as object), parsed: reparsed }
    shareBaseline(host.link, reparsed)
    await relay.flush()
    await vi.waitFor(() => {
      const adopted = (guest.state.doc as { parsed: ParsedDocFull }).parsed
      expect(Buffer.from(adopted.internal.originalBytes).equals(Buffer.from(saved))).toBe(true)
    })
    expect(guest.calls.some(([name]) => name === 'setComments')).toBe(true)
    // an undo across the re-base would bring back the old indexes
    expect(guest.editor.can().undo()).toBe(false)

    const late = await joinAs(relay, base, 'Ari')
    await vi.waitFor(() => {
      const adopted = (late.state.doc as { parsed: ParsedDocFull }).parsed
      expect(Buffer.from(adopted.internal.originalBytes).equals(Buffer.from(saved))).toBe(true)
    })
    expect(text(late)).toBe(text(host))
  })

  it('a guest never saves or writes a recovery copy', async () => {
    const relay = new FakeRelay()
    const host = peerOf(await openBase(new Uint8Array(readFileSync(FIXTURE))))
    const guest = await joinAs(relay, await share(relay, host), 'Jun')
    setCollabGate({ role: 'guest', othersIn: true })
    guest.ctx.dirtyRef.current = true
    expect(await save(guest.ctx, false)).toBe(false)
    expect(toast).toHaveBeenCalledWith(collabText(getLang(), 'guestSaveBlocked'), 'error')
    toast.mockClear()
    // autosave and save-on-close stay quiet
    expect(await save(guest.ctx, false, true)).toBe(false)
    expect(toast).not.toHaveBeenCalled()
    expect(await writeRecoveryCopy(guest.ctx)).toBe('skipped')
  })

  it('tags another person’s edits for the editor’s own fixers', () => {
    const editor = new Editor({
      extensions: editorExtensions,
      content: { type: 'doc', content: [{ type: 'docParagraph' }] },
    })
    editors.add(editor)
    const seen: Transaction[] = []
    editor.on('transaction', ({ transaction }) => seen.push(transaction))
    editor.view.dispatch(
      editor.state.tr.insertText('x', 1).setMeta(ySyncPluginKey, { isChangeOrigin: true }),
    )
    editor.view.dispatch(editor.state.tr.insertText('y', 1))
    expect(seen[0].getMeta(TRACK_IGNORE)).toBe(true)
    expect(seen[0].getMeta(TABLE_TRAILING_SKIP)).toBe(true)
    expect(seen[1].getMeta(TRACK_IGNORE)).toBeUndefined()
  })
})
