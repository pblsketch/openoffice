/**
 * Shared bits for the exploratory user-MCP specs (user-mcp-*.spec.ts):
 * scratch folders under F:\ieum-scratch\user-mcp-fix2\e2e (or the OS temp folder
 * elsewhere), the two local test servers, and a launch that also points the
 * app's home folder at a scratch folder so nothing reads the real one.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { freeMcpPort, launchShell, type LaunchedApp } from './helpers'

export const SCRATCH = existsSync('F:\\ieum-scratch')
  ? 'F:\\ieum-scratch\\user-mcp-fix2\\e2e'
  : join(tmpdir(), 'user-mcp-fix2-e2e')
export const SHOTS = join(SCRATCH, 'shots')
export const FIXTURES = resolve(__dirname, 'user-mcp-fixtures')
export const STDIO_SERVER = join(FIXTURES, 'stdio-server.mjs')
export const HTTP_SERVER = join(FIXTURES, 'http-server.mjs')

export async function scratchDir(prefix: string): Promise<string> {
  await mkdir(SCRATCH, { recursive: true })
  return mkdtemp(join(SCRATCH, `${prefix}-`))
}

export async function shot(page: Page, name: string): Promise<string> {
  await mkdir(SHOTS, { recursive: true })
  const path = join(SHOTS, `${name}.png`)
  await page.screenshot({ path })
  return path
}

export interface TestServers {
  dir: string
  port: number
  url: string
  httpState: string
  stdioState: string
  log: string
  http: ChildProcess
  stop(): Promise<void>
  setHttpState(state: Record<string, unknown>): Promise<void>
  setStdioState(state: Record<string, unknown>): Promise<void>
}

export async function startServers(dir: string): Promise<TestServers> {
  const port = await freeMcpPort()
  const httpState = join(dir, 'http-state.json')
  const stdioState = join(dir, 'stdio-state.json')
  const log = join(dir, 'server.log')
  await writeFile(httpState, '{}')
  await writeFile(stdioState, '{}')
  const http = spawn(process.execPath, [HTTP_SERVER, String(port), httpState, log], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('http test server did not start')), 15_000)
    http.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer)
        resolveReady()
      }
    })
    http.once('exit', (code) => reject(new Error(`http test server exited ${code}`)))
  })
  return {
    dir,
    port,
    url: `http://127.0.0.1:${port}/mcp`,
    httpState,
    stdioState,
    log,
    http,
    async stop() {
      if (http.exitCode === null && http.signalCode === null) {
        http.kill()
        await new Promise((r) => http.once('exit', r))
      }
    },
    setHttpState: (state) => writeFile(httpState, JSON.stringify(state)),
    setStdioState: (state) => writeFile(stdioState, JSON.stringify(state)),
  }
}

/** Launch in Korean with a scratch home folder (USERPROFILE/HOME) so the app reads no real one */
export async function launchKo(
  dir: string,
  videoDir: string,
  extra: { openFile?: string; userDataDir?: string } = {},
): Promise<LaunchedApp> {
  const home = join(dir, 'home')
  await mkdir(home, { recursive: true })
  const userDataDir = extra.userDataDir ?? join(dir, 'userdata')
  await mkdir(userDataDir, { recursive: true })
  return launchShell({
    lang: 'ko',
    onboardingSeen: true,
    videoDir,
    userDataDir,
    ...(extra.openFile ? { openFile: extra.openFile } : {}),
    env: { USERPROFILE: home, HOME: home },
  })
}

export async function openIntegrations(page: Page): Promise<void> {
  await page.getByRole('button', { name: '설정', exact: true }).first().click()
  await page.locator('.set-nav-item').filter({ hasText: '연동' }).click()
  await page.getByTestId('mcp-servers').waitFor()
}
