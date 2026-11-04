import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  runHeadlessExport,
  validateHeadlessPaths,
  type HeadlessExporters,
} from '../src/main/headless-export'
import type { HeadlessExportRequest } from '@genoffice/electron-utils'

/**
 * Diagram jobs in the `--headless-export` host: routing, the diagram-only
 * switches, and an exporter that reports the files it wrote (several pages,
 * or none for a batch that changed nothing). Paths are built with
 * `resolve`, so the checks hold on Windows as on POSIX.
 */

const p = (name: string): string => resolve('/work', name)

const request = (
  input: string,
  outPath: string,
  targetFormat: HeadlessExportRequest['targetFormat'],
  extra: Partial<HeadlessExportRequest> = {},
): HeadlessExportRequest => ({ input, targetFormat, outPath, json: true, ...extra })

const fsWith = (present: readonly string[]) => ({
  exists: (path: string) => present.includes(path) || path === resolve('/work'),
  isFile: (path: string) => path !== resolve('/work'),
  mtimeMs: () => Date.now(),
})

function exporters(diagram: HeadlessExporters['diagram']): HeadlessExporters {
  const none = async () => {
    throw new Error('not this module')
  }
  return { docs: none, sheets: none, slides: none, markdown: none, html: none, diagram }
}

describe('diagram jobs in the headless host', () => {
  it('routes a diagram to the diagram exporter with the request', async () => {
    const seen: unknown[] = []
    const fs = fsWith([p('a.drawio'), p('a.pdf')])
    const outcome = await runHeadlessExport(
      request(p('a.drawio'), p('a.pdf'), 'pdf'),
      exporters(async (input, outPath, format, req) => {
        seen.push([input, outPath, format, req.page])
      }),
      fs,
    )
    expect(outcome).toEqual({ ok: true, input: p('a.drawio'), outPath: p('a.pdf') })
    expect(seen).toEqual([[p('a.drawio'), p('a.pdf'), 'pdf', undefined]])
  })

  it('takes the files an exporter reports: every one must be there', async () => {
    const pages = [p('a-p1.png'), p('a-p2.png')]
    const ok = await runHeadlessExport(
      request(p('a.drawio'), p('a.png'), 'png'),
      exporters(async () => ({ paths: pages })),
      fsWith([p('a.drawio'), ...pages]),
    )
    expect(ok).toEqual({ ok: true, input: p('a.drawio'), outPath: p('a.png'), outPaths: pages })
    const missing = await runHeadlessExport(
      request(p('a.drawio'), p('a.png'), 'png'),
      exporters(async () => ({ paths: pages })),
      fsWith([p('a.drawio'), pages[0]!]),
    )
    expect(missing).toMatchObject({
      ok: false,
      code: 3,
      message: expect.stringContaining('a-p2.png'),
    })
  })

  it('a batch that wrote nothing is a success with its detail', async () => {
    const detail = { batch: { status: 'ok', changed: false, results: [], created: [] } }
    const outcome = await runHeadlessExport(
      request(p('a.drawio'), p('b.drawio.png'), 'drawio.png', { ops: p('ops.json') }),
      exporters(async () => ({ paths: [], detail })),
      fsWith([p('a.drawio')]),
    )
    expect(outcome).toEqual({
      ok: true,
      input: p('a.drawio'),
      outPath: p('b.drawio.png'),
      outPaths: [],
      detail,
    })
  })

  it('keeps --page, --ops and --batch to diagrams, and ops to diagram files', () => {
    const fs = fsWith([p('a.drawio'), p('a.docx')])
    expect(
      validateHeadlessPaths(request(p('a.docx'), p('a.pdf'), 'pdf', { page: 1 }), fs),
    ).toMatchObject({ ok: false, code: 1, message: expect.stringContaining('--page') })
    expect(
      validateHeadlessPaths(request(p('a.drawio'), p('a.png'), 'png', { ops: p('o.json') }), fs),
    ).toMatchObject({ ok: false, code: 1, message: expect.stringContaining('--ops') })
    expect(
      validateHeadlessPaths(request(p('a.drawio'), p('a.png'), 'png', { page: 2 }), fs),
    ).toMatchObject({ ok: true, module: 'diagram' })
    expect(
      validateHeadlessPaths(
        request(p('a.drawio'), p('b.drawio'), 'drawio.svg', { ops: p('o.json') }),
        fs,
      ),
    ).toMatchObject({ ok: false, code: 1, message: expect.stringContaining('.drawio.svg') })
    expect(
      validateHeadlessPaths(
        request(p('a.drawio'), p('b.drawio.svg'), 'drawio.svg', { ops: p('o.json') }),
        fs,
      ),
    ).toMatchObject({ ok: true, module: 'diagram' })
  })

  it('refuses a diagram target for a document that is not a diagram', () => {
    const fs = fsWith([p('a.docx')])
    expect(validateHeadlessPaths(request(p('a.docx'), p('a.png'), 'png'), fs)).toMatchObject({
      ok: false,
      code: 1,
    })
  })
})
