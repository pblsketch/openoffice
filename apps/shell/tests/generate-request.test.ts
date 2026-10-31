import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setOpenFilesSource } from '@genoffice/electron-utils/unsaved-files'
import { MAX_MATERIALS } from '../src/main/generate/limits'
import { inspectMaterial } from '../src/main/generate/materials'
import {
  availableConversions,
  prepareGenerateRequest,
  validateGenerateRequest,
} from '../src/main/generate/request'

/** 8.1 / 8.4 / 8.6: the one request shape and the checks it goes through */

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-generate-req-'))
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, content = 'some text'): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

describe('validateGenerateRequest', () => {
  const abs = (name: string) => join(tmpdir(), name)

  it('accepts the three AI kinds and nothing else for `ai`', () => {
    for (const kind of ['slides', 'html', 'mindmap']) {
      const r = validateGenerateRequest({ mode: 'ai', kind, materials: [abs('a.md')], text: '' })
      expect(r.ok, kind).toBe(true)
    }
    for (const kind of ['docs', 'markdown', 'mindmap-to-markdown', '', undefined]) {
      const r = validateGenerateRequest({ mode: 'ai', kind, materials: [abs('a.md')], text: '' })
      expect(r, String(kind)).toEqual({ ok: false, error: 'bad-kind' })
    }
  })

  it('accepts the conversion kinds and nothing else for `convert`', () => {
    expect(
      validateGenerateRequest({ mode: 'convert', kind: 'slides', materials: [abs('a.xmind')] }),
    ).toEqual({ ok: false, error: 'bad-kind' })
    expect(
      validateGenerateRequest({
        mode: 'convert',
        kind: 'mindmap-to-markdown',
        materials: [abs('a.xmind')],
      }).ok,
    ).toBe(true)
    expect(
      validateGenerateRequest({
        mode: 'convert',
        kind: 'markdown-to-mindmap',
        materials: [abs('a.md')],
      }).ok,
    ).toBe(true)
  })

  it('rejects an unknown mode', () => {
    expect(
      validateGenerateRequest({ mode: 'auto', kind: 'slides', materials: [abs('a')] }),
    ).toEqual({ ok: false, error: 'bad-mode' })
    expect(validateGenerateRequest(null)).toEqual({ ok: false, error: 'bad-mode' })
  })

  it('rejects an empty material list', () => {
    expect(validateGenerateRequest({ mode: 'ai', kind: 'html', materials: [] })).toEqual({
      ok: false,
      error: 'no-material',
    })
    expect(validateGenerateRequest({ mode: 'ai', kind: 'html' })).toEqual({
      ok: false,
      error: 'no-material',
    })
  })

  it('rejects a path that is not an absolute file path (an untitled document has none)', () => {
    for (const bad of ['', 'Untitled', 'relative/a.md', 42, null]) {
      expect(
        validateGenerateRequest({ mode: 'ai', kind: 'html', materials: [bad] }),
        String(bad),
      ).toEqual({ ok: false, error: 'bad-path' })
    }
  })

  it('rejects more materials than the cap, after folding duplicates', () => {
    const many = Array.from({ length: MAX_MATERIALS + 1 }, (_, i) => abs(`${i}.md`))
    expect(validateGenerateRequest({ mode: 'ai', kind: 'html', materials: many })).toEqual({
      ok: false,
      error: 'too-many',
    })
    const dupes = [...many.slice(0, MAX_MATERIALS), many[0]]
    const ok = validateGenerateRequest({ mode: 'ai', kind: 'html', materials: dupes })
    expect(ok.ok && ok.request.materials.length).toBe(MAX_MATERIALS)
  })

  it('keeps the request text for `ai` and refuses it for `convert`', () => {
    const ai = validateGenerateRequest({
      mode: 'ai',
      kind: 'mindmap',
      materials: [abs('a.md')],
      text: 'focus on chapter 2',
    })
    expect(ai.ok && ai.request.text).toBe('focus on chapter 2')
    expect(
      validateGenerateRequest({
        mode: 'convert',
        kind: 'mindmap-to-slides',
        materials: [abs('a.xmind')],
        text: 'please',
      }),
    ).toEqual({ ok: false, error: 'bad-text' })
  })

  it('allows a conversion only for one material of the matching type (8.6)', () => {
    expect(
      validateGenerateRequest({
        mode: 'convert',
        kind: 'mindmap-to-markdown',
        materials: [abs('a.xmind'), abs('b.xmind')],
      }),
    ).toEqual({ ok: false, error: 'convert-needs-one' })
    expect(
      validateGenerateRequest({
        mode: 'convert',
        kind: 'mindmap-to-markdown',
        materials: [abs('a.md')],
      }),
    ).toEqual({ ok: false, error: 'convert-source-mismatch' })
    expect(availableConversions([abs('a.xmind')])).toEqual([
      'mindmap-to-markdown',
      'mindmap-to-slides',
    ])
    expect(availableConversions([abs('a.md')])).toEqual(['markdown-to-mindmap'])
    expect(availableConversions([abs('a.docx')])).toEqual([])
    expect(availableConversions([abs('a.xmind'), abs('b.md')])).toEqual([])
  })
})

describe('prepareGenerateRequest', () => {
  it('leaves out missing, too large, unsupported and unreadable files with their reasons', async () => {
    const good = write('good.md', '# fine')
    const gone = join(dir, 'gone.docx')
    const odd = write('clip.mp4')
    const broken = write(
      'broken.md',
      '<span class="redact-span" data-redaction="" data-label="x">secret',
    )
    const result = await prepareGenerateRequest({
      mode: 'ai',
      kind: 'slides',
      materials: [good, gone, odd, broken],
      text: '',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.request.materials).toEqual([good])
    expect(Object.fromEntries(result.excluded.map((s) => [s.name, s.problem]))).toEqual({
      'gone.docx': 'missing',
      'clip.mp4': 'unsupported',
      'broken.md': 'unreadable',
    })
  })

  it('leaves out a file over the size cap', async () => {
    const big = write('big.csv')
    const result = await prepareGenerateRequest(
      { mode: 'ai', kind: 'html', materials: [big, write('ok.txt')], text: '' },
      (path) =>
        inspectMaterial(path, {
          stat: async () => ({
            isFile: () => true,
            size: path.endsWith('.csv') ? 60 * 1024 * 1024 : 10,
          }),
        }),
    )
    expect(result.ok && result.excluded.map((s) => s.problem)).toEqual(['too-large'])
  })

  it('refuses when nothing can be read', async () => {
    const result = await prepareGenerateRequest({
      mode: 'ai',
      kind: 'html',
      materials: [join(dir, 'gone.md')],
      text: '',
    })
    expect(result).toMatchObject({ ok: false, error: 'no-readable-material' })
  })

  it('refuses while a material is open with unsaved changes, for `ai` and `convert`', async () => {
    const md = write('outline.md', '# a')
    const xmind = write('map.xmind', 'PK')
    setOpenFilesSource(() => [
      { filePath: md, dirty: true },
      { filePath: xmind, dirty: true },
    ])
    const ai = await prepareGenerateRequest({ mode: 'ai', kind: 'html', materials: [md], text: '' })
    expect(ai).toMatchObject({ ok: false, error: 'unsaved-material' })
    expect(!ai.ok && ai.unsaved?.map((s) => s.name)).toEqual(['outline.md'])
    const convert = await prepareGenerateRequest({
      mode: 'convert',
      kind: 'mindmap-to-markdown',
      materials: [xmind],
      text: '',
    })
    expect(convert).toMatchObject({ ok: false, error: 'unsaved-material' })

    setOpenFilesSource(() => [{ filePath: md, dirty: false }])
    const saved = await prepareGenerateRequest({
      mode: 'ai',
      kind: 'html',
      materials: [md],
      text: '',
    })
    expect(saved.ok).toBe(true)
  })

  it('passes the shape errors through', async () => {
    expect(
      await prepareGenerateRequest({ mode: 'ai', kind: 'docs', materials: [write('a.md')] }),
    ).toEqual({ ok: false, error: 'bad-kind' })
  })
})
