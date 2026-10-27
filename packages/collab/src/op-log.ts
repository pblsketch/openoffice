/**
 * A host-ordered op stream, for editors whose model is not a Yjs type
 * (spreadsheets, slides, mind maps). Every peer applies its own edits at
 * once; the host puts all edits in one order and everyone replays that order.
 *
 * - A guest's op goes to the host as a proposal. The host may rewrite it
 *   (`accept`) or refuse it; a guest whose op was refused or came back
 *   different starts over from the host's state.
 * - An epoch is a fresh starting point: after the host saves (an editor's
 *   ids can change on reload) or when a guest falls out of step, the host
 *   sends what a save would write now, and the sequence number it stands at.
 * - Ops travel with lib0's `writeAny`: plain objects, arrays, strings,
 *   numbers, booleans, null and Uint8Array survive; nothing else does.
 */
import type { CollabSession } from './session'

export interface OpLogOptions<Op> {
  /** distinguishes this stream's messages; one per editor is enough */
  topic: string
  /** host: what a guest's op becomes before it is applied and sent on; null refuses it */
  accept?(op: Op, from: string): Op | null | Promise<Op | null>
  /** apply an op made elsewhere (on the host, also a guest's accepted op) */
  apply(op: Op, from: string): void | Promise<void>
  /**
   * host: what a save would write now, for a guest that starts over. The
   * guest replays every op recorded after this call starts; an editor whose
   * edits reach the model before `submit` must leave those out of the bytes
   * or tell its guests to skip them.
   */
  snapshot(): Promise<Uint8Array>
  /** guest: replace the open document with the host's bytes */
  reload(bytes: Uint8Array): Promise<void>
  /** a guest dropped its own state for the host's; editors clear undo here */
  onResync?(): void
  /**
   * Whether two ops give the same result in either order (edits to different
   * cells or topics). When a guest's own unconfirmed op and someone else's do
   * not, the guest's copy may have taken a different order than the host's,
   * and it starts over from the host's state once its ops are confirmed.
   * Without this, every such overlap counts as a conflict.
   */
  commutes?(a: Op, b: Op): boolean
}

interface Entry<Op> {
  seq: number
  epoch: number
  by: string
  pid: string | null
  rewritten: boolean
  op: Op
}

interface Proposal<Op> {
  epoch: number
  pid: string
  op: Op
}

/** where to start: a snapshot at `seq`, or the epoch's base followed by `entries` */
interface Catchup<Op> {
  epoch: number
  seq: number
  snapshot: Uint8Array | null
  entries: Entry<Op>[]
}

export class OpLog<Op> {
  private epoch = 0
  private seq = 0
  private entries: Entry<Op>[] = []
  /** guest: its own ops the host has not confirmed yet */
  private readonly pending = new Map<string, Op>()
  /** guest: someone else's op landed among its unconfirmed ones */
  private outOfOrder = false
  private pidSeq = 0
  private queue: Promise<void> = Promise.resolve()
  private readonly offs: Array<() => void> = []
  private disposed = false

  constructor(
    private readonly session: CollabSession,
    private readonly options: OpLogOptions<Op>,
  ) {
    const t = options.topic
    if (session.role === 'host') {
      this.offs.push(
        session.on(`${t}:propose`, (payload, from) =>
          this.serial(() => this.onProposal(payload as Proposal<Op>, from)),
        ),
        session.handle(
          `${t}:catchup`,
          () =>
            new Promise<Catchup<Op>>((resolve, reject) => {
              this.serial(async () => resolve(await this.catchup(true))).catch(reject)
            }),
        ),
        session.onPeerJoin((peerId) =>
          this.serial(async () => this.session.send(`${t}:catchup`, await this.catchup(), peerId)),
        ),
      )
    } else {
      this.offs.push(
        session.on(`${t}:op`, (payload) => this.serial(() => this.onEntry(payload as Entry<Op>))),
        session.on(`${t}:reject`, (payload) =>
          this.serial(async () => {
            this.pending.delete(String((payload as { pid?: unknown } | null)?.pid))
            await this.resyncNow()
          }),
        ),
        session.on(`${t}:catchup`, (payload) =>
          this.serial(() => this.adopt(payload as Catchup<Op>)),
        ),
      )
    }
  }

  /** record an edit this peer has already made */
  submit(op: Op): void {
    if (this.disposed) return
    if (this.session.role === 'host') {
      this.record({ by: this.session.peerId, pid: null, rewritten: false, op })
      return
    }
    const pid = `${this.session.peerId}.${++this.pidSeq}`
    this.pending.set(pid, op)
    this.session.send(`${this.options.topic}:propose`, {
      epoch: this.epoch,
      pid,
      op,
    } satisfies Proposal<Op>)
  }

  /** host: start a new epoch from the current state (after a save that renumbers things) */
  rebase(): Promise<void> {
    return this.serial(async () => {
      if (this.session.role !== 'host') return
      this.epoch += 1
      this.entries = []
      this.session.send(`${this.options.topic}:catchup`, await this.catchup(true))
    })
  }

  /** guest: throw away what diverged and take the host's state */
  resync(): Promise<void> {
    return this.serial(() => this.resyncNow())
  }

  dispose(): void {
    this.disposed = true
    for (const off of this.offs.splice(0)) off()
  }

  private serial(task: () => Promise<void> | void): Promise<void> {
    const run = this.queue.then(() => (this.disposed ? undefined : task()))
    this.queue = run.catch((err) => console.error('[collab] op stream:', err))
    return run
  }

  private record(entry: Omit<Entry<Op>, 'seq' | 'epoch'>): void {
    const full: Entry<Op> = { ...entry, seq: ++this.seq, epoch: this.epoch }
    this.entries.push(full)
    this.session.send(`${this.options.topic}:op`, full)
  }

  private async onProposal(proposal: Proposal<Op>, from: string): Promise<void> {
    const pid = typeof proposal?.pid === 'string' ? proposal.pid : ''
    const reject = () => this.session.send(`${this.options.topic}:reject`, { pid }, from)
    if (!pid || proposal.epoch !== this.epoch) {
      reject()
      return
    }
    let accepted: Op | null = proposal.op
    try {
      if (this.options.accept) accepted = await this.options.accept(proposal.op, from)
      if (accepted === null) {
        reject()
        return
      }
      await this.options.apply(accepted, from)
    } catch (err) {
      console.error('[collab] refused an op that did not apply:', err)
      reject()
      return
    }
    this.record({ by: from, pid, rewritten: accepted !== proposal.op, op: accepted })
  }

  private async catchup(withSnapshot = this.epoch > 0): Promise<Catchup<Op>> {
    if (withSnapshot) {
      return {
        epoch: this.epoch,
        seq: this.seq,
        snapshot: await this.options.snapshot(),
        entries: [],
      }
    }
    return { epoch: this.epoch, seq: 0, snapshot: null, entries: this.entries }
  }

  private async onEntry(entry: Entry<Op>): Promise<void> {
    if (!entry || entry.epoch !== this.epoch || entry.seq <= this.seq) return
    if (entry.seq !== this.seq + 1) {
      await this.resyncNow()
      return
    }
    this.seq = entry.seq
    if (entry.pid && this.pending.delete(entry.pid)) {
      // our own edit, already applied here, unless the host changed it on the way
      if (entry.rewritten) this.outOfOrder = true
      if (this.outOfOrder && this.pending.size === 0) {
        this.outOfOrder = false
        await this.resyncNow()
      }
      return
    }
    // landing among our unconfirmed edits: this copy applied them first, the host after
    const commutes = this.options.commutes
    if (
      this.pending.size > 0 &&
      ![...this.pending.values()].every((own) => commutes?.(own, entry.op))
    ) {
      this.outOfOrder = true
    }
    try {
      await this.options.apply(entry.op, entry.by)
    } catch (err) {
      // this copy no longer matches the host's
      console.error('[collab] an op did not apply here:', err)
      await this.resyncNow()
    }
  }

  private async adopt(catchup: Catchup<Op>): Promise<void> {
    if (!catchup || typeof catchup.epoch !== 'number') return
    if (catchup.snapshot) {
      await this.options.reload(catchup.snapshot)
      this.pending.clear()
      this.outOfOrder = false
      this.options.onResync?.()
      this.epoch = catchup.epoch
      this.seq = catchup.seq
      return
    }
    // the base this guest opened is the epoch's base: replay what came after it
    if (catchup.epoch !== this.epoch) return
    for (const entry of catchup.entries) {
      if (entry.seq <= this.seq) continue
      this.seq = entry.seq
      if (entry.pid && this.pending.delete(entry.pid)) continue
      await this.options.apply(entry.op, entry.by)
    }
  }

  private async resyncNow(): Promise<void> {
    try {
      const catchup = (await this.session.request(
        `${this.options.topic}:catchup`,
        null,
      )) as Catchup<Op>
      // entries broadcast after this answer queue up behind it and pick up from catchup.seq
      await this.adopt(catchup)
    } catch (err) {
      console.error('[collab] resync failed:', err)
    }
  }
}
