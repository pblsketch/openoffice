/**
 * The editor screen and crash-recovery copies: a restored copy opens with
 * unsaved changes; while the map has unsaved changes copies are handed to the
 * main process, never by closing a title being typed; the OS session end gets
 * a copy at once, typed title included.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lang } from '@genoffice/i18n'
import { openXmind, type XmindSheet } from '@genoffice/xmind-engine'
import App from '../src/renderer/App'
import { RECOVERY_COPY_TIMING } from '../src/renderer/document/recovery-copies'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import type {
  MindmapApi,
  OpenFileResult,
  RecoveryCopyRequest,
  SaveMindmapRequest,
} from '../src/shared/ipc'
import { documentOf, plainSheet } from './helpers/fixtures'
import { mapLoaded, until } from './helpers/wait'

const FIRST_BRANCH = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'

interface Fake {
  api: MindmapApi
  saves: SaveMindmapRequest[]
  copies: RecoveryCopyRequest[]
  dirty: boolean[]
  copyNowDone: number
  emitCopyNow(): void
  emitReset(): void
}

function fakeApi(pending: string | null, file: OpenFileResult | null): Fake {
  const handlers: Record<string, (() => void) | undefined> = {}
  const on =
    (name: string) =>
    (handler: () => void): (() => void) => {
      handlers[name] = handler
      return () => {
        handlers[name] = undefined
      }
    }
  const fake: Fake = {
    saves: [],
    copies: [],
    dirty: [],
    copyNowDone: 0,
    emitCopyNow: () => handlers.copyNow?.(),
    emitReset: () => handlers.reset?.(),
    api: {
      consumePending: async () => pending,
      openFile: async () => file ?? { status: 'unreadable' },
      save: async (request: SaveMindmapRequest) => {
        fake.saves.push(request)
        return { ok: true, path: pending ?? 'C:/maps/new.xmind' }
      },
      setDirty: (dirty: boolean) => void fake.dirty.push(dirty),
      onSaveRequest: on('save'),
      sendSaveRequestAck: () => {},
      onCloseSaveRequest: on('close'),
      sendCloseSaveResult: () => {},
      onFileRenamed: on('renamed'),
      openLink: async () => true,
      onMenuCommand: on('menu'),
      getLanguage: async () => 'en' as Lang,
      onLanguageChanged: on('language'),
      getTheme: async () => 'system' as const,
      onThemeChanged: on('theme'),
      getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
      onAutoSaveDefaultChanged: on('autosave'),
      onChromePressed: on('chrome'),
      onOutlineRequest: on('outline'),
      sendOutlineResult: () => {},
      onBytesRequest: on('bytes'),
      sendBytesResult: () => {},
      onExportRequest: on('export'),
      onPrintRequest: on('print'),
      writeRecoveryCopy: async (request: RecoveryCopyRequest) => {
        fake.copies.push(request)
        return 'written'
      },
      onRecoveryCopyNow: on('copyNow'),
      onRecoveryReset: on('reset'),
      sendRecoveryCopyNowDone: () => {
        fake.copyNowDone++
      },
    } as unknown as MindmapApi,
  }
  return fake
}

let container: HTMLElement
let unmount: () => void = () => {}
const timing = { ...RECOVERY_COPY_TIMING }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  // copies every few milliseconds instead of every 30 seconds
  RECOVERY_COPY_TIMING.intervalMs = 30
})
afterEach(() => {
  unmount()
  unmount = () => {}
  document.body.innerHTML = ''
  Object.assign(RECOVERY_COPY_TIMING, timing)
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mountApp(fake: Fake): Promise<void> {
  ;(window as unknown as { mindmapApi: MindmapApi }).mindmapApi = fake.api
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en', children: createElement(App) }))
  })
  unmount = () => act(() => root.unmount())
  await until(() => mapLoaded(container), 'the file to open')
  await until(() => !!container.querySelector('[data-nodeid]'), 'the map to be drawn')
  await settle()
}

async function bytesOf(...sheets: XmindSheet[]): Promise<Uint8Array> {
  return (await documentOf(...sheets)).save()
}

async function branchTitles(bytes: Uint8Array): Promise<string[]> {
  const opened = await openXmind(bytes)
  if (opened.status !== 'ok') throw new Error(opened.status)
  const attached = opened.document.sheets[0]!.rootTopic.children?.attached ?? []
  return attached.map((topic) => topic.title as string)
}

async function typeTitle(id: string, title: string): Promise<void> {
  const node = container.querySelector<HTMLElement>(`[data-nodeid="me${id}"]`)!
  await act(async () => {
    node.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    )
  })
  await settle()
  const map = container.querySelector<HTMLElement>('.map-container')!
  await act(async () => {
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }))
  })
  await settle()
  container.querySelector<HTMLElement>('#input-box')!.textContent = title
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })

describe('a restored copy', () => {
  it('opens with unsaved changes and saves the copy', async () => {
    const sheet = plainSheet()
    sheet.rootTopic.children!.attached![0]!.title = 'From the copy'
    const copy = await bytesOf(sheet)
    const fake = fakeApi('C:/maps/plan.xmind', { status: 'ok', bytes: copy, restored: 'file' })
    await mountApp(fake)
    expect(fake.dirty.at(-1)).toBe(true)
    expect(container.textContent).toContain('Unsaved')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-action="save"]')!.click()
    })
    await until(() => fake.saves.length === 1, 'the save')
    expect(fake.saves[0]!.mode).toBe('save')
    expect(await branchTitles(fake.saves[0]!.bytes)).toEqual(['From the copy', 'Two'])
  })
})

describe('copies while the map has unsaved changes', () => {
  it('none for a map without changes', async () => {
    const fake = fakeApi('C:/maps/plan.xmind', { status: 'ok', bytes: await bytesOf(plainSheet()) })
    await mountApp(fake)
    await wait(150)
    expect(fake.copies).toHaveLength(0)
  })

  it('wait while a title is being typed and leave its box open, then copy the map', async () => {
    const fake = fakeApi('C:/maps/plan.xmind', { status: 'ok', bytes: await bytesOf(plainSheet()) })
    await mountApp(fake)
    await typeTitle(FIRST_BRANCH, 'Typed')
    await wait(150)
    expect(fake.copies).toHaveLength(0)
    expect(container.querySelector('#input-box')).not.toBeNull()

    // the user leaves the box: the title is in the map, and the next tick copies it
    await act(async () => {
      container.querySelector('#input-box')!.dispatchEvent(new FocusEvent('blur'))
    })
    await until(() => fake.copies.length > 0, 'a copy')
    expect(await branchTitles(fake.copies[0]!.bytes)).toEqual(['Typed', 'Two'])
    // a copy is not a save: the map is still unsaved
    expect(container.textContent).toContain('Unsaved')
    expect(fake.saves).toHaveLength(0)
  })

  it('another after the main process dropped the last one, without a new edit', async () => {
    const fake = fakeApi('C:/maps/plan.xmind', { status: 'ok', bytes: await bytesOf(plainSheet()) })
    await mountApp(fake)
    await typeTitle(FIRST_BRANCH, 'Typed')
    await act(async () => {
      container.querySelector('#input-box')!.dispatchEvent(new FocusEvent('blur'))
    })
    await until(() => fake.copies.length > 0, 'a copy')
    await wait(150)
    const before = fake.copies.length
    await act(async () => fake.emitReset())
    await until(() => fake.copies.length > before, 'a copy after the reset')
  })

  it('one at once when the OS ends the session, with the title being typed', async () => {
    RECOVERY_COPY_TIMING.intervalMs = 60_000
    const fake = fakeApi('C:/maps/plan.xmind', { status: 'ok', bytes: await bytesOf(plainSheet()) })
    await mountApp(fake)
    await typeTitle(FIRST_BRANCH, 'Half typed')
    await act(async () => fake.emitCopyNow())
    await until(() => fake.copyNowDone === 1, 'the copy asked for')
    expect(fake.copies).toHaveLength(1)
    expect(await branchTitles(fake.copies[0]!.bytes)).toEqual(['Half typed', 'Two'])
  })
})
