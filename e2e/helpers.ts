/**
 * Shared launcher for Electron E2E tests.
 *
 * Each test boots the built shell (`apps/shell/out`) against a scratch
 * userData dir (via GENOFFICE_USER_DATA) so runs never touch real settings
 * and never collide with a running install's single-instance lock.
 * Build first: `npm run build:all`.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

export const SHELL_DIR = resolve(__dirname, '../apps/shell')
export const ARTIFACTS_DIR = resolve(__dirname, 'artifacts')

const SHELL_MAIN = join(SHELL_DIR, 'out/main/index.js')

/**
 * ai-settings.json with the first-connection notice acknowledged and everything
 * else at its default. The empty `providers` table is required: a file without
 * one is read as predating the provider settings and falls back to the
 * defaults, which would drop the flag.
 */
const AI_SETTINGS_NOTICE_SEEN = { providers: {}, subscriptionNoticeSeen: true }

interface LaunchOptions {
  /** reuse a previous scratch dir to simulate a second launch */
  userDataDir?: string
  /** UI language override (GENOFFICE_LANG); defaults to English for stable assertions */
  lang?: string
  /** pre-seed app-settings.json with onboardingSeen=true to start at the home screen */
  onboardingSeen?: boolean
  /** extra app-settings.json keys (e.g. defaultSaveDir) written before launch */
  settings?: Record<string, unknown>
  /**
   * pre-seed ai-settings.json with the first-connection notice acknowledged
   * (default true): on a PC with a signed-in Claude or Codex CLI the notice
   * would otherwise cover Settings and the ask panel. Pass false to see it.
   */
  subscriptionNoticeSeen?: boolean
  /** subdir of e2e/artifacts to store this launch's video in */
  videoDir: string
  /** absolute document path passed as argv, opened in an editor tab on launch */
  openFile?: string
  /** more absolute document paths passed as argv after `openFile`, each opened in a tab */
  openFiles?: string[]
  /** extra environment variables for the launched app */
  env?: Record<string, string>
  /**
   * record a video of the window (default true where it works). Some Windows
   * hosts wedge the page CDP session under the screencast the same way Linux
   * does; `E2E_NO_VIDEO=1` turns recording off for a whole run.
   */
  recordVideo?: boolean
}

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userDataDir: string
}

export async function launchShell(options: LaunchOptions): Promise<LaunchedApp> {
  if (!existsSync(SHELL_MAIN)) {
    throw new Error(`Missing build output at ${SHELL_MAIN} — run \`npm run build:all\` first`)
  }
  const userDataDir = options.userDataDir ?? (await mkdtemp(join(tmpdir(), 'genoffice-e2e-')))
  if (options.onboardingSeen || options.settings) {
    await writeFile(
      join(userDataDir, 'app-settings.json'),
      JSON.stringify({
        ...(options.onboardingSeen ? { onboardingSeen: true } : {}),
        ...options.settings,
      }),
    )
  }
  // never over a file an earlier launch of the same scratch dir already wrote
  const aiSettingsPath = join(userDataDir, 'ai-settings.json')
  if (options.subscriptionNoticeSeen !== false && !existsSync(aiSettingsPath)) {
    await writeFile(aiSettingsPath, JSON.stringify(AI_SETTINGS_NOTICE_SEEN))
  }
  const require = createRequire(join(SHELL_DIR, 'package.json'))
  const executablePath = require('electron') as unknown as string
  // ELECTRON_RUN_AS_NODE (set by VS Code/CI hosts) would boot Electron as
  // plain Node with no windows — strip it so the app always starts as an app
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...hostEnv } = process.env
  // Linux CI runners restrict unprivileged user namespaces (no usable SUID
  // sandbox) and run under xvfb without GPU — without these the window opens
  // but the renderer never loads. The suite drives trusted local builds only.
  // Switches go before the app path so Chromium is guaranteed to consume them
  // and they never leak into the argv the app parses for documents to open.
  const args: string[] = []
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu')
  args.push(SHELL_DIR)
  if (options.openFile) args.push(options.openFile)
  if (options.openFiles) args.push(...options.openFiles)
  const app = await electron.launch({
    executablePath,
    args,
    env: {
      ...hostEnv,
      GENOFFICE_USER_DATA: userDataDir,
      GENOFFICE_NO_SPARE_VIEW: '1',
      GENOFFICE_LANG: options.lang ?? 'en',
      ...(options.env ?? {}),
      ...(process.platform === 'linux' ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
    },
    // Playwright's Electron screencast wedges the page CDP session on Linux
    // (page.url() stays empty, no lifecycle events, evaluate hangs) — record
    // only where it works
    recordVideo:
      process.platform === 'linux' ||
      options.recordVideo === false ||
      process.env.E2E_NO_VIDEO === '1'
        ? undefined
        : {
            dir: join(ARTIFACTS_DIR, options.videoDir),
            size: { width: 1280, height: 800 },
          },
  })
  const page = await app.firstWindow()
  await waitForDocumentReady(app, page)
  return { app, page, userDataDir }
}

/**
 * Playwright can attach to the Electron window mid-navigation and miss the
 * load lifecycle events entirely (Linux timing) — waitForLoadState then hangs
 * on a page that is actually loaded. Polling through evaluate uses the live
 * CDP session instead of the missed events.
 */
async function waitForDocumentReady(
  app: ElectronApplication,
  page: Page,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // the pre-navigation about:blank document also reports readyState complete
    const ready = await page
      .evaluate(() =>
        document.readyState !== 'loading' && window.location.href !== 'about:blank'
          ? document.readyState
          : null,
      )
      .catch(() => null)
    if (ready) return
    await new Promise((r) => setTimeout(r, 100))
  }
  // process list tells renderer-spawn failures apart from slow loads
  const diag = await app
    .evaluate(({ app: electronApp, BrowserWindow }) => ({
      processes: electronApp.getAppMetrics().map((m) => m.type),
      contents: BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
    }))
    .catch((e) => String(e))
  throw new Error(`Shell window never loaded (url: ${page.url()}, diag: ${JSON.stringify(diag)})`)
}

/**
 * Close the app and return the recorded video path for the given page.
 *
 * Open editor tabs trigger a native Save/Don't Save/Cancel dialog on close,
 * which would block app.close() forever — stub the dialog to answer
 * "Don't Save" (button index 1) so shutdown stays unattended. If close still
 * hangs, force-kill the process after 20s and wait for close to finish.
 */
export async function closeAndSaveVideo(
  launched: LaunchedApp,
  name: string,
): Promise<string | undefined> {
  const video = launched.page.video()
  await launched.app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox
    })
    .catch(() => {})
  const child = launched.app.process()
  const killTimer = setTimeout(() => {
    // SIGTERM can enter Electron's graceful quit path and leave it alive.
    // child.killed only means a signal was sent, not that the process exited.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 20_000)
  try {
    await launched.app.close()
  } finally {
    clearTimeout(killTimer)
  }
  if (!video) return undefined
  const target = join(ARTIFACTS_DIR, 'videos', `${name}.webm`)
  try {
    await video.saveAs(target)
    return target
  } catch {
    return undefined
  }
}

export function screenshotPath(name: string): string {
  return join(ARTIFACTS_DIR, 'screenshots', `${name}.png`)
}

/**
 * Wait for a page whose URL contains `urlPart` (e.g. an editor WebContentsView).
 * Checks windows that already exist before listening, so it never races the
 * view being created between launch and the first waitForEvent call.
 */
export async function waitForPageWithUrl(
  app: ElectronApplication,
  urlPart: string,
  timeoutMs = 30_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const candidate of app.windows()) {
      if (candidate.url().includes(urlPart)) return candidate
      // page.url() stays empty when attach raced navigation; ask the document
      const href = await candidate.evaluate(() => window.location.href).catch(() => '')
      if (href.includes(urlPart)) return candidate
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error(`No window with URL containing "${urlPart}"`)
    await app.waitForEvent('window', { timeout: Math.min(remaining, 1_000) }).catch(() => {})
  }
}

/**
 * A connected AI that never reaches a real program: Claude reads `ready` and
 * Codex `not-installed`, the real checker's pushes stop reaching the tabs, the
 * open tabs are told the stubbed statuses, and `ai:stream` answers a canned
 * reply. A spec that sends to the AI calls this once the editor page exists;
 * without it a PC signed in to a subscription would spend the user's limit
 * (docs/standards.md).
 */
export async function stubAiReady(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain, webContents }) => {
    const proto = Object.getPrototypeOf(webContents.getAllWebContents()[0]) as {
      send: (channel: string, ...args: unknown[]) => void
    }
    const realSend = proto.send
    proto.send = function (this: unknown, channel: string, ...args: unknown[]) {
      if (channel === 'ai:subscription-changed') return
      return realSend.call(this, channel, ...args)
    }
    const statuses = {
      'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
      codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
    }
    for (const channel of ['ai:subscription-statuses', 'ai:subscription-recheck']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => statuses)
    }
    ipcMain.removeHandler('ai:stream')
    ipcMain.handle('ai:stream', (event, request: { requestId: string }) => {
      const send = (chunk: Record<string, unknown>) =>
        realSend.call(event.sender, 'ai:stream-chunk', { requestId: request.requestId, ...chunk })
      send({ type: 'delta', text: 'Stub reply.' })
      send({ type: 'done' })
    })
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) realSend.call(wc, 'ai:subscription-changed', statuses)
    }
  })
}
