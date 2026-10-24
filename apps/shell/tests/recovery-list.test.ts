/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type {
  RecoveryListApi,
  RecoveryListItem,
  RecoveryListResult,
} from '../src/shared/recovery-list-api'
import { defaultRecoveryChoice } from '../src/shared/recovery-list-api'
import { LaunchRecoveryList, RecoveryList } from '../src/renderer/src/RecoveryList'
import { recoveryListStrings, recoveryListText } from '../src/renderer/src/i18n/strings-recovery'
import { LocaleProvider } from '../src/renderer/src/locale'

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
  delete window.aiOfficeRecovery
})

function item(over: Partial<RecoveryListItem> & { id: string }): RecoveryListItem {
  return {
    editorKind: 'docs',
    name: `${over.id}.docx`,
    folder: 'C:\\Users\\me\\Documents',
    lastCopyTime: Date.UTC(2026, 9, 22, 9, 30),
    untitled: false,
    fileChangedAfterCopy: false,
    originalMissing: false,
    ...over,
  }
}

const ITEMS: RecoveryListItem[] = [
  item({ id: 'plain' }),
  item({ id: 'changed', editorKind: 'hwp', name: 'report.hwp', fileChangedAfterCopy: true }),
  item({ id: 'missing', editorKind: 'sheets', name: 'budget.xlsx', originalMissing: true }),
  item({
    id: 'untitled',
    editorKind: 'markdown',
    name: 'Untitled 1',
    folder: null,
    untitled: true,
  }),
]

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderList(
  items: RecoveryListItem[],
  onSubmit: (result: RecoveryListResult) => void,
): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(RecoveryList, { items, onSubmit }),
      ),
    )
  })
}

const dialog = (): HTMLElement | null => host.querySelector<HTMLElement>('.recovery-list')
const row = (id: string): HTMLElement =>
  host.querySelector<HTMLElement>(`.recovery-row[data-recovery-id="${id}"]`)!
const radio = (id: string, choice: 'restore' | 'discard'): HTMLInputElement =>
  row(id).querySelector<HTMLInputElement>(`input[value="${choice}"]`)!
const button = (cls: string): HTMLButtonElement => host.querySelector<HTMLButtonElement>(`.${cls}`)!

function click(el: HTMLElement): void {
  act(() => el.click())
}

describe('recovery list defaults', () => {
  it('starts every row at restore, except a file that changed afterwards', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)
    expect(radio('plain', 'restore').checked).toBe(true)
    expect(radio('changed', 'discard').checked).toBe(true)
    expect(radio('missing', 'restore').checked).toBe(true)
    expect(radio('untitled', 'restore').checked).toBe(true)

    click(button('recovery-confirm'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      decisions: { plain: 'restore', changed: 'discard', missing: 'restore', untitled: 'restore' },
    })
  })

  it('matches the shared default rule', () => {
    expect(ITEMS.map(defaultRecoveryChoice)).toEqual(['restore', 'discard', 'restore', 'restore'])
  })

  it('takes a choice changed on one row', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)
    click(radio('plain', 'discard'))
    click(radio('changed', 'restore'))
    click(button('recovery-confirm'))
    expect(onSubmit).toHaveBeenCalledWith({
      decisions: { plain: 'discard', changed: 'restore', missing: 'restore', untitled: 'restore' },
    })
  })
})

describe('restore all / discard all', () => {
  it('sets every row at once', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)

    click(button('recovery-discard-all'))
    for (const it of ITEMS) expect(radio(it.id, 'discard').checked).toBe(true)
    click(button('recovery-confirm'))
    expect(onSubmit).toHaveBeenLastCalledWith({
      decisions: { plain: 'discard', changed: 'discard', missing: 'discard', untitled: 'discard' },
    })

    click(button('recovery-restore-all'))
    for (const it of ITEMS) expect(radio(it.id, 'restore').checked).toBe(true)
    click(button('recovery-confirm'))
    expect(onSubmit).toHaveBeenLastCalledWith({
      decisions: { plain: 'restore', changed: 'restore', missing: 'restore', untitled: 'restore' },
    })
  })
})

describe('closing the list means later', () => {
  it('the close button hands back dismissed, not decisions', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)
    const close = button('recovery-list-close')
    expect(close.getAttribute('aria-label')).toBe(recoveryListText('en', 'later'))
    click(close)
    expect(onSubmit).toHaveBeenCalledWith({ dismissed: true })
  })

  it('Esc hands back dismissed', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)
    act(() => {
      button('recovery-confirm').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(onSubmit).toHaveBeenCalledWith({ dismissed: true })
  })

  it('a click outside the dialog does not close it', async () => {
    const onSubmit = vi.fn()
    await renderList(ITEMS, onSubmit)
    click(host.querySelector<HTMLElement>('.recovery-list-overlay')!)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
  })
})

describe('row contents and markers', () => {
  it('shows the title, kind, name, folder and the copy time', async () => {
    await renderList(ITEMS, vi.fn())
    expect(dialog()!.getAttribute('role')).toBe('dialog')
    expect(dialog()!.getAttribute('aria-label')).toBe(recoveryListText('en', 'title'))
    const plain = row('plain')
    expect(plain.querySelector('.recovery-row-name')!.textContent).toBe('plain.docx')
    expect(plain.querySelector('.recovery-row-kind')!.textContent).toBe('Docs')
    expect(plain.querySelector('.recovery-row-folder')!.textContent).toBe(
      'C:\\Users\\me\\Documents',
    )
    expect(plain.querySelector('.recovery-row-time')!.textContent).toMatch(/^Kept at .*2026/)
    expect(plain.querySelector('.recovery-marker')).toBeNull()
  })

  it('marks a file that changed afterwards', async () => {
    await renderList(ITEMS, vi.fn())
    const marker = row('changed').querySelector('.recovery-marker-changed')
    expect(marker).not.toBeNull()
    expect(marker!.textContent).toContain(recoveryListText('en', 'changedAfter'))
    expect(row('changed').querySelector('.recovery-marker-missing')).toBeNull()
  })

  it('marks a missing original and says it opens as an untitled document', async () => {
    await renderList(ITEMS, vi.fn())
    const marker = row('missing').querySelector('.recovery-marker-missing')
    expect(marker).not.toBeNull()
    expect(marker!.textContent).toContain(recoveryListText('en', 'missing'))
    expect(marker!.textContent).toContain(recoveryListText('en', 'missingNote'))
    expect(marker!.textContent).toMatch(/untitled/)
  })

  it('names an untitled document as never saved instead of a folder', async () => {
    await renderList(ITEMS, vi.fn())
    expect(row('untitled').querySelector('.recovery-row-folder')!.textContent).toBe(
      recoveryListText('en', 'untitledFolder'),
    )
  })
})

describe('the launch list on Home', () => {
  function installApi(list: RecoveryListItem[] | null): {
    submit: ReturnType<typeof vi.fn>
  } {
    const submit = vi.fn(async () => undefined)
    window.aiOfficeRecovery = {
      getLaunchRecoveryList: async () => list,
      submitLaunchRecovery: submit,
    } satisfies RecoveryListApi
    return { submit }
  }

  async function renderLaunch(): Promise<void> {
    await act(async () => {
      root.render(
        createElement(LocaleProvider, { initial: 'en' }, createElement(LaunchRecoveryList)),
      )
    })
    await flush()
  }

  it('shows nothing without the bridge', async () => {
    await renderLaunch()
    expect(dialog()).toBeNull()
  })

  it('shows nothing when there is nothing to ask', async () => {
    installApi([])
    await renderLaunch()
    expect(dialog()).toBeNull()
    installApi(null)
    await renderLaunch()
    expect(dialog()).toBeNull()
  })

  it('shows the rows and closes after the choices are applied', async () => {
    const { submit } = installApi(ITEMS)
    await renderLaunch()
    expect(dialog()).not.toBeNull()
    click(button('recovery-confirm'))
    await flush()
    expect(submit).toHaveBeenCalledWith({
      decisions: { plain: 'restore', changed: 'discard', missing: 'restore', untitled: 'restore' },
    })
    expect(dialog()).toBeNull()
  })

  it('submits dismissed when closed', async () => {
    const { submit } = installApi(ITEMS)
    await renderLaunch()
    click(button('recovery-list-close'))
    await flush()
    expect(submit).toHaveBeenCalledWith({ dismissed: true })
    expect(dialog()).toBeNull()
  })

  it('stays up when the result could not be applied', async () => {
    const submit = vi.fn(async () => {
      throw new Error('store unavailable')
    })
    window.aiOfficeRecovery = {
      getLaunchRecoveryList: async () => ITEMS,
      submitLaunchRecovery: submit,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await renderLaunch()
    click(button('recovery-confirm'))
    await flush()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(dialog()).not.toBeNull()
    expect(button('recovery-confirm').disabled).toBe(false)
    warn.mockRestore()
  })
})

describe('recovery list strings', () => {
  it('covers every UI language with the zh key set, translated', () => {
    const keys = Object.keys(recoveryListStrings.zh).sort()
    for (const lang of LANGS) {
      const dict = recoveryListStrings[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual(keys)
      for (const key of keys) expect(dict[key], `${lang}.${key}`).toBeTruthy()
      if (lang !== 'en') {
        expect(dict.title, `${lang} title copied from en`).not.toBe(recoveryListStrings.en.title)
      }
    }
  })
})
