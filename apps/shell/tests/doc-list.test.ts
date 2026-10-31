import { describe, expect, it } from 'vitest'
import type { DocListItem } from '../src/shared/doc-picker-api'
import { createDocList, toMentionItems, type DocListDeps } from '../src/main/doc-picker/doc-list'
import type { DocAsker } from '../src/main/doc-picker/doc-asker'

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

async function itemsOf(config: DocListDeps, asker?: DocAsker): Promise<DocListItem[]> {
  const got = await createDocList(config)(asker)
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

  it('puts the asker project files between open and recent documents, for the @ list only', async () => {
    const config = deps({
      openDocuments: async () => [
        { id: 'a', path: 'C:/p/a.docx', title: 'a.docx', dirty: false },
        { id: 'me', path: 'C:/p/me.docx', title: 'me.docx', dirty: false },
      ],
      recent: async () => [
        { path: 'C:/p/b.pdf', title: 'b.pdf', missing: false },
        { path: 'C:/old/c.txt', title: 'c.txt', missing: false },
      ],
      projectFiles: async (asker) =>
        asker.webContentsId === 7
          ? [
              { path: 'C:/p/b.pdf', title: 'b.pdf' },
              { path: 'C:/p/a.docx', title: 'a.docx' },
              { path: 'C:/p/me.docx', title: 'me.docx' },
              { path: 'C:/p/sheet.xlsx', title: 'sheet.xlsx' },
            ]
          : [],
    })
    const asker: DocAsker = { webContentsId: 7, tabId: 'me', path: 'C:/p/me.docx' }
    const mention = await createDocList(config)(asker, { projectFiles: true })
    expect(mention.ok && mention.items.map((i) => [i.group, i.title])).toEqual([
      ['open', 'a.docx'],
      // an open one stays in its group, the asker's own is left out, other formats too
      ['project', 'b.pdf'],
      ['recent', 'c.txt'],
    ])
    // the attach window keeps today's groups
    const picker = await createDocList(config)(asker)
    expect(picker.ok && picker.items.map((i) => i.group)).toEqual(['open', 'recent', 'recent'])
  })

  it('shows no project group when the project files cannot be listed', async () => {
    const config = deps({
      projectFiles: async () => {
        throw new Error('folder gone')
      },
      recent: async () => [{ path: 'C:/p/b.pdf', title: 'b.pdf', missing: false }],
    })
    const got = await createDocList(config)({ webContentsId: 7 }, { projectFiles: true })
    expect(got.ok && got.items.map((i) => i.group)).toEqual(['recent'])
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

  it('marks a saved open document with unsaved changes as modified', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/a.docx', title: 'a.docx', dirty: true },
          { id: 'b', path: 'C:/docs/b.docx', title: 'b.docx', dirty: false },
        ],
      }),
    )
    expect(items.map((i) => [i.id, i.state])).toEqual([
      ['C:/docs/a.docx', 'modified'],
      ['C:/docs/b.docx', 'ok'],
    ])
  })

  it('marks a path modified when any open copy of it has unsaved changes', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/same.docx', title: 'same.docx', dirty: false },
          { id: 'b', path: 'C:/docs/same.docx', title: 'same.docx', dirty: true },
        ],
      }),
    )
    expect(items).toEqual([
      {
        id: 'C:/docs/same.docx',
        title: 'same.docx',
        dir: 'C:/docs',
        state: 'modified',
        group: 'open',
      },
    ])
  })

  it('keeps a missing saved file missing even when its tab is dirty', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'a', path: 'C:/docs/gone.docx', title: 'gone.docx', dirty: true },
        ],
        stat: async () => null,
      }),
    )
    expect(items[0]?.state).toBe('missing')
  })

  it('puts the other split pane first, then the other open documents, then recent ones', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-1', path: 'C:/docs/me.docx', title: 'me.docx', dirty: false },
          { id: 'tab-2', path: 'C:/docs/other.docx', title: 'other.docx', dirty: false },
          { id: 'tab-3', path: 'C:/docs/pane.pdf', title: 'pane.pdf', dirty: false },
        ],
        recent: async () => [{ path: 'C:/docs/old.txt', title: 'old.txt', missing: false }],
      }),
      { tabId: 'tab-1', path: 'C:/docs/me.docx', paneTabId: 'tab-3' },
    )
    expect(items.map((i) => [i.group, i.title])).toEqual([
      ['pane', 'pane.pdf'],
      ['open', 'other.docx'],
      ['recent', 'old.txt'],
    ])
  })

  it('shows a never-saved document in the other pane as an unsaved pane row', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-1', path: 'C:/docs/me.docx', title: 'me.docx', dirty: false },
          { id: 'tab-2', title: '제목 없는 문서', dirty: true },
        ],
      }),
      { tabId: 'tab-1', path: 'C:/docs/me.docx', paneTabId: 'tab-2' },
    )
    expect(items).toEqual([
      { id: 'unsaved:tab-2', title: '제목 없는 문서', dir: '', state: 'unsaved', group: 'pane' },
    ])
  })

  it('leaves out the asking tab and every copy of its file, open or recent', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-1', path: 'C:/Docs/Plan.docx', title: 'Plan.docx', dirty: false },
          // the same file shown in the other pane, its path written in another case
          { id: 'tab-2', path: 'C:/docs/plan.docx', title: 'plan.docx', dirty: false },
          { id: 'tab-3', path: 'C:/docs/b.pdf', title: 'b.pdf', dirty: false },
        ],
        recent: async () => [
          { path: 'C:/docs/PLAN.docx', title: 'PLAN.docx', missing: false },
          { path: 'C:/docs/./c.txt', title: 'c.txt', missing: false },
          { path: 'C:/docs/sub/../c.txt', title: 'c.txt', missing: false },
        ],
      }),
      { tabId: 'tab-1', path: 'C:/Docs/Plan.docx', paneTabId: 'tab-2' },
    )
    expect(items.map((i) => [i.group, i.title])).toEqual([
      ['open', 'b.pdf'],
      ['recent', 'c.txt'],
    ])
  })

  it('leaves out a never-saved asking tab by its tab id', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-7', title: '제목 없는 문서', dirty: false },
          { id: 'tab-8', title: '새 스프레드시트', dirty: false },
        ],
      }),
      { tabId: 'tab-7' },
    )
    expect(items.map((i) => i.id)).toEqual(['unsaved:tab-8'])
  })

  it('leaves out a detached asker (no pane) and keeps every other document', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-1', path: 'C:/docs/a.docx', title: 'a.docx', dirty: false },
          { id: 'detached:9', path: 'C:/docs/d.docx', title: 'd.docx', dirty: false },
        ],
      }),
      { tabId: 'detached:9', path: 'C:/docs/d.docx' },
    )
    expect(items.map((i) => [i.group, i.title])).toEqual([['open', 'a.docx']])
  })

  it('excludes nothing when the asker is unknown', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-1', path: 'C:/docs/a.docx', title: 'a.docx', dirty: false },
          { id: 'tab-2', title: '새 문서', dirty: false },
        ],
      }),
      {},
    )
    expect(items.map((i) => i.id)).toEqual(['C:/docs/a.docx', 'unsaved:tab-2'])
  })

  it('keeps one row per path ignoring case, the earlier group winning', async () => {
    const items = await itemsOf(
      deps({
        openDocuments: async () => [
          { id: 'tab-2', path: 'C:/docs/A.docx', title: 'A.docx', dirty: false },
          { id: 'tab-3', path: 'C:/docs/a.docx', title: 'a.docx', dirty: false },
        ],
        recent: async () => [{ path: 'C:/DOCS/a.DOCX', title: 'a.DOCX', missing: false }],
      }),
      { paneTabId: 'tab-3' },
    )
    expect(items).toEqual([
      { id: 'C:/docs/a.docx', title: 'a.docx', dir: 'C:/docs', state: 'ok', group: 'pane' },
    ])
  })
})

describe('toMentionItems', () => {
  it('turns the list into @ rows: file names, null path for never-saved, missing ones gone', () => {
    const items: DocListItem[] = [
      { id: 'C:/docs/pane.pdf', title: 'pane.pdf', dir: 'C:/docs', state: 'ok', group: 'pane' },
      {
        id: 'C:/docs/plan.docx',
        title: 'Plan (tab title)',
        dir: 'C:/docs',
        state: 'modified',
        group: 'open',
      },
      { id: 'unsaved:tab-4', title: '제목 없는 문서', dir: '', state: 'unsaved', group: 'open' },
      {
        id: 'C:/docs/gone.txt',
        title: 'gone.txt',
        dir: 'C:/docs',
        state: 'missing',
        group: 'recent',
      },
      { id: 'C:/docs/old.txt', title: 'old.txt', dir: 'C:/docs', state: 'ok', group: 'recent' },
    ]
    expect(toMentionItems(items)).toEqual([
      { path: 'C:/docs/pane.pdf', name: 'pane.pdf', dir: 'C:/docs', group: 'pane', state: 'ok' },
      {
        path: 'C:/docs/plan.docx',
        name: 'plan.docx',
        dir: 'C:/docs',
        group: 'open',
        state: 'modified',
      },
      { path: null, name: '제목 없는 문서', dir: '', group: 'open', state: 'unsaved' },
      { path: 'C:/docs/old.txt', name: 'old.txt', dir: 'C:/docs', group: 'recent', state: 'ok' },
    ])
  })
})
