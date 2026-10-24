/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import type { ResultStoreApi } from '../src/shared/result-store-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'
import { formatStoreSize } from '../src/renderer/src/SettingsResultStore'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.aiOfficeResultStore
})

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await flush()
  })
}

async function openGeneral(store: ResultStoreApi | undefined): Promise<void> {
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
  } as unknown as HomeApi
  if (store) window.aiOfficeResultStore = store
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(SettingsModal, { onClose: vi.fn() }),
      ),
    )
    await flush()
  })
  const general = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find((b) =>
    b.textContent?.includes('General'),
  )
  await click(general!)
}

const row = () => host.querySelector<HTMLElement>('[data-testid="result-store"]')
const rowButton = () => row()!.querySelector<HTMLButtonElement>('button')!
const confirmBox = () => host.querySelector<HTMLElement>('[role="alertdialog"]')
const confirmButton = (label: string) =>
  Array.from(confirmBox()!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent === label,
  )!

describe('Settings → General: saved AI results', () => {
  it('shows the store size in readable units', async () => {
    const store = { size: vi.fn(async () => 1.5 * 1024 * 1024), deleteAll: vi.fn() }
    await openGeneral(store)
    expect(row()?.textContent).toContain('Saved AI results')
    expect(row()?.textContent).toContain('In use: 1.5 MB')
    expect(rowButton().textContent).toBe('Delete all')
    expect(rowButton().disabled).toBe(false)
  })

  it('deletes only after the confirmation, then shows the new size', async () => {
    let bytes = 4096
    const store = {
      size: vi.fn(async () => bytes),
      deleteAll: vi.fn(async () => {
        bytes = 0
      }),
    }
    await openGeneral(store)
    expect(row()?.textContent).toContain('In use: 4 KB')

    // asking alone deletes nothing; cancelling deletes nothing
    await click(rowButton())
    expect(confirmBox()?.textContent).toContain('Delete all saved AI readings and translations?')
    expect(store.deleteAll).not.toHaveBeenCalled()
    await click(confirmButton('Cancel'))
    expect(confirmBox()).toBeNull()
    expect(store.deleteAll).not.toHaveBeenCalled()

    // confirming deletes once and refreshes the size
    await click(rowButton())
    await click(confirmButton('Delete all'))
    expect(store.deleteAll).toHaveBeenCalledTimes(1)
    expect(confirmBox()).toBeNull()
    expect(row()?.textContent).toContain('In use: 0 B')
    expect(rowButton().disabled).toBe(true)
  })

  it('reports a failed delete and keeps the size it reads back', async () => {
    const store = {
      size: vi.fn(async () => 2048),
      deleteAll: vi.fn(async () => {
        throw new Error('EBUSY')
      }),
    }
    await openGeneral(store)
    await click(rowButton())
    await click(confirmButton('Delete all'))
    expect(store.deleteAll).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not delete them. Try again.',
    )
    expect(row()?.textContent).toContain('In use: 2 KB')
  })

  it('shows a dash when the size is not known', async () => {
    await openGeneral(undefined)
    expect(row()?.textContent).toContain('In use: —')
  })
})

describe('formatStoreSize', () => {
  it('picks the largest unit that keeps the number at least 1', () => {
    expect(formatStoreSize(0, 'en-US')).toBe('0 B')
    expect(formatStoreSize(1023, 'en-US')).toBe('1,023 B')
    expect(formatStoreSize(1024, 'en-US')).toBe('1 KB')
    expect(formatStoreSize(5 * 1024 ** 3, 'en-US')).toBe('5 GB')
    expect(formatStoreSize(1.5 * 1024 * 1024, 'de-DE')).toBe('1,5 MB')
  })
})
