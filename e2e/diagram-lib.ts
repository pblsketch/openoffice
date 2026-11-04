/**
 * Shared steps of the diagram editor specs (`diagram-*.spec.ts`), against the
 * real built app: copies of the fixtures in `assets/diagram`, the diagram
 * page of a tab, draw.io's own frame, the editor's answers (the read table,
 * the op executor the AI panel and the in-app MCP server share), the shell's
 * menu and its dialogs answered from the main process, and every request the
 * diagram session was asked to let through.
 *
 * Nothing here starts `claude` or `codex`: a spec that sends to the AI scripts
 * the shared AI channels first.
 */
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { expect, type ElectronApplication, type Frame, type Page } from '@playwright/test'
import { diagramStateFromPages, formatDiagramText, openDiagram } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'

export const DIAGRAM_ASSETS = resolve(__dirname, 'assets/diagram')

/** The partition every diagram tab (and its hidden PDF and print windows) lives in. */
const DIAGRAM_PARTITION = 'persist:ieum-diagram'

/** Schemes that stay on this PC: the app's renderer, draw.io's own files, inline data. */
export const ON_PC_SCHEMES = ['blob:', 'data:', 'drawio-app:', 'genoffice-app:']

export async function scratchDir(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `genoffice-diagram-${name}-`))
}

/** A copy of one fixture in `dir`, under `as` when given. */
export async function copyAsset(name: string, dir: string, as = name): Promise<string> {
  const target = join(dir, as)
  await copyFile(join(DIAGRAM_ASSETS, name), target)
  return target
}

// ---- the diagram session's requests ----

export interface ScreenedRequest {
  url: string
  refused: boolean
}

/**
 * Notes every request the diagram session's own screen (`diagram-session.ts`)
 * decides on, with its decision, from the first diagram tab on. Call before a
 * diagram opens: the session is made with the first diagram view.
 */
export async function watchDiagramRequests(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ session }, partition) => {
    const state = globalThis as unknown as { __diagramRequests?: ScreenedRequest[] }
    if (state.__diagramRequests) return
    const seen: ScreenedRequest[] = []
    state.__diagramRequests = seen
    type Listener = (
      details: Electron.OnBeforeRequestListenerDetails,
      callback: (response: Electron.CallbackResponse) => void,
    ) => void
    const fromPartition = session.fromPartition.bind(session)
    session.fromPartition = ((name: string, options?: Electron.FromPartitionOptions) => {
      const ses = fromPartition(name, options)
      const mark = ses as unknown as { __e2eWatched?: boolean }
      if (name === partition && !mark.__e2eWatched) {
        mark.__e2eWatched = true
        const webRequest = ses.webRequest
        const onBeforeRequest = webRequest.onBeforeRequest.bind(webRequest) as (
          ...args: unknown[]
        ) => void
        webRequest.onBeforeRequest = ((...args: unknown[]) => {
          const listener = args[args.length - 1] as Listener | null
          if (typeof listener !== 'function') return onBeforeRequest(...args)
          const wrapped: Listener = (details, callback) =>
            listener(details, (response) => {
              seen.push({ url: details.url.slice(0, 200), refused: response?.cancel === true })
              callback(response)
            })
          return args.length > 1 ? onBeforeRequest(args[0], wrapped) : onBeforeRequest(wrapped)
        }) as typeof webRequest.onBeforeRequest
      }
      return ses
    }) as typeof session.fromPartition
  }, DIAGRAM_PARTITION)
}

export async function diagramRequests(app: ElectronApplication): Promise<ScreenedRequest[]> {
  return app.evaluate(
    () =>
      (globalThis as unknown as { __diagramRequests?: ScreenedRequest[] }).__diagramRequests ?? [],
  )
}

export const schemeOf = (url: string): string => /^[a-z][a-z0-9+.-]*:/i.exec(url)?.[0] ?? url

// ---- tabs and pages ----

interface TabSummaryOnWindow {
  id: string
  kind: string
  title: string
  active: boolean
  filePath?: string
}

interface ShellApisOnWindow {
  aiOfficeTabs: { list(): Promise<TabSummaryOnWindow[]>; close(id: string): Promise<void> }
  aiOffice: {
    openPath(path: string): Promise<void>
    newDiagram(): Promise<void>
    setTheme(theme: string): Promise<void>
  }
}

export const listTabs = (shell: Page): Promise<TabSummaryOnWindow[]> =>
  shell.evaluate(() => (window as unknown as ShellApisOnWindow).aiOfficeTabs.list())

export const diagramTabs = async (shell: Page): Promise<TabSummaryOnWindow[]> =>
  (await listTabs(shell)).filter((tab) => tab.kind === 'diagram')

export async function closeTab(shell: Page, id: string): Promise<void> {
  await shell.evaluate(
    (tabId) => (window as unknown as ShellApisOnWindow).aiOfficeTabs.close(tabId),
    id,
  )
}

export const openPath = (shell: Page, path: string): Promise<void> =>
  shell.evaluate((p) => (window as unknown as ShellApisOnWindow).aiOffice.openPath(p), path)

export const setAppTheme = (shell: Page, theme: 'light' | 'dark'): Promise<void> =>
  shell.evaluate((t) => (window as unknown as ShellApisOnWindow).aiOffice.setTheme(t), theme)

const diagramPages = (app: ElectronApplication): Page[] =>
  app.windows().filter((page) => page.url().includes('://diagram/'))

/** Runs `open`, then gives the page of the diagram view it made, once draw.io holds the diagram. */
export async function openDiagramPage(
  app: ElectronApplication,
  open: () => Promise<unknown>,
): Promise<Page> {
  const before = new Set(diagramPages(app))
  await open()
  let page: Page | undefined
  await expect
    .poll(
      () => {
        page = diagramPages(app).find((candidate) => !before.has(candidate))
        return page !== undefined
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  await waitDiagramReady(page!)
  return page!
}

/** draw.io is up and holds the diagram (or the file did not open: `.dg-center`). */
export async function waitDiagramReady(page: Page): Promise<void> {
  await expect(page.locator('.dg-frame')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator('.dg-progress')).toHaveCount(0, { timeout: 90_000 })
  await expect(page.locator('.dg-center')).toHaveCount(0)
}

/** draw.io's own frame inside the diagram page. */
export function drawioFrame(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().startsWith('drawio-app://editor/index.html'))
  if (!frame) throw new Error('the draw.io frame is not there')
  return frame
}

/**
 * One request to our bridge script in draw.io's frame, asked from the editor
 * page the way the editor asks it (a tagged message to the frame's origin).
 */
export async function bridgeRequest<T>(
  page: Page,
  op: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    ({ op, args }) =>
      new Promise<T>((resolvePromise, reject) => {
        const frame = document.querySelector('iframe.dg-frame') as HTMLIFrameElement | null
        const target = frame?.contentWindow
        if (!target) {
          reject(new Error('no draw.io frame'))
          return
        }
        const id = `e2e-${Math.random().toString(36).slice(2)}`
        const onMessage = (event: MessageEvent): void => {
          if (event.source !== target) return
          const data = event.data as {
            ieum?: number
            kind?: string
            id?: string
            ok?: boolean
            value?: T
            error?: string
          }
          if (data?.ieum !== 1 || data.kind !== 'reply' || data.id !== id) return
          window.removeEventListener('message', onMessage)
          if (data.ok) resolvePromise(data.value as T)
          else reject(new Error(data.error))
        }
        window.addEventListener('message', onMessage)
        target.postMessage({ ieum: 1, kind: 'request', id, op, args }, 'drawio-app://editor')
      }),
    { op, args },
  )
}

interface PageXml {
  id: string
  name: string
  xml: string
}

/** Every page of the diagram on screen, as the editor would save it now. */
export async function livePages(page: Page): Promise<PageXml[]> {
  return (await bridgeRequest<{ pages: PageXml[] }>(page, 'readPages')).pages
}

/** The read table of every page of the diagram on screen. */
export async function liveText(page: Page): Promise<string> {
  return formatDiagramText(diagramStateFromPages(await livePages(page)))
}

/** The read table of every page of a diagram file, read on the Node side. */
export async function fileText(path: string): Promise<string> {
  const opened = openDiagram(basename(path), new Uint8Array(await readFile(path)), nodePageCodec)
  if (!opened.ok) throw new Error(`${path} does not open as a diagram: ${opened.message}`)
  return formatDiagramText(opened.file.state)
}

export async function fileFormat(path: string): Promise<string> {
  const opened = openDiagram(basename(path), new Uint8Array(await readFile(path)), nodePageCodec)
  if (!opened.ok) throw new Error(`${path} does not open as a diagram: ${opened.message}`)
  return opened.file.format
}

// ---- the editor's own op executor (shared by the AI panel and the in-app MCP server) ----

/** The id of the web contents behind a diagram page. */
export async function contentsIdOf(app: ElectronApplication, page: Page): Promise<number> {
  const mark = `e2e-${Math.random().toString(36).slice(2)}`
  await page.evaluate((value) => {
    ;(window as unknown as { __e2eMark?: string }).__e2eMark = value
  }, mark)
  const id = await app.evaluate(async ({ webContents }, wanted) => {
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed() || !contents.getURL().includes('://diagram/')) continue
      const value = await contents
        .executeJavaScript('window.__e2eMark ?? null', true)
        .catch(() => null)
      if (value === wanted) return contents.id
    }
    return -1
  }, mark)
  if (id < 0) throw new Error('no web contents for that diagram page')
  return id
}

export interface ApplyReply {
  id: string
  ok: boolean
  error?: string
  result?: {
    status: string
    changed: boolean
    created: string[]
    results: Array<{ op: string; status: string; created?: string[] }>
  }
}

/**
 * Ops through the editor's executor, asked the way the in-app MCP server asks
 * (`diagram:apply-request`): planned on the live diagram and put in as one
 * undo step, all or nothing.
 */
export async function applyOps(
  app: ElectronApplication,
  contentsId: number,
  ops: unknown[],
): Promise<ApplyReply> {
  return app.evaluate(
    ({ ipcMain, webContents }, { contentsId, ops }) =>
      new Promise<ApplyReply>((resolvePromise, reject) => {
        const id = `e2e-apply-${Math.random().toString(36).slice(2)}`
        const timer = setTimeout(() => {
          ipcMain.removeListener('diagram:apply-result', onReply)
          reject(new Error('the editor did not answer the ops'))
        }, 60_000)
        const onReply = (_event: unknown, reply: ApplyReply): void => {
          if (reply?.id !== id) return
          clearTimeout(timer)
          ipcMain.removeListener('diagram:apply-result', onReply)
          resolvePromise(reply)
        }
        ipcMain.on('diagram:apply-result', onReply)
        webContents.fromId(contentsId)?.send('diagram:apply-request', { id, ops })
      }),
    { contentsId, ops },
  )
}

// ---- the shell's menu and dialogs ----

/** Clicks the first item of a top-level menu whose label matches `pattern` (a regular expression source). */
export async function clickMenu(
  app: ElectronApplication,
  top: string,
  pattern: string,
): Promise<void> {
  const clicked = await app.evaluate(
    ({ Menu }, [topLabel, source]) => {
      const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === topLabel)
      const re = new RegExp(source)
      const item = menu?.submenu?.items.find(
        (candidate) => candidate.type !== 'separator' && re.test(candidate.label),
      )
      if (!item) return false
      item.click()
      return true
    },
    [top, pattern] as const,
  )
  if (!clicked) throw new Error(`no "${pattern}" in the ${top} menu`)
}

export interface SaveDialogCall {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

/**
 * Save dialogs answer from the main process: each call takes the next path of
 * `answers` (cancel when none is left) and is recorded.
 */
export async function answerSaveDialogs(
  app: ElectronApplication,
  answers: string[],
): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    const state = globalThis as unknown as { __saveDialogs: SaveDialogCall[] }
    state.__saveDialogs = []
    const queue = [...paths]
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      state.__saveDialogs.push(args[args.length - 1] as SaveDialogCall)
      const next = queue.shift()
      return next ? { canceled: false, filePath: next } : { canceled: true, filePath: undefined }
    }) as typeof dialog.showSaveDialog
  }, answers)
}

export const saveDialogCalls = (app: ElectronApplication): Promise<SaveDialogCall[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __saveDialogs?: SaveDialogCall[] }).__saveDialogs ?? [],
  )

/** Message boxes answer `response` (0 = Save / Replace, 1 = Don't Save) and are counted. */
export async function answerMessageBoxes(
  app: ElectronApplication,
  response: number,
): Promise<void> {
  await app.evaluate(({ dialog }, answer) => {
    const state = globalThis as unknown as { __messageBoxes: string[] }
    state.__messageBoxes = []
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args[args.length - 1] as { message?: string }
      state.__messageBoxes.push(options.message ?? '')
      return { response: answer, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  }, response)
}

/** The messages of the message boxes shown since `answerMessageBoxes`. */
export const messageBoxes = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => [
    ...((globalThis as unknown as { __messageBoxes?: string[] }).__messageBoxes ?? []),
  ])

/** The pages of diagram views open now (tabs and detached windows). */
export const diagramViewCount = (app: ElectronApplication): number =>
  app.windows().filter((page) => page.url().includes('://diagram/')).length

/**
 * File › Export as PNG / SVG / PDF, all pages, into `target`; waits for the
 * file. Pictures of every page land as `<name>-p<n>.<ext>`, one page
 * too: the first page's file is returned then.
 */
export async function exportFromMenu(
  app: ElectronApplication,
  page: Page,
  format: 'png' | 'svg' | 'pdf',
  target: string,
): Promise<string> {
  await answerSaveDialogs(app, [target])
  await clickMenu(app, 'File', `^Export as .*${format.toUpperCase()}`)
  await page.locator('.dg-dialog .dg-primary').click()
  const firstPage = target.replace(/(\.[a-z]+)$/i, '-p1$1')
  await expect
    .poll(() => existsSync(target) || existsSync(firstPage), { timeout: 60_000 })
    .toBe(true)
  await expect(page.locator('.dg-dialog')).toHaveCount(0)
  return existsSync(target) ? target : firstPage
}

/** The status line's text ("Unsaved changes", "Saved", or nothing). */
export const statusText = (page: Page): Promise<string> => page.locator('.dg-status').innerText()

/** draw.io's dark view is on in the frame. */
export const darkViewOn = (page: Page): Promise<boolean> =>
  drawioFrame(page).evaluate(() => document.querySelector('.geDarkMode') !== null)
