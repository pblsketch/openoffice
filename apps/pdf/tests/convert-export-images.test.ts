/**
 * "Convert PDF" holds every way out of the PDF: Word / Excel / PPT / Markdown /
 * EPUB, then the picture exports — PNG of every page, only the page being viewed
 * (both rendered as pictures) or only the pictures in the pages, which runs the
 * structure job `extractImages`, and JPG of every page or only the current one.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import { ConvertMenu } from '../src/renderer/convert/ConvertMenu'
import {
  exportEmbeddedImages,
  type EmbeddedImagesApi,
} from '../src/renderer/convert/embedded-images'
import type {
  PdfStructureImagesResult,
  PdfStructureOutcome,
  PdfStructureProgress,
} from '../src/shared/ipc'

const translate = createI18n(strings)
const t: TFunc = (key, params) => translate('en', key, params)
const en = strings.en

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

async function renderMenu(busy = false) {
  const handlers = {
    onConvert: vi.fn(),
    onReflow: vi.fn(),
    onPageImages: vi.fn(),
    onEmbedded: vi.fn(),
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(createElement(ConvertMenu, { t, busy, label: en.convertPdf, ...handlers })),
  )
  return { el: container, ...handlers }
}

const click = async (element: Element | null) => {
  expect(element).toBeTruthy()
  await act(async () => (element as HTMLElement).click())
}

const openMenu = async (el: HTMLElement) => click(el.querySelector('[data-action="convert-pdf"]'))

describe('Convert PDF menu', () => {
  it('lists the conversions, then the PNG and JPG exports under their own headings', async () => {
    const { el, onConvert, onReflow, onPageImages, onEmbedded } = await renderMenu()
    expect(el.querySelector('[role="menu"]')).toBeNull()
    await openMenu(el)
    const items = [...el.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)
    expect(items).toEqual([
      en.convertToWord,
      en.convertToExcel,
      en.convertToPpt,
      en.cvToMarkdown,
      en.cvToEpub,
      en.imgExportWholePages,
      en.imgExportCurrentPage,
      en.imgExportEmbedded,
      en.imgExportWholePages,
      en.imgExportCurrentPage,
    ])
    const headings = [...el.querySelectorAll('.rb-menu-heading')].map((h) => h.textContent)
    expect(headings).toEqual([en.exportImages, en.exportImagesJpg])
    for (const handler of [onConvert, onReflow, onPageImages, onEmbedded]) {
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it('cannot open while a conversion or an export runs', async () => {
    const { el } = await renderMenu(true)
    const button = el.querySelector<HTMLButtonElement>('[data-action="convert-pdf"]')
    expect(button?.disabled).toBe(true)
  })

  it('hands Word / Excel / PPT to the shell and Markdown / EPUB to the dialog', async () => {
    const { el, onConvert, onReflow } = await renderMenu()
    const pick = async (label: string) => {
      await openMenu(el)
      const item = [...el.querySelectorAll('[role="menuitem"]')].find(
        (b) => b.textContent === label,
      )
      await click(item ?? null)
      expect(el.querySelector('[role="menu"]')).toBeNull()
    }
    await pick(en.convertToWord)
    await pick(en.convertToExcel)
    await pick(en.convertToPpt)
    await pick(en.cvToMarkdown)
    await pick(en.cvToEpub)
    expect(onConvert.mock.calls).toEqual([['docx'], ['xlsx'], ['pptx']])
    expect(onReflow.mock.calls).toEqual([['md'], ['epub']])
  })

  it.each([
    ['export-whole-pages', true, 'png'],
    ['export-current-page', false, 'png'],
    ['export-whole-pages-jpg', true, 'jpg'],
    ['export-current-page-jpg', false, 'jpg'],
  ] as const)('%s renders pages as pictures', async (action, allPages, format) => {
    const { el, onPageImages, onEmbedded } = await renderMenu()
    await openMenu(el)
    await click(el.querySelector(`[data-action="${action}"]`))
    expect(onPageImages.mock.calls).toEqual([[allPages, format]])
    expect(onEmbedded).not.toHaveBeenCalled()
    expect(el.querySelector('[role="menu"]')).toBeNull()
  })

  it('runs the picture export for "only the pictures in the pages"', async () => {
    const { el, onPageImages, onEmbedded } = await renderMenu()
    await openMenu(el)
    await click(el.querySelector('[data-action="export-embedded-images"]'))
    expect(onEmbedded).toHaveBeenCalledTimes(1)
    expect(onPageImages).not.toHaveBeenCalled()
  })
})

function fakeImagesApi(
  folder: string | null,
  answer: PdfStructureOutcome<PdfStructureImagesResult>,
) {
  const listeners = new Set<(p: PdfStructureProgress) => void>()
  const api = {
    pickTarget: vi.fn(async () => folder),
    extractImages: vi.fn(async (request: { jobId: string }) => {
      listeners.forEach((l) => l({ jobId: request.jobId, done: 1, total: 2 }))
      return answer
    }),
    onProgress: vi.fn((handler: (p: PdfStructureProgress) => void) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    }),
    revealResult: vi.fn(async () => true),
  } satisfies EmbeddedImagesApi
  return { api, listeners }
}

const run = (api: EmbeddedImagesApi, prepare = vi.fn(async () => true)) => {
  const notice = vi.fn()
  const onProgress = vi.fn()
  const done = exportEmbeddedImages({
    api,
    filePath: 'C:\\docs\\atlas.pdf',
    password: 'pw',
    baseName: 'atlas',
    t,
    prepare,
    onProgress,
    notice,
  })
  return { done, notice, onProgress, prepare }
}

describe('exportEmbeddedImages', () => {
  it('saves first, picks a folder, writes the pictures and shows the first one', async () => {
    const { api, listeners } = fakeImagesApi('C:\\out', {
      ok: true,
      docHash: 'h',
      outDir: 'C:\\out',
      images: [
        { page: 1, file: 'C:\\out\\atlas-p1-1.png', width: 640, height: 480 },
        { page: 3, file: 'C:\\out\\atlas-p3-1.png', width: 200, height: 100 },
      ],
    })
    const { done, notice, onProgress, prepare } = run(api)
    await done
    expect(prepare).toHaveBeenCalled()
    expect(api.pickTarget).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', path: 'C:\\docs\\atlas.pdf' }),
    )
    expect(api.extractImages).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'C:\\docs\\atlas.pdf',
        password: 'pw',
        outDir: 'C:\\out',
        baseName: 'atlas',
      }),
    )
    expect(onProgress).toHaveBeenCalledWith(1, 2)
    expect(api.revealResult).toHaveBeenCalledWith({
      source: 'C:\\docs\\atlas.pdf',
      path: 'C:\\out\\atlas-p1-1.png',
    })
    expect(notice).toHaveBeenCalledWith(t('imgExportDone', { count: 2 }))
    expect(listeners.size).toBe(0)
  })

  it('says so when the pages hold no pictures', async () => {
    const { api } = fakeImagesApi('C:\\out', {
      ok: true,
      docHash: 'h',
      outDir: 'C:\\out',
      images: [],
    })
    const { done, notice } = run(api)
    await done
    expect(api.revealResult).not.toHaveBeenCalled()
    expect(notice).toHaveBeenCalledWith(en.imgExportNone)
  })

  it('stops before the folder dialog when the edits could not be saved', async () => {
    const { api } = fakeImagesApi('C:\\out', { ok: false, error: 'failed' })
    const { done } = run(
      api,
      vi.fn(async () => false),
    )
    await done
    expect(api.pickTarget).not.toHaveBeenCalled()
    expect(api.extractImages).not.toHaveBeenCalled()
  })

  it('does nothing when the folder dialog is cancelled', async () => {
    const { api } = fakeImagesApi(null, { ok: false, error: 'failed' })
    const { done, notice } = run(api)
    await done
    expect(api.extractImages).not.toHaveBeenCalled()
    expect(notice).not.toHaveBeenCalled()
  })

  it('reports a failure in words, and a cancelled job not at all', async () => {
    const failed = fakeImagesApi('C:\\out', { ok: false, error: 'corrupt', message: 'FPDF 3' })
    const first = run(failed.api)
    await first.done
    expect(first.notice).toHaveBeenCalledWith(t('imgExportFailed', { reason: en.cvErrCorrupt }))
    const cancelled = fakeImagesApi('C:\\out', { ok: false, error: 'cancelled' })
    const second = run(cancelled.api)
    await second.done
    expect(second.notice).not.toHaveBeenCalled()
  })
})
