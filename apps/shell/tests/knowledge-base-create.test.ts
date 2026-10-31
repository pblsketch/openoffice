import { describe, expect, it } from 'vitest'
import {
  createKnowledgeDocument,
  KB_CREATE_MAX_CHARS,
  parseKbCreateRequest,
  type KbCreateDeps,
} from '../src/main/knowledge-base'

function makeDeps() {
  const written: Array<[string, string]> = []
  const converted: Array<[string, string]> = []
  const recent: string[] = []
  const deps: KbCreateDeps = {
    dir: () => '/save',
    uniquePath: (dir, name) => `${dir}/${name}`,
    sanitizeBase: (title) => title.replace(/[/:]/g, '_') || 'Untitled',
    writeText: async (path, text) => void written.push([path, text]),
    markdownToDocx: async (md, out) => void converted.push([md, out]),
    recordRecent: (path) => void recent.push(path),
  }
  return { deps, written, converted, recent }
}

describe('parseKbCreateRequest', () => {
  it('accepts md and docx and keeps the title as given', () => {
    expect(parseKbCreateRequest({ title: 'a', format: 'md', content: 'x' })).toEqual({
      title: 'a',
      format: 'md',
      content: 'x',
    })
    expect(parseKbCreateRequest({ format: 'docx', content: 'x' }).title).toBe('')
  })

  it('rejects other formats, blank and oversized content', () => {
    expect(() => parseKbCreateRequest({ format: 'pdf', content: 'x' })).toThrow(/format/)
    expect(() => parseKbCreateRequest({ format: 'md', content: ' \n' })).toThrow(/empty/)
    expect(() =>
      parseKbCreateRequest({ format: 'md', content: 'x'.repeat(KB_CREATE_MAX_CHARS + 1) }),
    ).toThrow(/long/)
    expect(() => parseKbCreateRequest(null)).toThrow(/format/)
  })
})

describe('createKnowledgeDocument', () => {
  it('writes markdown as text into the save folder and records it as recent', async () => {
    const { deps, written, converted, recent } = makeDeps()
    const result = await createKnowledgeDocument(deps, {
      title: 'Q3/notes',
      format: 'md',
      content: '# hi',
    })
    expect(result).toEqual({ path: '/save/Q3_notes.md' })
    expect(written).toEqual([['/save/Q3_notes.md', '# hi']])
    expect(converted).toEqual([])
    expect(recent).toEqual(['/save/Q3_notes.md'])
  })

  it('routes docx through the markdown converter', async () => {
    const { deps, written, converted, recent } = makeDeps()
    await createKnowledgeDocument(deps, { title: 'memo', format: 'docx', content: '# hi' })
    expect(converted).toEqual([['# hi', '/save/memo.docx']])
    expect(written).toEqual([])
    expect(recent).toEqual(['/save/memo.docx'])
  })

  it('does not record a file the converter failed to write', async () => {
    const { deps, recent } = makeDeps()
    deps.markdownToDocx = async () => {
      throw new Error('cli failed')
    }
    await expect(
      createKnowledgeDocument(deps, { title: 'memo', format: 'docx', content: '# hi' }),
    ).rejects.toThrow('cli failed')
    expect(recent).toEqual([])
  })
})

describe('createKnowledgeDocument with a project chosen at home (spec 6)', () => {
  function withProject() {
    const made = makeDeps()
    const placed: Array<[string, string]> = []
    const docx: string[] = []
    made.deps.project = {
      write: async (fileName, bytes) => {
        placed.push([fileName, Buffer.from(bytes).toString('utf8')])
        return `/project/${fileName}`
      },
      docxBytes: async (markdown) => {
        docx.push(markdown)
        return Buffer.from('DOCX')
      },
    }
    return { ...made, placed, docx }
  }

  it('writes markdown through the project write and never into the save folder', async () => {
    const { deps, written, converted, recent, placed } = withProject()
    const result = await createKnowledgeDocument(deps, { title: 'a/b', format: 'md', content: '#' })
    expect(result).toEqual({ path: '/project/a_b.md' })
    expect(placed).toEqual([['a_b.md', '#']])
    expect(written).toEqual([])
    expect(converted).toEqual([])
    expect(recent).toEqual(['/project/a_b.md'])
  })

  it('makes the Word file first and writes its bytes only after that succeeded', async () => {
    const { deps, placed, docx, converted } = withProject()
    await createKnowledgeDocument(deps, { title: 'memo', format: 'docx', content: '# hi' })
    expect(docx).toEqual(['# hi'])
    expect(placed).toEqual([['memo.docx', 'DOCX']])
    expect(converted).toEqual([])
  })

  it('writes nothing when the conversion fails', async () => {
    const { deps, placed, recent } = withProject()
    deps.project!.docxBytes = async () => {
      throw new Error('cli failed')
    }
    await expect(
      createKnowledgeDocument(deps, { title: 'memo', format: 'docx', content: '# hi' }),
    ).rejects.toThrow('cli failed')
    expect(placed).toEqual([])
    expect(recent).toEqual([])
  })
})
