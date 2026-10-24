import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import { SHELL_SUBSCRIPTION_CHANNELS } from '../src/shared/subscription-api'

/**
 * The shell is the process the shipped app ends with, so it is the one that
 * must end the subscription CLIs: on a normal quit, on the exits that skip the
 * quit events, and at the next start after a kill. src/main/index.ts needs a
 * running Electron to load, so the wiring is pinned on its source.
 */

const source = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')

/** the body of the first block opened by `opener`, up to its matching close at column 0 */
function blockAfter(opener: string): string {
  const start = source.indexOf(opener)
  expect(start, `missing: ${opener}`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n})', start)
  return source.slice(start, end)
}

describe('subscription CLI lifetime in the shell main process', () => {
  it('cleans up after a killed run and starts recording, once, on the final userData path', () => {
    const calls = source.match(/initSubscriptionChildTracking\(/g) ?? []
    expect(calls).toHaveLength(1)
    const ready = blockAfter('app.whenReady().then(async () => {')
    const init = ready.indexOf("initSubscriptionChildTracking(app.getPath('userData'))")
    expect(init).toBeGreaterThanOrEqual(0)
    // only the instance that holds the lock runs AI, and userData is settled well before
    expect(init).toBeGreaterThan(ready.indexOf('if (!hasLock) {'))
    expect(source.indexOf("app.setPath('userData'")).toBeLessThan(
      source.indexOf('app.whenReady().then(async () => {'),
    )
  })

  it('ends the CLIs when the app quits', () => {
    // will-quit (and an OS session end) release everything through one function
    expect(blockAfter("app.on('will-quit', () => {")).toContain('releaseAppResources()')
    const start = source.indexOf('function releaseAppResources(): void {')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(source.slice(start, source.indexOf('\n}\n', start))).toContain(
      'shutdownSubscriptionChildren()',
    )
  })

  it('ends them on the exits that skip the quit events', () => {
    // app.exit() (the headless export) emits neither before-quit nor will-quit
    expect(source).toMatch(/process\.on\('exit', \(\) => shutdownSubscriptionChildren\(\)\)/)
  })

  it('has no crash handler that would leave the CLIs running', () => {
    // Today there is none: Electron's own handler shows the error and keeps the
    // app running, so nothing ends there. A handler added later ends the process
    // its own way and has to end the CLIs too.
    const handlers = [...source.matchAll(/process\.on\(\s*'uncaughtException'[\s\S]{0,800}/g)]
    for (const handler of handlers) expect(handler[0]).toContain('shutdownSubscriptionChildren')
  })

  it('leaves an uncaught exception to Electron, which does not end the process', () => {
    // Checked on the Electron this app ships (43.7.6): its own listener,
    //   process.listenerCount('uncaughtException') > 1 || dialog.showErrorBox(…)
    // only shows the error; nothing exits, so there is no way out of the process
    // on this path that skips will-quit / 'exit'. (A rejected promise nobody
    // handles is only warned about there; it never becomes an uncaught exception.)
    // That holds only while the app takes the path over by no other spelling either.
    const takeovers = [
      ...source.matchAll(/process\.(?:once|addListener)\(\s*'uncaughtException'[\s\S]{0,800}/g),
    ]
    for (const takeover of takeovers) {
      expect(takeover[0]).toContain('shutdownSubscriptionChildren')
    }
    expect(source).not.toContain('setUncaughtExceptionCaptureCallback')
  })

  it('registers none of the shared subscription channels (one module of the app owns them)', () => {
    for (const channel of Object.values(SUBSCRIPTION_IPC_CHANNELS)) {
      expect(source).not.toContain(`'${channel}'`)
    }
    expect(source).not.toContain('registerSubscriptionIpc')
    expect(source).not.toMatch(/ipcMain\.handle\(\s*SUBSCRIPTION_IPC_CHANNELS/)
  })

  it('opens the install guide from a fixed list, through the URL gate', () => {
    const handler = source.slice(
      source.indexOf('ipcMain.handle(SHELL_SUBSCRIPTION_CHANNELS.openInstallHelp'),
    )
    expect(handler.slice(0, 400)).toContain('isSubscriptionProviderId(provider)')
    expect(handler.slice(0, 400)).toContain('safeExternalUrl(SUBSCRIPTION_INSTALL_URLS[provider])')
    expect(SHELL_SUBSCRIPTION_CHANNELS.openInstallHelp).toBe('home:open-subscription-install-help')
  })
})
