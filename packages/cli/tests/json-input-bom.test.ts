import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { xlsxSidecarPath } from '../src/resources'
import { run, tempDir } from './helpers'

const BOM = '﻿'
const sidecar = Boolean(xlsxSidecarPath())

beforeAll(async () => {
  const wasm = createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

/** A JSON input file that starts with a UTF-8 BOM, as Windows editors and PowerShell save it. */
function bomFile(dir: string, name: string, value: unknown): string {
  const path = join(dir, name)
  writeFileSync(path, BOM + JSON.stringify(value), 'utf8')
  expect(readFileSync(path)[0]).toBe(0xef)
  return path
}

async function document(dir: string): Promise<string> {
  const md = join(dir, 'a.md')
  writeFileSync(md, '# Title\n\nBody.\n')
  const docx = join(dir, 'a.docx')
  expect((await run(['create', '--type', 'docx', '--from', md, '--out', docx])).code).toBe(0)
  return docx
}

const textbox = (text: string) => ({
  op: 'addElement',
  target: { slide: 0 },
  kind: 'textbox',
  offset: { x: 914400, y: 914400, cx: 3657600, cy: 914400 },
  paragraphs: [{ runs: [{ text }] }],
})

const textElement = (text: string) => ({
  type: 'text',
  x: 80,
  y: 80,
  w: 600,
  h: 60,
  paragraphs: [{ runs: [{ text, sizePt: 24 }] }],
})

const outlinePage = (title: string, type: string, layout: string) => ({
  title,
  type,
  layout,
  brief: `${title}: three cards with the real 2024 figures from the brief, one source line under each card.`,
  image_queries: [],
})

async function slideText(pptx: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(pptx))
  return zip.file('ppt/slides/slide1.xml')!.async('string')
}

describe('a leading UTF-8 BOM in JSON input files', () => {
  it('docs apply --ops keeps a U+FEFF inside a value and drops only the first one', async () => {
    const dir = tempDir()
    const docx = await document(dir)
    const ops = bomFile(dir, 'ops.json', [
      { op: 'findReplace', find: 'Body', replace: `Te${BOM}xt` },
    ])
    const r = await run(['docs', 'apply', docx, '--ops', ops, '--json'])
    expect(r.code, r.stdout).toBe(0)
    const read = await run(['docs', 'read', docx, '--full', '--json'])
    expect(JSON.stringify(read.json().detail.items)).toContain('Te\ufeffxt')
  })

  it('create --type pptx --ops and slides apply --ops accept it', async () => {
    const dir = tempDir()
    const out = join(dir, 'deck.pptx')
    const created = await run([
      'create',
      '--type',
      'pptx',
      '--ops',
      bomFile(dir, 'create.json', [textbox('Hello bom')]),
      '--out',
      out,
      '--json',
    ])
    expect(created.code, created.stdout).toBe(0)
    expect(await slideText(out)).toContain('Hello bom')
    const applied = await run([
      'slides',
      'apply',
      out,
      '--ops',
      bomFile(dir, 'edit.json', { ops: [textbox('Second bom')] }),
      '--json',
    ])
    expect(applied.code, applied.stdout).toBe(0)
    expect(await slideText(out)).toContain('Second bom')
  })

  it('create --type pptx --spec accepts it', async () => {
    const dir = tempDir()
    const out = join(dir, 'deck.pptx')
    const spec = bomFile(dir, 'spec.json', { pages: [{ elements: [textElement('Spec bom')] }] })
    const r = await run(['create', '--type', 'pptx', '--spec', spec, '--out', out, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(await slideText(out)).toContain('Spec bom')
  })

  it('slides check accepts a BOM page file and a BOM outline', async () => {
    const dir = tempDir()
    const page = bomFile(dir, 'page.json', { elements: [textElement('Page bom')] })
    const pageResult = await run(['slides', 'check', page, '--json'])
    expect(pageResult.json().error).not.toBe('invalid_json')
    expect(JSON.stringify(pageResult.json())).not.toContain('not valid JSON')
    const outline = bomFile(dir, 'outline.json', {
      core_hook: 'Margins fell 40% while volume grew',
      pages: [
        outlinePage('Costs', 'content', 'hero_big_number'),
        outlinePage('Thanks', 'closing', 'closing_cta'),
      ],
    })
    const outlineResult = await run(['slides', 'check', outline, '--json'])
    expect(outlineResult.code, outlineResult.stdout).toBe(0)
    expect(outlineResult.json().detail.kind).toBe('outline')
  })

  it('hwp apply --ops accepts it', async () => {
    const dir = tempDir()
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '7월 1일부터 시행합니다.')
    const path = join(dir, 'report.hwpx')
    writeFileSync(path, doc.exportHwpx())
    const ops = bomFile(dir, 'ops.json', [
      { op: 'replace_text', find: '7월 1일', replace: '8월 1일' },
    ])
    const r = await run(['hwp', 'apply', path, '--ops', ops, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.batch).toMatchObject({ total: 1, applied: 1, failed: 0 })
  })

  it.skipIf(!sidecar)('sheet apply --ops and --cells accept it', async () => {
    const dir = tempDir()
    const table = join(dir, 'table.json')
    writeFileSync(table, JSON.stringify([['a'], [1]]))
    const xlsx = join(dir, 'book.xlsx')
    expect((await run(['create', '--type', 'xlsx', '--from', table, '--out', xlsx])).code).toBe(0)
    const cells = bomFile(dir, 'cells.json', [{ cell: 'A2', value: 5 }])
    const viaCells = await run(['sheet', 'apply', xlsx, '--cells', cells, '--json'])
    expect(viaCells.code, viaCells.stdout).toBe(0)
    const ops = bomFile(dir, 'ops.json', [{ op: 'merge_cells', range: 'A1:B1' }])
    const viaOps = await run(['sheet', 'apply', xlsx, '--ops', ops, '--json'])
    expect(viaOps.code, viaOps.stdout).toBe(0)
  })

  it('still reports invalid_json for text that is not JSON after the BOM', async () => {
    const dir = tempDir()
    const docx = await document(dir)
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, `${BOM}not json`, 'utf8')
    const r = await run(['docs', 'apply', docx, '--ops', ops, '--json'])
    expect(r.code).toBe(1)
    expect(r.json().error).toBe('invalid_json')
  })
})
