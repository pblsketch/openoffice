import { describe, expect, it } from 'vitest'
import type { DocListItem } from '../src/shared/doc-picker-api'
import { createDocList, type DocListDeps } from '../src/main/doc-picker/doc-list'

/** small caps so the size cases read at a glance */
const MAX = 50
const IMG_MAX = 5

const attachable = {
  ATTACHABLE_EXTS: new Set(['docx', 'pdf', 'txt', 'png', 'jpg']),
  ATTACHABLE_IMAGE_EXTS: new Set(['png', 'jpg']),
  ATTACHABLE_MAX_BYTES: MAX,
  ATTACHABLE_IMAGE_MAX_BYTES: IMG_MAX,
}

function deps(over: Partial<DocListDeps> = {}): DocListDeps {
  return {
    openDocuments: async () => [],
    recent: async () => [],
    stat: async () => ({ sizeBytes: 1 }),
    attachable,
    ...over,
  }
}

async function itemsOf(config: DocListDeps): Promise<DocListItem[]> {
  const got = await createDocList(config)()
  expect(got.ok).toBe(true)
  if (!got.ok) throw new Error('unreachable')
  return got.items
}

describe('createDocList', () => {
  it('returns an empty ok result when there is nothing to show', async () => {
    expect(await createDocList(deps())()).toEqual({ ok: true, items: [] })
  })

  it('puts open documents before recent ones and keeps the order given', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/a.docx', title: 'a.docx', dirty: false },
          { id: 'b', path: 'C:/docs/b.pdf', title: 'b.pdf', dirty: false },
        ],
        recent: async () => [
          { path: 'C:/docs/c.txt', title: 'c.txt', missing: false },
          { path: 'C:/docs/d.docx', title: 'd.docx', missing: false },
        ],
      }),
    )
    expect(items.map((i) => [i.group, i.title])).toEqual([
      ['open', 'a.docx'],
      ['open', 'b.pdf'],
      ['recent', 'c.txt'],
      ['recent', 'd.docx'],
    ])
  })

  it('gives a saved open document the path id with the file folder for display', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/a.docx', title: 'a.docx', dirty: false },
        ],
      }),
    )
    expect(items).toEqual([
      {
        id: 'C:/docs/a.docx',
        title: 'a.docx',
        dir: 'C:/docs',
        state: 'ok',
        group: 'open',
      },
    ])
  })

  it('leaves dir empty for a file with no folder', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [{ id: 'a', path: 'a.docx', title: 'a.docx', dirty: false }],
      }),
    )
    expect(items[0]?.dir).toBe('')
  })

  it('treats an open document with no path as unsaved, whatever its dirty flag', async () => {
    let statCalls = 0
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-7', title: '제목 없는 문서', dirty: true },
          { id: 'tab-8', title: '새 스프레드시트', dirty: false },
        ],
        stat: async () => {
          statCalls += 1
          return { sizeBytes: 1 }
        },
      }),
    )
    expect(items).toEqual([
      { id: 'unsaved:tab-7', title: '제목 없는 문서', dir: '', state: 'unsaved', group: 'open' },
      { id: 'unsaved:tab-8', title: '새 스프레드시트', dir: '', state: 'unsaved', group: 'open' },
    ])
    expect(statCalls).toBe(0)
  })

  it('drops documents whose extension cannot be attached', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/a.exe', title: 'a.exe', dirty: false },
          { id: 'b', path: 'C:/docs/b.docx', title: 'b.docx', dirty: false },
        ],
        recent: async () => [
          { path: 'C:/docs/c.zip', title: 'c.zip', missing: false },
          { path: 'C:/docs/no-extension', title: 'no-extension', missing: false },
        ],
      }),
    )
    expect(items.map((i) => i.title)).toEqual(['b.docx'])
  })

  it('reads the extension without case and without the leading dot', async () => {
    const items = await itemsOf(
      deps({
        recent: async () => [{ path: 'C:/docs/UPPER.PDF', title: 'UPPER.PDF', missing: false }],
      }),
    )
    expect(items.map((i) => i.id)).toEqual(['C:/docs/UPPER.PDF'])
  })

  it('drops documents over the cap, keeping the exact limit, images at their own cap', async () => {
    const sizes: Record<string, number> = {
      'C:/docs/ok.docx': MAX,
      'C:/docs/big.docx': MAX + 1,
      'C:/docs/pic.png': IMG_MAX,
      'C:/docs/huge.png': IMG_MAX + 1,
    }
    const items = await itemsOf(
      deps({
        openDocuments: async () =>
          Object.keys(sizes).map((path, i) => ({
            id: `t${i}`,
            path,
            title: path.slice(path.lastIndexOf('/') + 1),
            dirty: false,
          })),
        stat: async (path) => ({ sizeBytes: sizes[path] ?? 0 }),
      }),
    )
    expect(items.map((i) => i.title)).toEqual(['ok.docx', 'pic.png'])
  })

  it('marks a missing recent file, and one that cannot be stat-ed, as missing', async () => {
    const items = await itemsOf(
      deps({
        recent: async () => [
          { path: 'C:/docs/lost.pdf', title: 'lost.pdf', missing: true },
          { path: 'C:/docs/vanished.txt', title: 'vanished.txt', missing: false },
          { path: 'C:/docs/here.docx', title: 'here.docx', missing: false },
        ],
        stat: async (path) => (path.endsWith('here.docx') ? { sizeBytes: 1 } : null),
      }),
    )
    expect(items.map((i) => [i.title, i.state])).toEqual([
      ['lost.pdf', 'missing'],
      ['vanished.txt', 'missing'],
      ['here.docx', 'ok'],
    ])
  })

  it('marks an open document whose file cannot be stat-ed as missing', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/gone.docx', title: 'gone.docx', dirty: false },
        ],
        stat: async () => null,
      }),
    )
    expect(items).toEqual([
      {
        id: 'C:/docs/gone.docx',
        title: 'gone.docx',
        dir: 'C:/docs',
        state: 'missing',
        group: 'open',
      },
    ])
  })

  it('keeps one item per path, the open one winning over the recent one', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/same.docx', title: 'same.docx', dirty: false },
        ],
        recent: async () => [
          { path: 'C:/docs/same.docx', title: 'same.docx', missing: false },
          { path: 'C:/docs/other.pdf', title: 'other.pdf', missing: false },
        ],
      }),
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'C:/docs/same.docx', group: 'open', state: 'ok' })
    expect(items[1]).toMatchObject({ id: 'C:/docs/other.pdf', group: 'recent' })
  })

  it('collapses a path repeated inside the recent group', async () => {
    const items = await itemsOf(
      deps({
        recent: async () => [
          { path: 'C:/docs/same.docx', title: 'same.docx', missing: false },
          { path: 'C:/docs/same.docx', title: 'same.docx', missing: false },
        ],
      }),
    )
    expect(items).toHaveLength(1)
  })
})
