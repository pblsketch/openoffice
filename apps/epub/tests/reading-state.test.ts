// @vitest-environment node
/**
 * Reading positions per file and the shared view settings live in one small
 * JSON file in the app data folder, never in the book.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_POSITIONS,
  READING_STATE_FILE,
  createReadingState,
  readPositionOf,
  viewPrefsOf,
} from '../src/main/reading-state'

let dir: string
let clock = 0
const make = () =>
  createReadingState({
    dir: () => dir,
    write: async (path, text) => writeFileSync(path, text),
    now: () => ++clock,
  })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-reading-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('reading state', () => {
  it('keeps a position set while the first read of the file is still under way', async () => {
    const book = join(dir, 'a.epub')
    const state = make()
    const [, , after] = await Promise.all([
      state.get(book),
      state.setPosition(book, { spineIndex: 2, blockId: 'b4' }),
      state.get(book),
    ])
    expect(after).toMatchObject({ position: { spineIndex: 2, blockId: 'b4' } })
    expect(await make().get(book)).toMatchObject({ position: { spineIndex: 2, blockId: 'b4' } })
  })

  it('remembers a position per file and survives a restart', async () => {
    const book = join(dir, 'a.epub')
    await make().setPosition(book, { spineIndex: 3, blockId: 'b7' })
    const fresh = make()
    expect(await fresh.get(book)).toMatchObject({ position: { spineIndex: 3, blockId: 'b7' } })
    expect(await fresh.get(join(dir, 'other.epub'))).toMatchObject({ position: null })
    expect(readFileSync(join(dir, READING_STATE_FILE), 'utf8')).toContain('"spineIndex": 3')
  })

  it('shares the view settings across books and clamps them', async () => {
    const state = make()
    expect(await state.setViewPrefs({ fontScale: 9, dark: true })).toEqual({
      fontScale: 3,
      lineHeight: null,
      dark: true,
    })
    expect(await state.setViewPrefs({ lineHeight: 1.6, dark: 'yes' })).toEqual({
      fontScale: 3,
      lineHeight: 1.6,
      dark: true,
    })
    expect((await make().get(null)).viewPrefs).toEqual({
      fontScale: 3,
      lineHeight: 1.6,
      dark: true,
    })
  })

  it('reads a damaged file as empty', async () => {
    writeFileSync(join(dir, READING_STATE_FILE), '{ not json')
    expect(await make().get(join(dir, 'a.epub'))).toEqual({
      position: null,
      viewPrefs: { fontScale: 1, lineHeight: null, dark: false },
    })
  })

  it('moves a position with a renamed file', async () => {
    const state = make()
    await state.setPosition(join(dir, 'a.epub'), { spineIndex: 1, blockId: null })
    await state.movePosition(join(dir, 'a.epub'), join(dir, 'b.epub'))
    expect((await state.get(join(dir, 'b.epub'))).position).toEqual({
      spineIndex: 1,
      blockId: null,
    })
    expect((await state.get(join(dir, 'a.epub'))).position).toBeNull()
  })

  it('forgets the least recently read books past the limit', async () => {
    const state = make()
    for (let i = 0; i <= MAX_POSITIONS; i++) {
      await state.setPosition(join(dir, `${i}.epub`), { spineIndex: 0, blockId: null })
    }
    expect((await state.get(join(dir, '0.epub'))).position).toBeNull()
    expect((await state.get(join(dir, `${MAX_POSITIONS}.epub`))).position).not.toBeNull()
  })
})

describe('input checks', () => {
  it('accepts only well-formed positions', () => {
    expect(readPositionOf({ spineIndex: 2, blockId: 'b1' })).toEqual({
      spineIndex: 2,
      blockId: 'b1',
    })
    expect(readPositionOf({ spineIndex: -1, blockId: null })).toBeNull()
    expect(readPositionOf({ spineIndex: 1, blockId: 5 })).toBeNull()
    expect(readPositionOf('x')).toBeNull()
  })

  it('keeps the base for fields that are missing or bad', () => {
    expect(
      viewPrefsOf({ fontScale: Number.NaN }, { fontScale: 2, lineHeight: 2, dark: false }),
    ).toEqual({
      fontScale: 2,
      lineHeight: 2,
      dark: false,
    })
    expect(
      viewPrefsOf({ lineHeight: null }, { fontScale: 1, lineHeight: 2, dark: false }).lineHeight,
    ).toBeNull()
  })
})
