import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * A sandbox that caps virtual memory (`ulimit -v`) aborts the process the moment
 * any WebAssembly memory is instantiated, because a memory reserves a large
 * virtual address range. The command line's document commands must therefore
 * never reach a parser: not through jsdom's bundled undici (see the
 * withInertHeaders test) and not through this package's own import graph, which
 * reaches undici through the search/read-url commands.
 *
 * The graph is imported only after the spy is in place — a static import of
 * src/cli would evaluate it first and hide the regression.
 */
describe('document commands instantiate no WebAssembly', () => {
  const realCompile = WebAssembly.compile
  const realInstantiate = WebAssembly.instantiate
  let calls: string[] = []

  beforeEach(() => {
    calls = []
    const patched = WebAssembly as unknown as Record<string, unknown>
    patched.compile = (...args: unknown[]) => {
      calls.push('compile')
      return (realCompile as (...a: unknown[]) => unknown)(...args)
    }
    patched.instantiate = (...args: unknown[]) => {
      calls.push('instantiate')
      return (realInstantiate as (...a: unknown[]) => unknown)(...args)
    }
  })

  afterEach(() => {
    const patched = WebAssembly as unknown as Record<string, unknown>
    patched.compile = realCompile
    patched.instantiate = realInstantiate
  })

  async function cli(argv: string[]) {
    const { runCli } = await import('../src/cli')
    const out: string[] = []
    const err: string[] = []
    const code = await runCli(argv, {
      io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) },
    })
    return { code, out, err }
  }

  it('answers --version without loading a parser', async () => {
    const result = await cli(['--version'])
    expect(result.code).toBe(0)
    expect(result.out.join('\n')).toContain('ieumoffice')
    expect(calls).toEqual([])
  })

  it('creates and reads a Word document without loading a parser', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ieumoffice-no-wasm-'))
    const md = join(dir, 'note.md')
    writeFileSync(md, '# Hello\n\n- one\n- two\n')
    const docx = join(dir, 'note.docx')

    const created = await cli(['create', '--type', 'docx', '--from', md, '--out', docx, '--json'])
    expect(created.code).toBe(0)

    const read = await cli(['docs', 'read', docx, '--json'])
    expect(read.code).toBe(0)
    expect(JSON.parse(read.out.join('\n')).detail.blocks).toBe(4)
    expect(calls).toEqual([])
  })

  it('creates, edits and reads a diagram without loading a parser', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ieumoffice-no-wasm-'))
    const file = join(dir, 'flow.drawio')
    const ops = '[{"op":"add_shape","id":"a","label":"A","x":0,"y":0}]'
    const created = await cli(['create', '--type', 'drawio', '--ops', ops, '--out', file, '--json'])
    expect(created.code).toBe(0)
    const applied = await cli(['diagram', 'apply', file, '--ops', '[{"op":"add_page","name":"B"}]'])
    expect(applied.code).toBe(0)
    const read = await cli(['diagram', 'read', file, '--json'])
    expect(read.code).toBe(0)
    expect(JSON.parse(read.out.join('\n')).detail.pages).toHaveLength(2)
    expect(calls).toEqual([])
  })
})
