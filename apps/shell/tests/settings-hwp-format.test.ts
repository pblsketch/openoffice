/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

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
  delete window.aiOffice
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

async function openGeneral(saved: 'hwp' | 'hwpx', setFormat: HomeApi['setHwpDefaultFormat']) {
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getHwpDefaultFormat: async () => saved,
    setHwpDefaultFormat: setFormat,
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
  } as unknown as HomeApi
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

const formatTrigger = () =>
  host.querySelector<HTMLButtonElement>('[aria-label="Save format for new HWP documents"]')!

describe('Settings → General: save format for new HWP documents', () => {
  it('shows the stored choice', async () => {
    await openGeneral(
      'hwpx',
      vi.fn(async (value) => value),
    )
    expect(formatTrigger().dataset.value).toBe('hwpx')
    expect(formatTrigger().textContent).toContain('HWPX (.hwpx)')
  })

  it('stores the picked format and shows it', async () => {
    const setFormat = vi.fn(async (value: 'hwp' | 'hwpx') => value)
    await openGeneral('hwpx', setFormat)
    await click(formatTrigger())
    const option = host.querySelector<HTMLButtonElement>('.gs-dd-pop [data-value="hwp"]')!
    await click(option)
    expect(setFormat).toHaveBeenCalledWith('hwp')
    expect(formatTrigger().dataset.value).toBe('hwp')
    expect(formatTrigger().textContent).toContain('HWP (.hwp)')
  })
})

describe('the save-format setting is wired through the shell', () => {
  const read = (path: string): string => readFileSync(join(__dirname, '..', path), 'utf8')

  it('registers both main-process handlers', () => {
    const main = read('src/main/index.ts')
    expect(main).toContain('HOME_CHANNELS.getHwpDefaultFormat')
    expect(main).toContain('HOME_CHANNELS.setHwpDefaultFormat')
    expect(main).toContain('HWP_DEFAULT_FORMAT_KEY')
  })

  it('exposes both calls to the settings screen', () => {
    const preload = read('src/preload/index.ts')
    expect(preload).toContain('async getHwpDefaultFormat()')
    expect(preload).toContain('async setHwpDefaultFormat(format)')
    const api = read('src/shared/home-api.ts')
    expect(api).toContain("getHwpDefaultFormat: 'home:get-hwp-default-format'")
    expect(api).toContain("setHwpDefaultFormat: 'home:set-hwp-default-format'")
  })
})
