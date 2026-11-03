import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DIAGRAM_OPS,
  encodeCompressedPage,
  openDiagram,
  readDiagramTable,
} from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { defaultRegistry } from '../src/cli'
import { loadTypedSchemas } from '../src/mcp/op-schemas'
import { resolveTools, toolShape } from '../src/mcp/tools'
import { run, tempDir } from './helpers'

/**
 * `diagram read`, `diagram apply`, `create --type drawio` and the diagram
 * side of `convert` / `guide`, without the app: the model writes .drawio and
 * .dio itself, and work that needs draw.io (Mermaid, picture formats,
 * pictures) answers app_unavailable when no app can be started.
 */

const FIXTURES = join(__dirname, '../../drawio-model/tests/fixtures')
const NO_APP = 'C:/no/such/IeumOffice.exe'

const env = (extra: Record<string, string> = {}) => ({
  ...process.env,
  GENOFFICE_AUDIT_LOG: 'off',
  GENOFFICE_USER_DATA: tempDir(),
  GENOFFICE_APP_BIN: NO_APP,
  ...extra,
})

const vertex = (id: string, value: string, x: number) =>
  `<mxCell id="${id}" value="${value}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`

const model = (cells: string) =>
  `<mxGraphModel dx="800" dy="600" grid="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`

/** Two pages: "One" uncompressed with a, b and an edge; "Two" compressed with c. */
function twoPages(dir: string, name = 'flow.drawio'): string {
  const second = encodeCompressedPage(model(vertex('c', 'Third', 40)), nodePageCodec)
  const xml = [
    '<mxfile host="test" modified="2026-11-03T00:00:00Z" agent="keep me">',
    `  <diagram id="p1" name="One">${model(
      vertex('a', 'Start', 40) +
        vertex('b', 'End', 240) +
        '<mxCell id="e" value="" style="endArrow=classic;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>',
    )}</diagram>`,
    `  <diagram id="p2" name="Two">${second}</diagram>`,
    '</mxfile>',
    '',
  ].join('\n')
  const path = join(dir, name)
  writeFileSync(path, xml)
  return path
}

const diagramElements = (xml: string): string[] => xml.match(/<diagram\b[\s\S]*?<\/diagram>/g) ?? []

function reopen(path: string) {
  const opened = openDiagram(path, new Uint8Array(readFileSync(path)), nodePageCodec)
  if (!opened.ok) throw new Error(opened.message)
  return opened.file
}

describe('diagram read', () => {
  it('reads every page as the model read table, without the app', async () => {
    const file = twoPages(tempDir())
    const r = await run(['diagram', 'read', file, '--json'], { env: env() })
    expect(r.code).toBe(0)
    const { pages } = r.json().detail
    expect(pages.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2'])
    const opened = reopen(file)
    const table = readDiagramTable(opened.state, { page: 'p1' })
    expect('page' in table && pages[0]).toEqual('page' in table ? table.page : null)
    expect(pages[1].shapes.map((s: { id: string }) => s.id)).toEqual(['c'])
    expect(pages[0].edges[0]).toMatchObject({ id: 'e', source: 'a', target: 'b' })
  })

  it('reads one page by name or id; an unknown page is refused with the page list', async () => {
    const file = twoPages(tempDir())
    const byName = await run(['diagram', 'read', file, '--page', 'Two', '--json'], { env: env() })
    expect(byName.json().detail.pages.map((p: { id: string }) => p.id)).toEqual(['p2'])
    const missing = await run(['diagram', 'read', file, '--page', 'Three', '--json'], {
      env: env(),
    })
    expect(missing.code).toBe(1)
    expect(missing.json()).toMatchObject({
      error: 'target_not_found',
      detail: {
        pages: [
          { id: 'p1', name: 'One' },
          { id: 'p2', name: 'Two' },
        ],
      },
    })
  })

  it('reads the diagram inside a .drawio.png and a .drawio.svg', async () => {
    const dir = tempDir()
    for (const name of ['out.drawio.png', 'out.drawio.svg']) {
      copyFileSync(join(FIXTURES, name), join(dir, name))
      const r = await run(['diagram', 'read', join(dir, name), '--json'], { env: env() })
      expect(r.code, r.stdout).toBe(0)
      expect(r.json().detail.pages[0].shapes.length).toBeGreaterThan(0)
    }
  })

  it('prints the read table as text without --json', async () => {
    const r = await run(['diagram', 'read', twoPages(tempDir())], { env: env() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Page: One (p1)')
    expect(r.stdout).toContain('a | Start | rounded')
  })

  it('refuses a Visio file (exit 2, unsupported) and a file that is not a diagram', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'plan.vsdx'), 'PK')
    const visio = await run(['diagram', 'read', join(dir, 'plan.vsdx'), '--json'], { env: env() })
    expect(visio.code).toBe(2)
    expect(visio.json().error).toBe('unsupported')
    writeFileSync(join(dir, 'broken.drawio'), '<html/>')
    const broken = await run(['diagram', 'read', join(dir, 'broken.drawio'), '--json'], {
      env: env(),
    })
    expect(broken.code).toBe(2)
    expect(broken.json()).toMatchObject({ error: 'unsupported', detail: { reason: 'no_diagram' } })
  })
})

describe('diagram apply on .drawio', () => {
  it('writes the changed page only: the other page and the mxfile tag stay byte for byte', async () => {
    const file = twoPages(tempDir())
    const before = readFileSync(file, 'utf8')
    const ops = [
      { op: 'add_shape', label: 'Middle', x: 140, y: 160 },
      { op: 'add_edge', source: 'a', target: 's1' },
    ]
    const r = await run(['diagram', 'apply', file, '--ops', JSON.stringify(ops), '--json'], {
      env: env(),
    })
    expect(r.code, r.stdout).toBe(0)
    const out = r.json()
    expect(out.status).toBe('ok')
    expect(out.detail.created).toEqual(['s1', 'e1'])
    expect(out.detail.batch).toEqual({ total: 2, applied: 2, failed: 0, skipped: 0 })
    const after = readFileSync(file, 'utf8')
    expect(diagramElements(after)[1]).toBe(diagramElements(before)[1])
    expect(after.split('\n')[0]).toBe(before.split('\n')[0])
    expect(reopen(file).state.pages[0]!.cells.map((c) => c.id)).toContain('s1')
  })

  it('takes ops from @file, a plain path and stdin-less files the same way', async () => {
    const dir = tempDir()
    const file = twoPages(dir)
    const opsFile = join(dir, 'ops.json')
    writeFileSync(opsFile, JSON.stringify({ ops: [{ op: 'rename_page', page: 'Two', name: 'B' }] }))
    expect(
      (await run(['diagram', 'apply', file, '--ops', `@${opsFile}`], { env: env() })).code,
    ).toBe(0)
    writeFileSync(opsFile, JSON.stringify([{ op: 'rename_page', page: 'B', name: 'C' }]))
    expect((await run(['diagram', 'apply', file, '--ops', opsFile], { env: env() })).code).toBe(0)
    expect(reopen(file).pages.map((p) => p.name)).toEqual(['One', 'C'])
  })

  it('a batch of reads writes nothing and answers the tables', async () => {
    const file = twoPages(tempDir())
    const before = readFileSync(file)
    const r = await run(
      ['diagram', 'apply', file, '--ops', '[{"op":"read","page":"Two"}]', '--json'],
      { env: env() },
    )
    expect(r.code).toBe(0)
    expect(r.json().output_path).toBeUndefined()
    expect(r.json().detail.results[0].read.page.shapes[0].id).toBe('c')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('works on --page when an op names none', async () => {
    const file = twoPages(tempDir())
    const r = await run(
      ['diagram', 'apply', file, '--page', 'Two', '--ops', '[{"op":"delete","ids":["c"]}]'],
      { env: env() },
    )
    expect(r.code).toBe(0)
    expect(reopen(file).state.pages[1]!.cells.map((c) => c.id)).toEqual(['0', '1'])
  })

  it('refuses a bad batch whole: the reason, every failure and the counts; the file is untouched', async () => {
    const file = twoPages(tempDir())
    const before = readFileSync(file)
    const unknown = await run(
      [
        'diagram',
        'apply',
        file,
        '--ops',
        '[{"op":"add_shape","label":"x","x":0,"y":0},{"op":"paint"}]',
        '--json',
      ],
      { env: env() },
    )
    expect(unknown.code).toBe(1)
    expect(unknown.json()).toMatchObject({
      error: 'unknown_op',
      detail: {
        failures: [{ index: 1, op: 'paint', reason: 'unknown_op' }],
        batch: { total: 2, applied: 0, failed: 1, skipped: 1 },
      },
    })
    const missing = await run(
      ['diagram', 'apply', file, '--ops', '[{"op":"update","id":"zz","label":"x"}]', '--json'],
      { env: env() },
    )
    expect(missing.code).toBe(1)
    expect(missing.json().error).toBe('target_not_found')
    const notJson = await run(['diagram', 'apply', file, '--ops', '[oops', '--json'], {
      env: env(),
    })
    expect(notJson.json().error).toBe('invalid_json')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('--best-effort keeps what applies and answers partial; --stop-on-error stops at the first failure', async () => {
    const ops = JSON.stringify([
      { op: 'add_shape', label: 'kept', x: 0, y: 200 },
      { op: 'update', id: 'nope', label: 'x' },
      { op: 'add_shape', label: 'after', x: 200, y: 200 },
    ])
    const best = twoPages(tempDir())
    const r1 = await run(['diagram', 'apply', best, '--ops', ops, '--best-effort', '--json'], {
      env: env(),
    })
    expect(r1.code).toBe(0)
    expect(r1.json()).toMatchObject({
      status: 'partial',
      detail: {
        batch: { total: 3, applied: 2, failed: 1, skipped: 0 },
        failures: [{ index: 1, reason: 'target_not_found' }],
      },
    })
    expect(reopen(best).state.pages[0]!.cells.map((c) => c.id)).toEqual(
      expect.arrayContaining(['s1', 's2']),
    )
    const stop = twoPages(tempDir())
    const r2 = await run(['diagram', 'apply', stop, '--ops', ops, '--stop-on-error', '--json'], {
      env: env(),
    })
    expect(r2.json()).toMatchObject({
      status: 'partial',
      detail: { batch: { total: 3, applied: 1, failed: 1, skipped: 1 } },
    })
    expect(reopen(stop).state.pages[0]!.cells.map((c) => c.id)).not.toContain('s2')
  })

  it('--out onto an existing file needs --force; a file open in the app needs --force', async () => {
    const dir = tempDir()
    const file = twoPages(dir)
    const other = twoPages(dir, 'other.dio')
    const ops = '[{"op":"add_page","name":"Three"}]'
    const refused = await run(['diagram', 'apply', file, '--ops', ops, '--out', other, '--json'], {
      env: env(),
    })
    expect(refused.code).toBe(2)
    expect(refused.json().error).toBe('output_exists')
    const forced = await run(
      ['diagram', 'apply', file, '--ops', ops, '--out', other, '--force', '--json'],
      { env: env() },
    )
    expect(forced.code).toBe(0)
    expect(reopen(other).pages.map((p) => p.name)).toEqual(['One', 'Two', 'Three'])

    const userData = tempDir()
    mkdirSync(userData, { recursive: true })
    writeFileSync(
      join(userData, 'open-documents.json'),
      JSON.stringify({ pid: process.pid, paths: [file] }),
    )
    const open = await run(['diagram', 'apply', file, '--ops', ops, '--json'], {
      env: env({ GENOFFICE_USER_DATA: userData }),
    })
    expect(open.code).toBe(2)
    expect(open.json()).toMatchObject({
      error: 'file_open_in_gui',
      detail: { gui_pid: process.pid },
    })
    const anyway = await run(['diagram', 'apply', file, '--ops', ops, '--force'], {
      env: env({ GENOFFICE_USER_DATA: userData }),
    })
    expect(anyway.code).toBe(0)
  })

  it('writes the diagram of a .drawio.png as a .drawio without the app', async () => {
    const dir = tempDir()
    copyFileSync(join(FIXTURES, 'out.drawio.png'), join(dir, 'pic.drawio.png'))
    const out = join(dir, 'plain.drawio')
    const r = await run(
      [
        'diagram',
        'apply',
        join(dir, 'pic.drawio.png'),
        '--ops',
        '[{"op":"add_page","name":"New"}]',
        '--out',
        out,
        '--json',
      ],
      { env: env() },
    )
    expect(r.code, r.stdout).toBe(0)
    expect(reopen(out).pages.at(-1)!.name).toBe('New')
  })
})

describe('work that needs the app', () => {
  it('answers app_unavailable (exit 4) and writes nothing when no app can be started', async () => {
    const dir = tempDir()
    const file = twoPages(dir)
    const before = readFileSync(file)
    const mermaid = await run(
      [
        'diagram',
        'apply',
        file,
        '--ops',
        '[{"op":"insert_mermaid","text":"graph TD; A-->B"}]',
        '--json',
      ],
      { env: env() },
    )
    expect(mermaid.code).toBe(4)
    expect(mermaid.json().error).toBe('app_unavailable')
    expect(readFileSync(file).equals(before)).toBe(true)

    copyFileSync(join(FIXTURES, 'out.drawio.png'), join(dir, 'pic.drawio.png'))
    const picture = await run(
      [
        'diagram',
        'apply',
        join(dir, 'pic.drawio.png'),
        '--ops',
        '[{"op":"add_page","name":"N"}]',
        '--json',
      ],
      { env: env() },
    )
    expect(picture.code).toBe(4)
    expect(picture.json().error).toBe('app_unavailable')
    // reads write nothing, so they need no app even on a picture format
    const reads = await run(
      ['diagram', 'apply', join(dir, 'pic.drawio.png'), '--ops', '[{"op":"read"}]', '--json'],
      { env: env() },
    )
    expect(reads.code).toBe(0)

    const mmd = join(dir, 'flow.mmd')
    writeFileSync(mmd, 'graph TD; A-->B')
    const created = await run(
      ['create', '--type', 'drawio', '--mermaid', mmd, '--out', join(dir, 'new.drawio'), '--json'],
      { env: env() },
    )
    expect(created.code).toBe(4)
    expect(existsSync(join(dir, 'new.drawio'))).toBe(false)

    const converted = await run(['convert', file, '--to', 'png', '--json'], { env: env() })
    expect(converted.code).toBe(4)
    expect(converted.json().error).toBe('app_unavailable')
  })
})

describe('create --type drawio', () => {
  it('runs the ops on a new uncompressed one-page diagram', async () => {
    const dir = tempDir()
    const out = join(dir, 'new.drawio')
    const ops = [
      { op: 'add_shape', id: 'start', label: 'Start', x: 40, y: 40 },
      { op: 'add_shape', label: 'Next', x: 240, y: 40, shape: 'ellipse' },
      { op: 'add_edge', source: 'start', target: 's1' },
    ]
    const r = await run(
      ['create', '--type', 'drawio', '--ops', JSON.stringify(ops), '--out', out, '--json'],
      { env: env() },
    )
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.created).toEqual(['start', 's1', 'e1'])
    const file = reopen(out)
    expect(file.pages).toEqual([{ id: 'page-1', name: 'Page-1', compressed: false }])
    expect(file.state.pages[0]!.cells.map((c) => c.id)).toEqual(['0', '1', 'start', 's1', 'e1'])
  })

  it('needs --ops or --mermaid; refuses an existing --out without --force', async () => {
    const dir = tempDir()
    const out = join(dir, 'x.drawio')
    const none = await run(['create', '--type', 'drawio', '--out', out, '--json'], { env: env() })
    expect(none.code).toBe(1)
    expect(none.json().error).toBe('missing_argument')
    writeFileSync(out, 'old')
    const exists = await run(
      [
        'create',
        '--type',
        'drawio',
        '--ops',
        '[{"op":"add_page","name":"P"}]',
        '--out',
        out,
        '--json',
      ],
      { env: env() },
    )
    expect(exists.code).toBe(2)
    expect(exists.json().error).toBe('output_exists')
    const bad = await run(
      [
        'create',
        '--type',
        'drawio',
        '--ops',
        '[{"op":"delete","ids":["nope"]}]',
        '--out',
        join(dir, 'y.drawio'),
        '--json',
      ],
      { env: env() },
    )
    expect(bad.code).toBe(1)
    expect(bad.json().error).toBe('target_not_found')
    expect(existsSync(join(dir, 'y.drawio'))).toBe(false)
  })
})

describe('convert of a diagram', () => {
  it('refuses a Visio file, other targets and convert-only options before starting anything', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'plan.vsdx'), 'PK')
    const visio = await run(['convert', join(dir, 'plan.vsdx'), '--to', 'pdf', '--json'], {
      env: env(),
    })
    expect(visio.code).toBe(2)
    expect(visio.json().error).toBe('unsupported')
    const file = twoPages(dir)
    const docx = await run(['convert', file, '--to', 'docx', '--json'], { env: env() })
    expect(docx.code).toBe(1)
    expect(docx.json()).toMatchObject({
      error: 'unsupported',
      detail: { supported: ['pdf', 'png', 'svg'] },
    })
    const page = await run(['convert', file, '--to', 'png', '--page', 'Nine', '--json'], {
      env: env(),
    })
    expect(page.json().error).toBe('target_not_found')
    const md = join(dir, 'a.md')
    writeFileSync(md, '# a')
    const notDiagram = await run(['convert', md, '--to', 'html', '--page', '1', '--json'], {
      env: env(),
    })
    expect(notDiagram.code).toBe(1)
    expect(notDiagram.json().error).toBe('invalid_argument')
  })
})

describe('guide diagram and the MCP tools', () => {
  it('lists every op of DIAGRAM_OPS with its schema', async () => {
    const text = await run(['guide', 'diagram'], { env: env() })
    expect(text.code).toBe(0)
    for (const op of DIAGRAM_OPS) expect(text.stdout).toContain(`  ${op.name} {`)
    const json = await run(['guide', 'diagram', '--json'], { env: env() })
    const { ops } = json.json().detail
    expect(ops.map((e: { op: string }) => e.op)).toEqual(DIAGRAM_OPS.map((op) => op.name))
    for (const [index, op] of DIAGRAM_OPS.entries()) {
      expect(ops[index].schema).toEqual(JSON.parse(JSON.stringify(op.input)))
      expect(ops[index].note).toBe(op.description)
    }
    const one = await run(['guide', 'diagram', 'insert_mermaid'], { env: env() })
    expect(one.stdout).toContain('Needs the app')
  })

  it('diagram_read, diagram_apply and create_drawio mirror the command options', async () => {
    const tools = resolveTools(defaultRegistry())
    const byName = new Map(tools.map((t) => [t.name, t]))
    const read = byName.get('diagram_read')!
    expect(read.readOnly).toBe(true)
    expect(read.params.map((p) => [p.key, p.option, p.kind])).toEqual([['page', 'page', 'string']])
    const apply = byName.get('diagram_apply')!
    expect(apply.params.map((p) => p.key)).toEqual([
      'ops',
      'page',
      'best_effort',
      'stop_on_error',
      'out',
      'force',
    ])
    const create = byName.get('create_drawio')!
    expect(create.fixed).toEqual(['--type', 'drawio'])
    expect(create.params.map((p) => [p.key, p.option])).toEqual([
      ['mermaid', 'mermaid'],
      ['ops', 'ops'],
      ['out', 'out'],
      ['force', 'force'],
    ])
    const convert = byName.get('convert')!
    expect(convert.params.find((p) => p.key === 'page')).toMatchObject({ kind: 'string' })

    const typed = await loadTypedSchemas()
    const variants = (
      typed['diagram-ops'].items as { anyOf: { properties: { op: { enum: string[] } } }[] }
    ).anyOf
    expect(variants.map((v) => v.properties.op.enum[0])).toEqual(DIAGRAM_OPS.map((op) => op.name))
    const shape = toolShape(apply, 'stdio', typed)
    expect(Object.keys(shape)).toEqual([
      'file',
      'ops',
      'page',
      'best_effort',
      'stop_on_error',
      'out',
      'force',
    ])
  })
})
