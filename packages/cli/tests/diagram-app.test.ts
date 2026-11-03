import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramAppJob, DiagramAppResult } from '../src/formats/diagram-app'
import { run, tempDir } from './helpers'

/**
 * The diagram work the app does windowless (`--headless-export`): what the
 * command line asks the app for and what it does with the answer. The app is
 * replaced by a stand-in that writes what the real one would.
 */

const calls: { job: DiagramAppJob; ops?: unknown[] }[] = []
let answer: (job: DiagramAppJob) => DiagramAppResult = () => {
  throw new Error('no answer set')
}

vi.mock('../src/formats/diagram-app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/formats/diagram-app')>()
  return {
    ...actual,
    runDiagramApp: vi.fn(async (job: DiagramAppJob) => {
      calls.push({
        job,
        ...(job.ops ? { ops: JSON.parse(readFileSync(job.ops, 'utf8')) as unknown[] } : {}),
      })
      return answer(job)
    }),
  }
})

const FIXTURES = join(__dirname, '../../drawio-model/tests/fixtures')
const env = () => ({ ...process.env, GENOFFICE_AUDIT_LOG: 'off', GENOFFICE_USER_DATA: tempDir() })

const model = (cells = '') =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`

function threePages(dir: string): string {
  const path = join(dir, 'chart.drawio')
  writeFileSync(
    path,
    `<mxfile><diagram id="p1" name="One">${model()}</diagram><diagram id="p2" name="Two">${model()}</diagram><diagram id="p3" name="Three">${model()}</diagram></mxfile>`,
  )
  return path
}

/** What the real app writes for a picture export: the named file for one page picked or a PDF, else one per page beside it. */
function writesPictures(pages: number): (job: DiagramAppJob) => DiagramAppResult {
  return (job) => {
    const ext = job.to
    const base = basename(job.out).slice(0, -(ext.length + 1))
    const paths =
      job.page !== undefined || ext === 'pdf'
        ? [job.out]
        : Array.from({ length: pages }, (_, i) =>
            join(dirname(job.out), `${base}-p${i + 1}.${ext}`),
          )
    for (const path of paths) writeFileSync(path, ext)
    return { summary: 'exported', paths, detail: {} }
  }
}

beforeEach(() => {
  calls.length = 0
})

describe('convert of a diagram through the app', () => {
  it('several pages to PNG: one file per page, <name>-p<n>.png beside the input', async () => {
    const dir = tempDir()
    const file = threePages(dir)
    answer = writesPictures(3)
    const r = await run(['convert', file, '--to', 'png', '--json'], { env: env() })
    expect(r.code, r.stdout).toBe(0)
    expect(calls[0]!.job).toEqual({ input: file, to: 'png', out: join(dir, 'chart.png') })
    expect(r.json().detail).toEqual({
      pages: 3,
      output_paths: [1, 2, 3].map((n) => join(dir, `chart-p${n}.png`)),
    })
  })

  it('--out names the folder for several pages; one page (or --page) is one file', async () => {
    const dir = tempDir()
    const file = threePages(dir)
    answer = writesPictures(3)
    const folder = join(dir, 'pictures')
    const r = await run(['convert', file, '--to', 'svg', '--out', folder, '--json'], { env: env() })
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.output_paths).toEqual(
      [1, 2, 3].map((n) => join(folder, `chart-p${n}.svg`)),
    )
    const one = join(dir, 'second.svg')
    const page = await run(
      ['convert', file, '--to', 'svg', '--page', 'Two', '--out', one, '--json'],
      { env: env() },
    )
    expect(page.code).toBe(0)
    expect(calls.at(-1)!.job).toEqual({ input: file, to: 'svg', out: one, page: 2 })
    expect(page.json().output_path).toBe(one)
    const refused = await run(
      ['convert', file, '--to', 'png', '--out', join(dir, 'x.png'), '--json'],
      {
        env: env(),
      },
    )
    expect(refused.code).toBe(1)
    expect(refused.json().error).toBe('invalid_argument')
  })

  it('a one-page diagram without --page is a file per page too: <name>-p1, --out a folder', async () => {
    const dir = tempDir()
    const file = join(dir, 'single.drawio')
    writeFileSync(file, `<mxfile><diagram id="p1" name="One">${model()}</diagram></mxfile>`)
    answer = writesPictures(1)
    const r = await run(['convert', file, '--to', 'png', '--json'], { env: env() })
    expect(r.code, r.stdout).toBe(0)
    expect(calls[0]!.job).toEqual({ input: file, to: 'png', out: join(dir, 'single.png') })
    expect(r.json().output_path).toBe(join(dir, 'single-p1.png'))
    expect(r.json().detail).toEqual({ pages: 1, output_paths: [join(dir, 'single-p1.png')] })
    const folder = join(dir, 'pictures')
    const into = await run(['convert', file, '--to', 'svg', '--out', folder, '--json'], {
      env: env(),
    })
    expect(into.code, into.stdout).toBe(0)
    expect(into.json().output_path).toBe(join(folder, 'single-p1.svg'))
    const asFile = await run(
      ['convert', file, '--to', 'png', '--out', join(dir, 'one.png'), '--json'],
      { env: env() },
    )
    expect(asFile.code).toBe(1)
    expect(asFile.json().error).toBe('invalid_argument')
    const picked = await run(
      ['convert', file, '--to', 'png', '--page', 'One', '--out', join(dir, 'one.png'), '--json'],
      { env: env() },
    )
    expect(picked.code, picked.stdout).toBe(0)
    expect(picked.json().output_path).toBe(join(dir, 'one.png'))
  })

  it('PDF is one file with every page', async () => {
    const dir = tempDir()
    const file = threePages(dir)
    answer = writesPictures(3)
    const r = await run(['convert', file, '--to', 'pdf', '--json'], { env: env() })
    expect(r.code).toBe(0)
    expect(calls[0]!.job).toEqual({ input: file, to: 'pdf', out: join(dir, 'chart.pdf') })
    expect(r.json().output_path).toBe(join(dir, 'chart.pdf'))
  })

  it('an existing page file is refused without --force before the app starts', async () => {
    const dir = tempDir()
    const file = threePages(dir)
    answer = writesPictures(3)
    writeFileSync(join(dir, 'chart-p2.png'), 'old')
    const refused = await run(['convert', file, '--to', 'png', '--json'], { env: env() })
    expect(refused.code).toBe(2)
    expect(refused.json().error).toBe('output_exists')
    expect(calls).toHaveLength(0)
    const forced = await run(['convert', file, '--to', 'png', '--force', '--json'], { env: env() })
    expect(forced.code).toBe(0)
    expect(readFileSync(join(dir, 'chart-p2.png'), 'utf8')).toBe('png')
  })
})

describe('apply and create through the app', () => {
  it('apply on a .drawio.png: the app runs the ops and writes the picture format', async () => {
    const dir = tempDir()
    const file = join(dir, 'pic.drawio.png')
    copyFileSync(join(FIXTURES, 'out.drawio.png'), file)
    answer = (job) => {
      // the stand-in "draws" the result: a valid picture of the same format
      copyFileSync(join(FIXTURES, 'out.drawio.png'), job.out)
      return {
        summary: 'done',
        paths: [job.out],
        detail: {
          batch: {
            status: 'ok',
            changed: true,
            results: [{ index: 0, op: 'add_page', status: 'ok', created: ['page-2'] }],
            created: ['page-2'],
          },
        },
      }
    }
    const r = await run(
      [
        'diagram',
        'apply',
        file,
        '--ops',
        '[{"op":"add_page","name":"New"}]',
        '--page',
        '1쪽',
        '--json',
      ],
      { env: env() },
    )
    expect(r.code, r.stdout).toBe(0)
    expect(calls[0]).toMatchObject({
      job: { input: file, to: 'drawio.png', batch: 'all-or-nothing', page: 1 },
      ops: [{ op: 'add_page', name: 'New' }],
    })
    expect(r.json()).toMatchObject({
      output_path: file,
      detail: { format: 'drawio.png', via: 'app', created: ['page-2'] },
    })
  })

  it('a batch the app rejected writes nothing and answers the failures', async () => {
    const dir = tempDir()
    const file = join(dir, 'pic.drawio.svg')
    copyFileSync(join(FIXTURES, 'out.drawio.svg'), file)
    const before = readFileSync(file)
    answer = () => ({
      summary: 'ran',
      paths: [],
      detail: {
        batch: {
          status: 'rejected',
          changed: false,
          results: [
            {
              index: 0,
              op: 'insert_mermaid',
              status: 'failed',
              error: {
                code: 'invalid_argument',
                message: 'draw.io cannot convert this Mermaid text: x',
              },
            },
          ],
          created: [],
        },
      },
    })
    const r = await run(
      [
        'diagram',
        'apply',
        file,
        '--ops',
        '[{"op":"insert_mermaid","text":"nonsense"}]',
        '--best-effort',
        '--json',
      ],
      { env: env() },
    )
    expect(r.code).toBe(1)
    expect(calls[0]!.job.batch).toBe('best-effort')
    expect(r.json()).toMatchObject({
      error: 'invalid_argument',
      detail: { failures: [{ index: 0, op: 'insert_mermaid' }] },
    })
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('create --mermaid: Mermaid first, then the ops; results count the ops from 0', async () => {
    const dir = tempDir()
    const mmd = join(dir, 'flow.mmd')
    writeFileSync(mmd, 'graph TD; A-->B')
    const out = join(dir, 'flow.drawio')
    answer = (job) => {
      writeFileSync(
        job.out,
        `<mxfile><diagram id="page-1" name="Page-1">${model('<mxCell id="m" value="A" style="" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>')}</diagram></mxfile>`,
      )
      return {
        summary: 'done',
        paths: [job.out],
        detail: {
          batch: {
            status: 'ok',
            changed: true,
            results: [
              { index: 0, op: 'insert_mermaid', status: 'ok', created: ['m', 'n'] },
              { index: 1, op: 'add_shape', status: 'ok', created: ['s1'] },
            ],
            created: ['m', 'n', 's1'],
          },
        },
      }
    }
    const r = await run(
      [
        'create',
        '--type',
        'drawio',
        '--mermaid',
        mmd,
        '--ops',
        '[{"op":"add_shape","label":"note","x":0,"y":300}]',
        '--out',
        out,
        '--json',
      ],
      { env: env() },
    )
    expect(r.code, r.stdout).toBe(0)
    expect(calls[0]!.job.to).toBe('drawio')
    expect(calls[0]!.ops).toEqual([
      { op: 'insert_mermaid', text: 'graph TD; A-->B' },
      { op: 'add_shape', label: 'note', x: 0, y: 300 },
    ])
    expect(r.json().detail).toMatchObject({
      mermaid: { created: ['m', 'n'] },
      results: [{ index: 0, op: 'add_shape', created: ['s1'] }],
      created: ['m', 'n', 's1'],
    })
    expect(readFileSync(out, 'utf8')).toContain('id="m"')
  })
})
