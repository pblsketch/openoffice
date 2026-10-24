/**
 * The bytes of a crash-recovery copy: what a save would write at that moment,
 * made without changing the map (its unsaved mark, or what a later save
 * compares with). A copy restored and saved keeps every entry it did not
 * change as the original file's own bytes.
 */
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { openCopiedMap, openMapBytes, newMap } from '../src/renderer/document/open'
import type { DocumentSession } from '../src/renderer/document/session'
import { documentWithEntries, plainSheet, richSheet, TINY_PNG } from './helpers/fixtures'
import { storedEntries } from './helpers/zip-entries'

/** An original file with neighbours the editor never touches: a picture (stored, not deflated) and a cache. */
async function originalFile(): Promise<Uint8Array> {
  const document = await documentWithEntries([richSheet(), plainSheet()], {
    'resources/picture.png': TINY_PNG,
    'cache.json': new TextEncoder().encode('{"kept":true}'),
  })
  // nothing changed: the bytes the document was opened from
  return document.save()
}

async function opened(bytes: Uint8Array): Promise<DocumentSession> {
  const result = await openMapBytes(bytes)
  if (result.status !== 'ok') throw new Error(`the test map does not open: ${result.status}`)
  return result.session
}

const contentText = async (archive: Uint8Array): Promise<string> =>
  (await JSZip.loadAsync(archive)).file('content.json')!.async('string')

/** Every entry but `content.json`, as stored in the file. */
const untouched = (archive: Uint8Array) =>
  storedEntries(archive).filter((entry) => entry.name !== 'content.json')

const names = (archive: Uint8Array) => storedEntries(archive).map((entry) => entry.name)

function rename(session: DocumentSession, title: string): void {
  const key = session.tabs()[1]!.key
  expect(session.renameSheet(key, title).ok).toBe(true)
}

describe('a recovery copy', () => {
  it('holds what a save would write now', async () => {
    const original = await originalFile()
    const copied = await opened(original)
    const saved = await opened(original)
    rename(copied, 'Renamed')
    rename(saved, 'Renamed')

    const copy = await copied.recoveryBytes()
    const save = await saved.produceBytes()
    expect(names(copy)).toEqual(names(save))
    expect(untouched(copy)).toEqual(untouched(save))
    expect(await contentText(copy)).toBe(await contentText(save))
    // and the neighbours are the original file's own bytes
    expect(untouched(copy)).toEqual(untouched(original))
  })

  it('changes nothing about the map: the unsaved mark and an undone edit still saving as the file', async () => {
    const original = await originalFile()
    const session = await opened(original)
    rename(session, 'Renamed')
    expect(session.dirty).toBe(true)
    await session.recoveryBytes()
    expect(session.dirty).toBe(true)
    // the edit taken back: the map is clean again and saves as the very file
    rename(session, 'Plain')
    expect(session.dirty).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
  })

  it('of a map without changes is the file itself', async () => {
    const original = await originalFile()
    const session = await opened(original)
    expect(await session.recoveryBytes()).toEqual(original)
  })

  it('follows the last save: made after a save, it starts from the saved file', async () => {
    const original = await originalFile()
    const session = await opened(original)
    rename(session, 'Saved name')
    const written = await session.produceBytes()
    session.markWritten()
    rename(session, 'After the save')
    const copy = await session.recoveryBytes()
    expect(untouched(copy)).toEqual(untouched(written))
    expect(JSON.parse(await contentText(copy))[1].title).toBe('After the save')
  })

  it('is made from the bytes the map holds already, not from a second copy of them', async () => {
    const original = await originalFile()
    const session = await opened(original)
    // the bytes the map opened from are the baseline itself
    expect(await session.recoveryBytes()).toBe(original)
    rename(session, 'Saved name')
    const written = await session.produceBytes()
    session.markWritten()
    // and so are the bytes a save produced
    expect(await session.recoveryBytes()).toBe(written)
  })

  it('of a new map that was never saved can be made', async () => {
    const session = await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' })
    session.addSheet({ title: 'Sheet 2', rootTitle: 'Central Topic' })
    expect(session.dirty).toBe(true)
    const copy = await session.recoveryBytes()
    expect(JSON.parse(await contentText(copy))).toHaveLength(2)
    expect(session.dirty).toBe(true)
  })
})

describe('a restored copy', () => {
  it('opens with unsaved changes and saves what was there before the crash', async () => {
    const original = await originalFile()
    const before = await opened(original)
    rename(before, 'Renamed')
    const copy = await before.recoveryBytes()

    const restored = await openCopiedMap({ bytes: copy })
    if (restored.status !== 'ok') throw new Error(restored.status)
    expect(restored.session.dirty).toBe(true)
    const saved = await restored.session.produceBytes()

    // what saving before the crash would have written
    const unbroken = await opened(original)
    rename(unbroken, 'Renamed')
    const expected = await unbroken.produceBytes()
    expect(await contentText(saved)).toBe(await contentText(expected))
    // every entry the edit did not touch is the original file's, byte for byte, in its place
    expect(names(saved)).toEqual(names(original))
    expect(untouched(saved)).toEqual(untouched(original))
  })

  it('keeps the original bytes through further edits and saves', async () => {
    const original = await originalFile()
    const before = await opened(original)
    rename(before, 'Renamed')
    const restored = await openCopiedMap({ bytes: await before.recoveryBytes() })
    if (restored.status !== 'ok') throw new Error(restored.status)
    rename(restored.session, 'Renamed again')
    const saved = await restored.session.produceBytes({ thumbnail: null })
    expect(untouched(saved)).toEqual(untouched(original))
    expect(JSON.parse(await contentText(saved))[1].title).toBe('Renamed again')
  })
})
