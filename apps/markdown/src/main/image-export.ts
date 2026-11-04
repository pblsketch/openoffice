import { randomUUID } from 'node:crypto'
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { numberedExportPaths } from '@genoffice/electron-utils/numbered-export-paths'

const pageFileName = (page: number): string => `page-${String(page).padStart(2, '0')}.png`

/** Only dialog-approved folders are registered; renderers never supply output paths. */
export class ImageExportSessions {
  private sessions = new Map<
    string,
    { owner: number; dir: string; pages: number; target?: string }
  >()

  async start(owner: number, parent: string, name: string): Promise<string> {
    const base =
      name
        .replace(/[/\\:*?"<>|]/g, '_')
        .slice(0, 80)
        .trim() || 'Untitled'
    const dir = await mkdtemp(join(parent, `${base}-images-`))
    const id = randomUUID()
    this.sessions.set(id, { owner, dir, pages: 0 })
    return id
  }

  /**
   * Save As › page images: `target` is the one name the save dialog approved.
   * Pages are staged in a folder beside it and take their final names
   * (`numberedExportPaths`) once the page count is known, at finish.
   */
  async startFiles(owner: number, target: string): Promise<string> {
    const id = await this.start(owner, dirname(target), basename(target, extname(target)))
    this.sessions.get(id)!.target = target
    return id
  }

  private get(owner: number, id: string) {
    const session = this.sessions.get(id)
    if (!session || session.owner !== owner) throw new Error('Export session is not authorized')
    return session
  }

  async write(owner: number, id: string, page: number, base64: string): Promise<void> {
    const session = this.get(owner, id)
    if (!Number.isSafeInteger(page) || page !== session.pages + 1)
      throw new Error('Invalid export page number')
    if (typeof base64 !== 'string') throw new Error('Invalid PNG data')
    const bytes = Buffer.from(base64, 'base64')
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('Invalid PNG data')
    await writeFile(join(session.dir, pageFileName(page)), bytes, {
      flag: 'wx',
    })
    session.pages = page
  }

  async finish(owner: number, id: string, success: boolean): Promise<string | null> {
    return (await this.finishExport(owner, id, success))?.dir ?? null
  }

  /** The folder holding the pages and the first page (to reveal); null when nothing was kept. */
  async finishExport(
    owner: number,
    id: string,
    success: boolean,
  ): Promise<{ dir: string; first: string } | null> {
    const session = this.get(owner, id)
    this.sessions.delete(id)
    if (!success || !session.pages) {
      await rm(session.dir, { recursive: true, force: true })
      if (success) throw new Error('Cannot complete an empty image export')
      return null
    }
    if (!session.target) return { dir: session.dir, first: join(session.dir, pageFileName(1)) }
    // Save As: the staged pages move to the typed name (one page) or its numbered siblings
    const targets = numberedExportPaths(session.target, session.pages)
    try {
      for (const [index, target] of targets.entries()) {
        await rename(join(session.dir, pageFileName(index + 1)), target)
      }
    } finally {
      await rm(session.dir, { recursive: true, force: true })
    }
    return { dir: dirname(session.target), first: targets[0]! }
  }

  async dispose(owner: number): Promise<void> {
    await Promise.all(
      [...this.sessions.entries()]
        .filter(([, session]) => session.owner === owner)
        .map(([id]) => this.finish(owner, id, false)),
    )
  }
}
