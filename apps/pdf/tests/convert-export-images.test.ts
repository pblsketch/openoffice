/**
 * "Export images" offers three ways: every page, only the page being viewed
 * (both rendered as pictures), and only the pictures in the pages, which runs
 * the structure job `extractImages`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createI18n } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'
import type { TFunc } from '../src/renderer/i18n/locale'
import { ExportImagesMenu } from '../src/renderer/convert/ExportImagesMenu'
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

async function renderMenu() {
  const onWholePages = vi.fn()
  const onCurrentPage = vi.fn()
  const onEmbedded = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      createElement(ExportImagesMenu, {
        t,
        icon: null,
        busy: false,
        label: en.exportImages,
        onWholePages,
        onCurrentPage,
        onEmbedded,
      }),
    ),
  )
  return { el: container, onWholePages, onCurrentPage, onEmbedded }
}

const click = async (element: Element | null) => {
  expect(element).toBeTruthy()
  await act(async () => (element as HTMLElement).click())
}

describe('Export images menu', () => {
  it('offers whole pages, the current page and only the pictures in the pages', async () => {
    const { el, onWholePages, onCurrentPage, onEmbedded } = await renderMenu()
    expect(el.querySelector('[role="menu"]')).toBeNull()
    await click(el.querySelector('[data-action="export-images"]'))
    const items = [...el.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)
    expect(items).toEqual([en.imgExportWholePages, en.imgExportCurrentPage, en.imgExportEmbedded])
    expect(onWholePages).not.toHaveBeenCalled()
    expect(onCurrentPage).not.toHaveBeenCalled()
    expect(onEmbedded).not.toHaveBeenCalled()
  })

  it('runs the existing whole-page export for "whole pages"', async () => {
    const { el, onWholePages, onCurrentPage, onEmbedded } = await renderMenu()
    await click(el.querySelector('[data-action="export-images"]'))
    await click(el.querySelector('[data-action="export-whole-pages"]'))
    expect(onWholePages).toHaveBeenCalledTimes(1)
    expect(onCurrentPage).not.toHaveBeenCalled()
    expect(onEmbedded).not.toHaveBeenCalled()
    expect(el.querySelector('[role="menu"]')).toBeNull()
  })

  it('runs the single-page export for "only the current page"', async () => {
    const { el, onWholePages, onCurrentPage, onEmbedded } = await renderMenu()
    await click(el.querySelector('[data-action="export-images"]'))
    await click(el.querySelector('[data-action="export-current-page"]'))
    expect(onCurrentPage).toHaveBeenCalledTimes(1)
    expect(onWholePages).not.toHaveBeenCalled()
    expect(onEmbedded).not.toHaveBeenCalled()
    expect(el.querySelector('[role="menu"]')).toBeNull()
  })

  it('runs the picture export for "only the pictures in the pages"', async () => {
    const { el, onWholePages, onCurrentPage, onEmbedded } = await renderMenu()
    await click(el.querySelector('[data-action="export-images"]'))
    await click(el.querySelector('[data-action="export-embedded-images"]'))
    expect(onEmbedded).toHaveBeenCalledTimes(1)
    expect(onWholePages).not.toHaveBeenCalled()
    expect(onCurrentPage).not.toHaveBeenCalled()
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
