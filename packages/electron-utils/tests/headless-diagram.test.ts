import { describe, expect, it } from 'vitest'

import {
  HEADLESS_TARGETS,
  formatHeadlessEnvelope,
  headlessModuleFor,
  parseHeadlessExportArgv,
} from '../src/headless-export'

/**
 * The diagram half of the `--headless-export` grammar: the diagram file
 * names, the picture and diagram-file targets, `--page`, `--ops`, `--batch`,
 * and the envelope of a job that wrote several files, or none.
 */

const argv = (...rest: string[]): string[] => ['IeumOffice.exe', ...rest]

describe('diagram inputs of --headless-export', () => {
  it('routes every diagram file name to the diagram module, and nothing else', () => {
    for (const name of ['a.drawio', 'a.DIO', 'a.drawio.svg', 'a.drawio.png']) {
      expect(headlessModuleFor(`/w/${name}`), name).toBe('diagram')
    }
    expect(headlessModuleFor('/w/a.svg')).toBeNull()
    expect(headlessModuleFor('/w/a.png')).toBeNull()
    expect(headlessModuleFor('/w/a.vsdx')).toBeNull()
    expect(HEADLESS_TARGETS.diagram).toEqual([
      'pdf',
      'png',
      'svg',
      'drawio',
      'dio',
      'drawio.svg',
      'drawio.png',
    ])
  })

  it('reads --page, --ops and --batch', () => {
    const parsed = parseHeadlessExportArgv(
      argv(
        '--headless-export',
        '/w/a.drawio',
        '--to',
        'drawio.png',
        '--out',
        '/w/b.drawio.png',
        '--page=2',
        '--ops',
        '/w/ops.json',
        '--batch',
        'best-effort',
        '--json',
      ),
    )
    expect(parsed).toEqual({
      kind: 'ok',
      request: {
        input: '/w/a.drawio',
        targetFormat: 'drawio.png',
        outPath: '/w/b.drawio.png',
        json: true,
        page: 2,
        ops: '/w/ops.json',
        batch: 'best-effort',
      },
    })
  })

  it('refuses a page that is not a number from 1 and an unknown batch mode', () => {
    const base = ['--headless-export', '/w/a.drawio', '--to', 'png', '--out', '/w/a.png']
    expect(parseHeadlessExportArgv(argv(...base, '--page', '0'))).toMatchObject({ kind: 'error' })
    expect(parseHeadlessExportArgv(argv(...base, '--page', 'Two'))).toMatchObject({
      kind: 'error',
    })
    expect(parseHeadlessExportArgv(argv(...base, '--batch', 'sometimes'))).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('all-or-nothing'),
    })
  })

  it('puts the files a job wrote and its detail in the envelope', () => {
    const several = formatHeadlessEnvelope(
      {
        ok: true,
        input: '/w/a.drawio',
        outPath: '/w/a.png',
        outPaths: ['/w/a-p1.png', '/w/a-p2.png'],
      },
      true,
    )
    expect(JSON.parse(several)).toEqual({
      status: 'ok',
      summary: 'Exported /w/a.drawio to 2 files',
      output_path: '/w/a.png',
      output_paths: ['/w/a-p1.png', '/w/a-p2.png'],
    })
    const none = formatHeadlessEnvelope(
      {
        ok: true,
        input: '/w/a.drawio',
        outPath: '/w/b.drawio',
        outPaths: [],
        detail: { batch: { status: 'ok', changed: false } },
      },
      true,
    )
    expect(JSON.parse(none)).toMatchObject({
      summary: 'Ran /w/a.drawio; nothing was written',
      output_paths: [],
      detail: { batch: { changed: false } },
    })
  })
})
