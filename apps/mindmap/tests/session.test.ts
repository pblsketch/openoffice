import { describe, expect, it, vi } from 'vitest'
import {
  openXmind,
  sheetToView,
  type ViewSheet,
  type ViewTopic,
  type XmindDocument,
} from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { newMap, openMapBytes } from '../src/renderer/document/open'
import { deleteSheetAfterConfirm } from '../src/renderer/document/sheet-actions'
import { copyOf, documentOf, IDS, plainSheet, RICH_PRESERVED, richSheet } from './helpers/fixtures'

async function richSession() {
  const document = await documentOf(richSheet(), plainSheet('Second'))
  const original = await document.save()
  const session = new DocumentSession(document)
  const [first, second] = session.tabs()
  return { document, original, session, first: first!, second: second! }
}

const without = (view: ViewSheet, id: string): ViewSheet => {
  const state = copyOf(view)
  const strip = (topic: ViewTopic): void => {
    topic.children = topic.children.filter((child) => child.id !== id)
    topic.children.forEach(strip)
  }
  strip(state.root)
  state.relationships = state.relationships.filter(
    (relationship) => relationship.fromId !== id && relationship.toId !== id,
  )
  return state
}

const retitled = (view: ViewSheet, id: string, title: string): ViewSheet => {
  const state = copyOf(view)
  const visit = (topic: ViewTopic): void => {
    if (topic.id === id) topic.title = title
    topic.children.forEach(visit)
  }
  visit(state.root)
  return state
}

describe('undo restores the source tree, not a rebuilt one', () => {
  it('a deleted topic comes back with its unknown keys and hidden parts, and the save is the original bytes', async () => {
    const { document, original, session, first } = await richSession()
    const before = copyOf(document.sheets[0]!)

    const result = session.apply(first.key, without(session.view(first.key), IDS.a), { step: true })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(JSON.stringify(document.sheets[0])).not.toContain('unknownTopicKey')
    expect(session.dirty).toBe(true)
    expect(session.canUndo(first.key)).toBe(true)

    const view = session.undo(first.key)
    expect(view).toEqual(sheetToView(before, 0))
    // the whole sheet, key for key and in the same order
    expect(JSON.stringify(document.sheets[0])).toBe(JSON.stringify(before))
    expect(document.changed).toBe(false)
    expect(session.dirty).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
  })

  it('an edit that is undone leaves the document unchanged, and redo brings the edit back', async () => {
    const { document, original, session, first } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'Gamma, edited'), {
      step: true,
    })
    expect(document.changed).toBe(true)

    session.undo(first.key)
    expect(document.changed).toBe(false)
    expect(session.canUndo(first.key)).toBe(false)
    expect(session.canRedo(first.key)).toBe(true)
    expect(await document.save()).toEqual(original)

    const again = session.redo(first.key)!
    expect(again.root.children[2]!.title).toBe('Gamma, edited')
    expect(document.changed).toBe(true)
    expect(session.canRedo(first.key)).toBe(false)
  })

  it('a new edit after an undo drops the steps that were undone', async () => {
    const { session, first } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'one'), { step: true })
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'two'), { step: true })
    session.undo(first.key)
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'three'), { step: true })
    expect(session.canRedo(first.key)).toBe(false)
    expect(session.undo(first.key)!.root.children[2]!.title).toBe('one')
  })

  it('what happened without a step (folding) is part of the state an undo returns to', async () => {
    const { session, first } = await richSession()
    const folded = copyOf(session.view(first.key))
    folded.root.children[0]!.folded = true
    session.apply(first.key, folded, { step: false })
    expect(session.canUndo(first.key)).toBe(false)

    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'edited'), { step: true })
    const view = session.undo(first.key)!
    expect(view.root.children[0]!.folded).toBe(true)
    expect(view.root.children[2]!.title).toBe('Gamma')
  })

  it('the history of one sheet does not reach another', async () => {
    const { session, first, second } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'edited'), { step: true })
    expect(session.canUndo(first.key)).toBe(true)
    expect(session.canUndo(second.key)).toBe(false)
    expect(session.undo(second.key)).toBeNull()
  })

  it('an undo does not take back a sheet name given after the step', async () => {
    const { document, session, first } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'edited'), { step: true })
    session.renameSheet(first.key, 'Renamed sheet')
    session.undo(first.key)
    expect(document.sheets[0]!.title).toBe('Renamed sheet')
    expect(session.view(first.key).root.children[2]!.title).toBe('Gamma')
  })

  it('a state that cannot be applied still counts as a step, so the two histories stay in line', async () => {
    const { document, session, first } = await richSession()
    const before = JSON.stringify(document.sheets[0])
    const broken = copyOf(session.view(first.key))
    broken.root.id = 'someone-else'
    const result = session.apply(first.key, broken, { step: true })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(document.sheets[0])).toBe(before)
    expect(session.canUndo(first.key)).toBe(true)
    session.undo(first.key)
    expect(JSON.stringify(document.sheets[0])).toBe(before)
  })
})

describe('putting topics back that were taken out', () => {
  it('reinserts the very source topics under another topic, as one step that undo takes back', async () => {
    const { document, session, first } = await richSession()
    const original = JSON.stringify(document.sheets[0])
    const alpha = session.copyOfTopic(first.key, IDS.a)!
    const lines = session.relationshipRecords(first.key)
    expect(alpha.unknownTopicKey).toEqual({ nested: ['kept', 1, true] })

    session.apply(first.key, without(session.view(first.key), IDS.a), { step: true })
    const afterCut = JSON.stringify(document.sheets[0])
    expect(session.topicIds().has(IDS.callout)).toBe(false)

    const view = session.reinsertTopics(first.key, IDS.c, [alpha], lines)!
    const gamma = document.sheets[0]!.rootTopic.children!.attached![1]!
    expect(gamma.id).toBe(IDS.c)
    // the whole topic: unknown keys, markers, picture, style, both note forms, hidden children
    expect(gamma.children!.attached![0]).toEqual(alpha)
    expect(view.root.children[1]!.children[0]!.id).toBe(IDS.a)
    // the line that ended on a topic of the subtree is back, with its curve
    const shown = (
      document.sheets[0]!.relationships as { id: string; controlPoints?: unknown }[]
    ).find((line) => line.id === IDS.relShown)
    expect(shown?.controlPoints).toBeDefined()

    session.undo(first.key)
    expect(JSON.stringify(document.sheets[0])).toBe(afterCut)
    session.undo(first.key)
    expect(JSON.stringify(document.sheets[0])).toBe(original)
    session.redo(first.key)
    session.redo(first.key)
    expect(document.sheets[0]!.rootTopic.children!.attached![1]!.children!.attached![0]).toEqual(
      alpha,
    )
  })

  it('refuses when an id is in the file already or the target is not a shown topic', async () => {
    const { document, session, first } = await richSession()
    const before = JSON.stringify(document.sheets[0])
    const alpha = session.copyOfTopic(first.key, IDS.a)!
    // Alpha is still in the map: putting a second one in would double every id
    expect(session.reinsertTopics(first.key, IDS.c, [alpha])).toBeNull()
    session.apply(first.key, without(session.view(first.key), IDS.a), { step: true })
    expect(session.reinsertTopics(first.key, IDS.floating, [alpha])).toBeNull()
    expect(session.reinsertTopics(first.key, 'nowhere', [alpha])).toBeNull()
    expect(session.canUndo(first.key)).toBe(true)
    session.undo(first.key)
    expect(JSON.stringify(document.sheets[0])).toBe(before)
  })
})

describe('sheets', () => {
  it('adds a sheet with one central topic and the default theme, renames and deletes', async () => {
    const { document, session, second } = await richSession()
    const added = session.addSheet({ title: 'Third', rootTitle: 'Central topic' })
    expect(session.tabs().map((tab) => tab.title)).toEqual(['First', 'Second', 'Third'])
    expect(added.index).toBe(2)
    expect(session.view(added.key).root).toMatchObject({ title: 'Central topic', children: [] })
    expect(document.sheets[2]!.theme).toBeDefined()

    expect(session.renameSheet(second.key, 'Second, renamed')).toEqual({ ok: true })
    expect(document.sheets[1]!.title).toBe('Second, renamed')

    expect(session.deleteSheet(second.key)).toEqual({ ok: true })
    expect(session.tabs().map((tab) => tab.title)).toEqual(['First', 'Third'])
    // keys are stable: the third sheet is found under its key at its new position
    expect(session.indexOf(added.key)).toBe(1)
    expect(session.indexOf(second.key)).toBe(-1)
  })

  it('a sheet that is added and deleted again leaves a document that saves as the original bytes', async () => {
    const { original, session } = await richSession()
    const added = session.addSheet({ title: 'Temporary', rootTitle: 'Central topic' })
    expect(session.dirty).toBe(true)
    session.deleteSheet(added.key)
    expect(session.dirty).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
  })

  it('the last sheet cannot be deleted', async () => {
    const session = new DocumentSession(await documentOf(plainSheet()))
    const [only] = session.tabs()
    expect(session.deleteSheet(only!.key)).toEqual({ ok: false, problem: 'last-sheet' })
    expect(session.tabs()).toHaveLength(1)
  })

  it('deleting asks first and says which sheet; declining keeps the sheet', async () => {
    const { session, second } = await richSession()
    const decline = vi.fn(async () => false)
    expect(await deleteSheetAfterConfirm(session, second.key, decline)).toBe('cancelled')
    expect(decline).toHaveBeenCalledExactlyOnceWith('Second')
    expect(session.tabs()).toHaveLength(2)

    const accept = vi.fn(async () => true)
    expect(await deleteSheetAfterConfirm(session, second.key, accept)).toBe('deleted')
    expect(session.tabs()).toHaveLength(1)
  })

  it('the last sheet is refused without asking', async () => {
    const session = new DocumentSession(await documentOf(plainSheet()))
    const confirm = vi.fn(async () => true)
    expect(await deleteSheetAfterConfirm(session, session.tabs()[0]!.key, confirm)).toBe(
      'last-sheet',
    )
    expect(confirm).not.toHaveBeenCalled()
    expect(session.tabs()).toHaveLength(1)
  })
})

describe('what the editor does not show', () => {
  it('counts the preserve-only elements of the file and of a deletion', async () => {
    const { session, first, second } = await richSession()
    expect(session.preservedTotal()).toBe(RICH_PRESERVED)
    // Alpha carries the callout, the branch under its summary and the boundary
    expect(session.preservedWith(first.key, [IDS.a])).toBe(3)
    expect(session.preservedWith(first.key, [IDS.b])).toBe(0)
    expect(session.preservedWith(first.key, [IDS.summaryTopic])).toBe(1)
    expect(session.preservedWith(second.key, ['cccccccc-cccc-4ccc-8ccc-ccccccccccc1'])).toBe(0)
  })

  it('does not call a boundary the map draws hidden, but the AI guard still counts it', async () => {
    const { session, first } = await richSession()
    // the boundary around Alpha's branches is drawn: the user sees it
    expect(session.preservedTotal()).toBe(RICH_PRESERVED)
    expect(session.hiddenWith(first.key, [IDS.a])).toBe(2)
    expect(session.preservedWith(first.key, [IDS.a])).toBe(3)
    // every branch it goes around: the boundary and the summary's hidden branch go
    expect(session.hiddenWith(first.key, [IDS.a1, IDS.a2, IDS.a3])).toBe(1)
    expect(session.preservedWith(first.key, [IDS.a1, IDS.a2, IDS.a3])).toBe(2)
  })

  it('still names a boundary the map cannot draw as hidden', async () => {
    const sheet = plainSheet()
    const root = sheet.rootTopic as unknown as Record<string, unknown>
    root.boundaries = [{ id: 'out-of-range', range: '(5,6)' }]
    const session = new DocumentSession(await documentOf(sheet))
    expect(session.preservedTotal()).toBe(1)
  })

  it('knows a sheet whose theme this app did not write', async () => {
    const { session } = await richSession()
    expect(session.hasUnknownTheme()).toBe(true)
    const plain = new DocumentSession(await documentOf(plainSheet()))
    expect(plain.hasUnknownTheme()).toBe(false)
    const fresh = await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central topic' })
    // a new map carries this app's default theme, which is recognised
    expect(fresh.hasUnknownTheme()).toBe(false)
  })

  it('a theme holding nothing but the two map-wide line settings is no theme to tell about', async () => {
    const sheet = plainSheet()
    const properties: Record<string, string> = {
      'line-tapered': 'tapered',
      'multi-line-colors': 'none',
    }
    sheet.theme = { map: { id: 'aaaaaaaa-0000-4000-8000-0000000000ee', properties } }
    expect(new DocumentSession(await documentOf(sheet)).hasUnknownTheme()).toBe(false)
    // with anything else on it, it is a theme this app did not write
    properties['svg:fill'] = '#101010'
    expect(new DocumentSession(await documentOf(sheet)).hasUnknownTheme()).toBe(true)
  })
})

describe('bytes', () => {
  it('a document nobody edited saves as the bytes it was opened from', async () => {
    const { original } = await richSession()
    const opened = await openMapBytes(original)
    if (opened.status !== 'ok') throw new Error('did not open')
    expect(opened.session.dirty).toBe(false)
    expect(await opened.session.produceBytes()).toEqual(original)
    expect(opened.session.dirty).toBe(false)
  })

  it('bytes that were produced but not written keep the map dirty until the write is reported', async () => {
    const { session, first } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'edited'), { step: true })
    const bytes = await session.produceBytes()
    // the engine now compares with these bytes, but the disk does not have them yet
    expect(session.dirty).toBe(true)
    session.markWritten()
    expect(session.dirty).toBe(false)

    const reopened = await openXmind(bytes)
    if (reopened.status !== 'ok') throw new Error('did not open')
    expect(titleOf(reopened.document, IDS.c)).toBe('edited')
    // everything the editor never showed is still in the file
    expect(JSON.stringify(reopened.document.sheets[0])).toContain('unknownTopicKey')
  })

  it('tells its listeners when the map changes', async () => {
    const { session, first } = await richSession()
    const listener = vi.fn()
    const off = session.subscribe(listener)
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'edited'), { step: true })
    expect(listener).toHaveBeenCalled()
    off()
    listener.mockClear()
    session.renameSheet(first.key, 'x')
    expect(listener).not.toHaveBeenCalled()
  })

  it('gives the outline of the map as it stands', async () => {
    const { session, first } = await richSession()
    session.apply(first.key, retitled(session.view(first.key), IDS.c, 'Outline check'), {
      step: true,
    })
    expect(session.outline()).toContain('Outline check')
  })
})

describe('opening', () => {
  it('reports what a file holds that the editor does not show', async () => {
    const { original } = await richSession()
    const opened = await openMapBytes(original)
    expect(opened).toMatchObject({
      status: 'ok',
      notices: { preserved: RICH_PRESERVED, unknownTheme: true },
    })
  })

  it('bytes that are not a map give a status and no session', async () => {
    const opened = await openMapBytes(new TextEncoder().encode('not a zip'))
    expect(opened).toEqual({ status: 'unreadable' })
  })
})

function titleOf(document: XmindDocument, id: string): unknown {
  return sheetToView(document.sheets[0]!, 0).root.children.find((child) => child.id === id)?.title
}
