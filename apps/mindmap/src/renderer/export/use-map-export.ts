/**
 * Export, print and the preview picture, as the editor runs them.
 *
 * - Picture (PNG or SVG) and PDF: the sheet on screen, as it is drawn (folded
 *   branches folded), the whole sheet and not only the part in view.
 * - Markdown outline: every sheet of the file, from the map as it stands now
 *   (unsaved edits included, folding ignored): the engine's `sheetsToOutline`.
 * - Print: the sheet on screen on one landscape A4 page, through the system's
 *   print dialog. Print is in the File menu; the toolbar has the four exports.
 * - Save As lists the same four types after .xmind. Picking one writes that
 *   export, as here, to the path the Save As dialog returned (no second
 *   dialog); the map keeps its file and its unsaved state.
 * - The preview picture a save writes into the file: the first sheet, made
 *   only for a save that changes the file. When it cannot be made, or takes
 *   too long, the save goes ahead without one and the file keeps its old one.
 *
 * All of them come out in the map's own colours, the same whether the app is
 * light or dark (`render.ts`).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { t as translate, type StringKey } from '../i18n/locale'
import type { DocumentSession } from '../document/session'
import { setThumbnailProvider } from '../document/thumbnail'
import type { MapController } from '../map/controller'
import type { ExportFormat, ExportResult } from '../../shared/ipc'
import { documentName, sheetExportName } from './names'
import { pictureScale, snapshotPage, snapshotPng, snapshotSvg, thumbnailScale } from './render'
import { type MapSnapshot, snapshotSheet, type SnapshotOptions } from './snapshot'

export interface MapExportHost {
  session: DocumentSession | null
  /** the drawn sheets, by sheet key */
  controllers: { readonly current: ReadonlyMap<string, MapController> }
  /** the sheet on screen */
  activeKey: string | null
  /** the file the map is saved in, if any */
  path: string | null
  /** takes what is being typed and what the screen shows into the map */
  flushAll(): void
  /** a short message in the status line */
  say(key: StringKey): void
}

/** A preview picture not made by then is left out of the save. */
export const THUMBNAIL_TIMEOUT_MS = 4000

/** The still copy of a drawn sheet, pictures read from the map's own file. */
export function snapshotOf(
  session: DocumentSession,
  controller: MapController,
  options?: SnapshotOptions,
): Promise<MapSnapshot | null> {
  return snapshotSheet(
    { mind: controller.mind, readEntry: (name) => session.document.readEntry(name) },
    options,
  )
}

/**
 * The preview picture for a save: the first sheet as a small PNG. Null, and
 * so no new picture, when the save changes nothing, when the first sheet has
 * not been drawn, and when it fails or does not finish in time.
 */
export async function thumbnailFor(
  session: DocumentSession | null,
  controllers: ReadonlyMap<string, MapController>,
  timeoutMs = THUMBNAIL_TIMEOUT_MS,
): Promise<Uint8Array | null> {
  if (!session || !session.document.changed) return null
  const first = session.tabs()[0]
  const controller = first ? controllers.get(first.key) : undefined
  if (!controller) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const made = (async () => {
    const snapshot = await snapshotOf(session, controller, { pictureWaitMs: timeoutMs / 2 })
    if (!snapshot) return null
    return snapshotPng(snapshot, thumbnailScale(snapshot.width, snapshot.height))
  })()
  try {
    return await Promise.race([made, late])
  } finally {
    clearTimeout(timer)
  }
}

/** The name of the map, as the save dialog of an export offers it. */
function mapNameOf(session: DocumentSession, path: string | null): string {
  const first = session.tabs()[0]
  return documentName({
    path,
    firstRootTitle: first ? session.view(first.key).root.title : '',
    defaultRootTitle: translate('centralTopic'),
    untitled: translate('untitled'),
  })
}

function report(say: (key: StringKey) => void, result: ExportResult): void {
  if (!result.ok) {
    console.error('[mindmap] export failed:', result.error)
    say('exportFailed')
  } else if ('path' in result) {
    say('exportDone')
  }
}

const nextTurn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export interface MapExport {
  /** `path`: the file Save As picked for this export; the export then asks nothing */
  exportAs(format: ExportFormat, path?: string): void
  print(): void
}

/**
 * Wires export, print and the preview picture to the editor. Exports and
 * print run one after the other: one asked for while another runs waits for
 * it, so a menu command is never lost.
 */
export function useMapExport(host: MapExportHost): MapExport {
  const hostRef = useRef(host)
  hostRef.current = host
  const queue = useRef<Promise<void>>(Promise.resolve())
  const inTurn = useCallback((task: () => Promise<void>): void => {
    queue.current = queue.current.then(task, task)
  }, [])

  /** The sheet on screen as a still copy, after what is being typed went in. */
  const activeSnapshot = useCallback(async (): Promise<{
    snapshot: MapSnapshot
    name: string
  } | null> => {
    const current = hostRef.current
    const session = current.session
    const key = current.activeKey
    const controller = key ? current.controllers.current.get(key) : undefined
    if (!session || !key || !controller) return null
    current.flushAll()
    await nextTurn()
    const snapshot = await snapshotOf(session, controller)
    if (!snapshot) return null
    const tabs = session.tabs()
    const title = tabs.find((tab) => tab.key === key)?.title ?? ''
    return {
      snapshot,
      name: sheetExportName(mapNameOf(session, current.path), title, tabs.length),
    }
  }, [])

  const exportAs = useCallback(
    async (format: ExportFormat, path?: string): Promise<void> => {
      const current = hostRef.current
      const session = current.session
      if (!session) return
      const api = window.mindmapApi
      const to = path === undefined ? {} : { path }
      try {
        if (format === 'markdown') {
          current.flushAll()
          const text = session.outline()
          report(
            current.say,
            await api.exportMarkdown({
              text,
              suggestedName: mapNameOf(session, current.path),
              ...to,
            }),
          )
          return
        }
        const taken = await activeSnapshot()
        if (!taken) throw new Error('the sheet is not drawn')
        if (format === 'png') {
          const { snapshot } = taken
          const bytes = await snapshotPng(snapshot, pictureScale(snapshot.width, snapshot.height))
          report(current.say, await api.exportPng({ bytes, suggestedName: taken.name, ...to }))
        } else if (format === 'svg') {
          // drawn at its own size: an SVG scales without loss
          const svg = snapshotSvg(taken.snapshot, 1)
          report(current.say, await api.exportSvg({ svg, suggestedName: taken.name, ...to }))
        } else {
          const html = snapshotPage(taken.snapshot)
          report(current.say, await api.exportPdf({ html, suggestedName: taken.name, ...to }))
        }
      } catch (error) {
        console.error('[mindmap] export failed:', error)
        hostRef.current.say('exportFailed')
      }
    },
    [activeSnapshot],
  )

  const print = useCallback(async (): Promise<void> => {
    if (!hostRef.current.session) return
    try {
      const taken = await activeSnapshot()
      if (!taken) throw new Error('the sheet is not drawn')
      const result = await window.mindmapApi.print({ html: snapshotPage(taken.snapshot) })
      if (!result.ok) throw new Error(result.error)
    } catch (error) {
      console.error('[mindmap] print failed:', error)
      hostRef.current.say('printFailed')
    }
  }, [activeSnapshot])

  useEffect(() => {
    const api = window.mindmapApi
    const offExport = api.onExportRequest((format) => inTurn(() => exportAs(format)))
    const offPrint = api.onPrintRequest(() => inTurn(print))
    setThumbnailProvider(() =>
      thumbnailFor(hostRef.current.session, hostRef.current.controllers.current),
    )
    return () => {
      offExport()
      offPrint()
      setThumbnailProvider(null)
    }
  }, [exportAs, print, inTurn])

  // stable across renders: a save hands its Save As export pick to `exportAs`
  return useMemo(
    () => ({
      exportAs: (format, path) => inTurn(() => exportAs(format, path)),
      print: () => inTurn(print),
    }),
    [exportAs, print, inTurn],
  )
}
