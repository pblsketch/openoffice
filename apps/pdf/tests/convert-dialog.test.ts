/**
 * The Markdown / EPUB conversion dialog against a fake structure API: form
 * validation, page-range errors, the EPUB book fields, the running job's
 * Cancel, the password retry, what happens on success (Markdown opens in a
 * tab, EPUB offers its folder) and how warnings and failures read.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'
import {
  ConvertDialog,
  type ConvertDialogApi,
  type ConvertDialogProps,
} from '../src/renderer/convert/ConvertDialog'
import type {
  PdfStructureConvertRequest,
  PdfStructureConvertResult,
  PdfStructureOutcome,
  PdfStructureProgress,
} from '../src/shared/ipc'

const translate = createI18n(strings)
const t: ConvertDialogProps['t'] = (key, params) => translate('en', key, params)
const en = strings.en

const SOURCE = 'C:\\docs\\report.pdf'
const TARGET_MD = 'C:\\out\\report.md'
const TARGET_EPUB = 'C:\\out\\report.epub'

type ConvertAnswer = PdfStructureOutcome<PdfStructureConvertResult>

const okResult = (outPath: string, warnings: PdfStructureConvertResult['warnings'] = []) =>
  ({
    ok: true,
    docHash: 'h',
    outPath,
    warnings,
    assetsWritten: 0,
    assetsReused: 0,
  }) satisfies ConvertAnswer

/** a fake structure API; convert answers through `answer` (or waits for `settle`) */
function fakeApi(target: string | null) {
  const progress = new Set<(p: PdfStructureProgress) => void>()
  let pending: ((answer: ConvertAnswer) => void) | null = null
  const answers: ConvertAnswer[] = []
  const api = {
    pickTarget: vi.fn(async () => target),
    convert: vi.fn(
      (_request: PdfStructureConvertRequest) =>
        new Promise<ConvertAnswer>((resolve) => {
          const next = answers.shift()
          if (next) resolve(next)
          else pending = resolve
        }),
    ),
    cancel: vi.fn(async () => {
      pending?.({ ok: false, error: 'cancelled' })
      pending = null
      return true
    }),
    onProgress: vi.fn((handler: (p: PdfStructureProgress) => void) => {
      progress.add(handler)
      return () => progress.delete(handler)
    }),
    releaseTarget: vi.fn(async () => true),
    openResult: vi.fn(async () => true),
    revealResult: vi.fn(async () => true),
  } satisfies ConvertDialogApi
  return {
    api,
    queue: (...next: ConvertAnswer[]) => answers.push(...next),
    settle: (answer: ConvertAnswer) => {
      pending?.(answer)
      pending = null
    },
    emit: (p: PdfStructureProgress) => progress.forEach((handler) => handler(p)),
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function render(overrides: Partial<ConvertDialogProps> & Pick<ConvertDialogProps, 'api'>) {
  const props: ConvertDialogProps = {
    format: 'md',
    filePath: SOURCE,
    fileName: 'report.pdf',
    pageCount: 10,
    docInfo: {},
    password: undefined,
    lang: 'en',
    t,
    prepare: vi.fn(async () => true),
    pageText: async () => '',
    onClose: vi.fn(),
    ...overrides,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(createElement(ConvertDialog, props)))
  await settle()
  return { props, el: container }
}

const q = (el: Element, selector: string) => el.querySelector(selector) as HTMLElement | null

const click = async (element: Element | null) => {
  expect(element).toBeTruthy()
  await act(async () => (element as HTMLElement).click())
  await settle()
}

async function type(input: Element | null, value: string) {
  expect(input).toBeTruthy()
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const choosePages = async (el: Element, text: string) => {
  await click(q(el, '[data-field="some-pages"]'))
  await type(q(el, '[data-field="range"]'), text)
}

describe('conversion dialog: the form', () => {
  it('converts every page by default and sends no page list', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { el, props } = await render({ api: fake.api })
    expect(el.textContent).toContain(t('cvPagesAll', { count: 10 }))
    await click(q(el, '[data-action="convert"]'))
    expect(props.prepare).toHaveBeenCalledTimes(1)
    expect(fake.api.pickTarget).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'md', path: SOURCE }),
    )
    const request = fake.api.convert.mock.calls[0]![0]
    expect(request).toMatchObject({ path: SOURCE, format: 'md', outPath: TARGET_MD })
    expect(request.pages).toBeUndefined()
    expect(request.password).toBeUndefined()
    expect(request.jobId).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })

  it('sends the typed pages, ascending and once each', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { el } = await render({ api: fake.api })
    await choosePages(el, '8, 1-3, 2')
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.convert.mock.calls[0]![0].pages).toEqual([1, 2, 3, 8])
  })

  it('refuses a malformed range without saving, picking or converting', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el, props } = await render({ api: fake.api })
    await choosePages(el, '1-x')
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="range"]')?.textContent).toBe(en.cvPagesSyntax)
    expect(props.prepare).not.toHaveBeenCalled()
    expect(fake.api.pickTarget).not.toHaveBeenCalled()
    expect(fake.api.convert).not.toHaveBeenCalled()
  })

  it('names the valid pages when the range runs past the document', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el } = await render({ api: fake.api })
    await choosePages(el, '9-12')
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="range"]')?.textContent).toBe(
      t('cvPagesOutOfRange', { first: 1, last: 10 }),
    )
    expect(fake.api.convert).not.toHaveBeenCalled()
  })

  it('asks for pages when "only these pages" is chosen with nothing typed', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-field="some-pages"]'))
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="range"]')?.textContent).toBe(en.cvPagesEmpty)
  })

  it("shows the job's valid range when the job itself rejects the pages", async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue({ ok: false, error: 'page-range', validRange: { first: 1, last: 7 } })
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="run"]')?.textContent).toBe(
      t('cvPagesOutOfRange', { first: 1, last: 7 }),
    )
    // still the form: the user can fix the range and convert again
    expect(q(el, '[data-action="convert"]')).not.toBeNull()
  })

  it('stops when the pending edits could not be saved', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el } = await render({ api: fake.api, prepare: vi.fn(async () => false) })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.pickTarget).not.toHaveBeenCalled()
    expect(fake.api.convert).not.toHaveBeenCalled()
  })

  it('does nothing when the save dialog is cancelled', async () => {
    const fake = fakeApi(null)
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.pickTarget).toHaveBeenCalledTimes(1)
    expect(fake.api.convert).not.toHaveBeenCalled()
  })

  it('uses a location chosen beforehand without asking again', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="choose-target"]'))
    expect(el.textContent).toContain('report.md')
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.pickTarget).toHaveBeenCalledTimes(1)
    expect(fake.api.convert.mock.calls[0]![0].outPath).toBe(TARGET_MD)
  })

  it('does not overwrite a Markdown file still open in a tab', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.api.releaseTarget.mockResolvedValueOnce(false)
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.releaseTarget).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
    expect(fake.api.convert).not.toHaveBeenCalled()
    expect(q(el, '[data-error="run"]')?.textContent).toBe(en.cvErrTargetOpen)
  })
})

describe('conversion dialog: Save As › Markdown', () => {
  it('converts to the picked target at once, without the form', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { props } = await render({ api: fake.api, initialTarget: TARGET_MD })
    expect(props.prepare).toHaveBeenCalledTimes(1)
    expect(fake.api.pickTarget).not.toHaveBeenCalled()
    expect(fake.api.releaseTarget).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
    expect(fake.api.convert.mock.calls[0]![0]).toMatchObject({
      path: SOURCE,
      format: 'md',
      outPath: TARGET_MD,
    })
    expect(fake.api.openResult).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows the warnings instead of opening the Markdown', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD, [{ kind: 'allPagesAsImages', message: 'all pages' }]))
    const { el } = await render({ api: fake.api, initialTarget: TARGET_MD })
    expect(fake.api.openResult).not.toHaveBeenCalled()
    expect(el.textContent).toContain(en.cvWarnAllPagesAsImages)
    expect(q(el, '[data-action="open-md"]')).not.toBeNull()
  })

  it('stays on the form when the target is still open in a tab', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.api.releaseTarget.mockResolvedValueOnce(false)
    const { el } = await render({ api: fake.api, initialTarget: TARGET_MD })
    expect(fake.api.convert).not.toHaveBeenCalled()
    expect(q(el, '[data-error="run"]')?.textContent).toBe(en.cvErrTargetOpen)
    expect(q(el, '[data-action="convert"]')).not.toBeNull()
  })
})

describe('conversion dialog: EPUB book fields', () => {
  it('prefills title and author from the document information', async () => {
    const fake = fakeApi(TARGET_EPUB)
    const { el } = await render({
      api: fake.api,
      format: 'epub',
      docInfo: { title: '  The Field Guide ', author: 'A. Writer' },
    })
    expect((q(el, '[data-field="title"]') as HTMLInputElement).value).toBe('The Field Guide')
    expect((q(el, '[data-field="author"]') as HTMLInputElement).value).toBe('A. Writer')
    expect((q(el, '[data-field="cover"]') as HTMLInputElement).checked).toBe(true)
    expect((q(el, '[data-field="page-breaks"]') as HTMLInputElement).checked).toBe(false)
    expect((q(el, '[data-field="language"]') as HTMLInputElement).value).toBe('')
  })

  it('falls back to the file name for the title and leaves the author empty', async () => {
    const fake = fakeApi(TARGET_EPUB)
    const { el } = await render({ api: fake.api, format: 'epub', docInfo: { title: ' ' } })
    expect((q(el, '[data-field="title"]') as HTMLInputElement).value).toBe('report')
    expect((q(el, '[data-field="author"]') as HTMLInputElement).value).toBe('')
  })

  it('sends the book fields, the cover choice and the localized page alt text', async () => {
    const fake = fakeApi(TARGET_EPUB)
    fake.queue(okResult(TARGET_EPUB))
    const { el } = await render({ api: fake.api, format: 'epub', docInfo: { title: 'T' } })
    await type(q(el, '[data-field="author"]'), 'Kim')
    await type(q(el, '[data-field="language"]'), 'ko')
    await click(q(el, '[data-field="cover"]'))
    await click(q(el, '[data-field="page-breaks"]'))
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.convert.mock.calls[0]![0]).toMatchObject({
      format: 'epub',
      outPath: TARGET_EPUB,
      epub: {
        title: 'T',
        author: 'Kim',
        cover: false,
        language: 'ko',
        uiLanguage: 'en',
        pageImageAlt: en.cvPageImageAlt,
        pageBreaks: true,
      },
    })
    expect(en.cvPageImageAlt).toContain('{page}')
    // EPUB writes no Markdown tab, so no tab is asked to let go of the target
    expect(fake.api.releaseTarget).not.toHaveBeenCalled()
  })

  it('requires a title and a well-formed language tag', async () => {
    const fake = fakeApi(TARGET_EPUB)
    const { el } = await render({ api: fake.api, format: 'epub', docInfo: { title: 'T' } })
    await type(q(el, '[data-field="title"]'), '  ')
    await type(q(el, '[data-field="language"]'), 'not a tag')
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="title"]')?.textContent).toBe(en.cvBookTitleRequired)
    expect(q(el, '[data-error="language"]')?.textContent).toBe(en.cvBookLanguageInvalid)
    expect(fake.api.convert).not.toHaveBeenCalled()
  })
})

describe('conversion dialog: running', () => {
  it('shows progress and Cancel calls cancel with the running job', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el, props } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    const jobId = fake.api.convert.mock.calls[0]![0].jobId
    expect(q(el, '[data-progress]')?.textContent).toContain(en.cvPreparing)
    await act(async () => fake.emit({ jobId, done: 3, total: 10 }))
    expect(q(el, '[data-progress]')?.textContent).toContain(t('cvRunning', { done: 3, total: 10 }))
    // progress of another job is not ours
    await act(async () => fake.emit({ jobId: 'other', done: 9, total: 10 }))
    expect(q(el, '[data-progress]')?.textContent).toContain(t('cvRunning', { done: 3, total: 10 }))
    await click(q(el, '[data-action="cancel-run"]'))
    expect(fake.api.cancel).toHaveBeenCalledWith(jobId)
    expect(q(el, '[data-error="run"]')?.textContent).toBe(en.cvCancelled)
    expect(props.onClose).not.toHaveBeenCalled()
    expect(fake.api.openResult).not.toHaveBeenCalled()
  })

  it('cancels the running job when the dialog goes away', async () => {
    const fake = fakeApi(TARGET_MD)
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    const jobId = fake.api.convert.mock.calls[0]![0].jobId
    await act(async () => root!.unmount())
    root = null
    expect(fake.api.cancel).toHaveBeenCalledWith(jobId)
  })

  it('passes the password the document was opened with', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { el } = await render({ api: fake.api, password: 'open-pw' })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.convert.mock.calls[0]![0].password).toBe('open-pw')
  })

  it('asks for the password and retries with it', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue({ ok: false, error: 'password-required' }, okResult(TARGET_MD))
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    const field = q(el, '.pdf-pwd-dialog input')
    expect(field).not.toBeNull()
    // no password was sent: this is the first ask, not a wrong entry
    expect(q(el, '.pdf-pwd-error')).toBeNull()
    await type(field, 'secret')
    await click(q(el, '.pdf-pwd-dialog .pdf-modal-btn.primary'))
    expect(fake.api.convert).toHaveBeenCalledTimes(2)
    expect(fake.api.convert.mock.calls[1]![0]).toMatchObject({
      password: 'secret',
      outPath: TARGET_MD,
    })
    expect(fake.api.openResult).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
  })

  it('marks a wrong password when the typed one is refused', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue({ ok: false, error: 'password-required' }, { ok: false, error: 'password-required' })
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    await type(q(el, '.pdf-pwd-dialog input'), 'nope')
    await click(q(el, '.pdf-pwd-dialog .pdf-modal-btn.primary'))
    // the prompt is the app's own password dialog (it reads the locale from context)
    expect(q(el, '.pdf-pwd-error')).not.toBeNull()
    expect(q(el, '.pdf-pwd-dialog input')?.classList.contains('invalid')).toBe(true)
    expect(fake.api.convert.mock.calls[1]![0].password).toBe('nope')
  })
})

describe('conversion dialog: results', () => {
  it('opens a Markdown result in a tab and closes when there is nothing to report', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(okResult(TARGET_MD))
    const { el, props } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.openResult).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('lists the warnings by kind first, then opens the tab on request', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(
      okResult(TARGET_MD, [
        { kind: 'pageAsImage', page: 5, reason: 'scanned', message: 'Page 5 kept as a picture' },
        { kind: 'pageAsImage', page: 2, reason: 'degraded', message: 'Page 2 kept as a picture' },
        { kind: 'formulaAsCode', page: 4, message: 'formula' },
        { kind: 'footnoteMissing', page: 6, footnoteId: 'n1', message: 'footnote' },
      ]),
    )
    const { el, props } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.openResult).not.toHaveBeenCalled()
    const lines = [...el.querySelectorAll('.pdf-convert-warnings li')].map((li) => li.textContent)
    expect(lines).toEqual([
      t('cvWarnPageAsImage', { pages: '2, 5' }),
      en.cvWarnScannedHint,
      t('cvWarnFormulaAsCode', { pages: '4' }),
      t('cvWarnFootnoteMissing', { pages: '6' }),
    ])
    // the English log messages of the job never reach the screen
    expect(el.textContent).not.toContain('kept as a picture')
    await click(q(el, '[data-action="open-md"]'))
    expect(fake.api.openResult).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_MD })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('says every page became a picture once, without listing them', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue(
      okResult(TARGET_MD, [
        { kind: 'pageAsImage', page: 1, reason: 'scanned', message: 'x' },
        { kind: 'allPagesAsImages', message: 'y' },
      ]),
    )
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    const lines = [...el.querySelectorAll('.pdf-convert-warnings li')].map((li) => li.textContent)
    expect(lines).toEqual([en.cvWarnAllPagesAsImages])
  })

  it('saves an EPUB and offers its folder instead of opening it', async () => {
    const fake = fakeApi(TARGET_EPUB)
    fake.queue(okResult(TARGET_EPUB))
    const { el, props } = await render({ api: fake.api, format: 'epub', docInfo: { title: 'T' } })
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.openResult).not.toHaveBeenCalled()
    expect(el.textContent).toContain(en.cvDoneEpub)
    await click(q(el, '[data-action="open-folder"]'))
    expect(fake.api.revealResult).toHaveBeenCalledWith({ source: SOURCE, path: TARGET_EPUB })
    await click(q(el, '[data-action="close"]'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('explains an assets folder holding a file the app did not write', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue({ ok: false, error: 'asset-conflict', message: 'assets/abc.png exists' })
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="run"]')?.textContent).toBe(en.cvErrAssetConflict)
    expect(fake.api.openResult).not.toHaveBeenCalled()
  })

  it('picks the location again after the target was refused', async () => {
    const fake = fakeApi(TARGET_MD)
    fake.queue({ ok: false, error: 'not-granted' }, okResult(TARGET_MD))
    const { el } = await render({ api: fake.api })
    await click(q(el, '[data-action="convert"]'))
    expect(q(el, '[data-error="run"]')?.textContent).toBe(en.cvErrTarget)
    await click(q(el, '[data-action="convert"]'))
    expect(fake.api.pickTarget).toHaveBeenCalledTimes(2)
  })
})
