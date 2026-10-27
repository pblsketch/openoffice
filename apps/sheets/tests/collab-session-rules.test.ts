import { describe, expect, it } from 'vitest'

import {
  AI_RUN,
  OPEN_WORKBOOK,
  commandVerdict,
  isUnsharedCommand,
  isUnsharedUniverCommand,
  pendingForClose,
  saveVerdict,
} from '../src/renderer/collab/session-rules'

describe('commandVerdict', () => {
  it('lets everything through outside a session', () => {
    expect(commandVerdict('insert-chart:bar', null, false)).toBeNull()
    expect(commandVerdict(OPEN_WORKBOOK, null, false)).toBeNull()
  })

  it('lets shared edits through for everyone', () => {
    for (const command of [
      'bold',
      'merge:all',
      'insert-row-here',
      'sort',
      'freeze-here',
      'font-size:12',
    ]) {
      expect(commandVerdict(command, 'guest', true)).toBeNull()
      expect(commandVerdict(command, 'host', true)).toBeNull()
    }
  })

  it('refuses a guest what the op stream does not carry', () => {
    for (const command of [
      'insert-chart:column',
      'table-create-open',
      'pivot-open',
      'link-set:https://example.com',
      'page-layout:orientation:landscape',
      'comment-new',
      'sheet-protect',
      'outline-group:rows',
      AI_RUN,
    ]) {
      expect(commandVerdict(command, 'guest', true)).toEqual({ refuse: 'guestBlocked' })
    }
  })

  it('refuses the host only while someone else is in; alone it starts later guests over', () => {
    expect(commandVerdict('insert-picture', 'host', true)).toEqual({ refuse: 'hostBlocked' })
    expect(commandVerdict('insert-picture', 'host', false)).toEqual({ rebase: true })
    expect(commandVerdict(AI_RUN, 'host', false)).toEqual({ rebase: true })
  })

  it('never opens another workbook over a shared one', () => {
    expect(commandVerdict(OPEN_WORKBOOK, 'guest', false)).toEqual({ refuse: 'guestBlocked' })
    expect(commandVerdict(OPEN_WORKBOOK, 'host', false)).toEqual({ refuse: 'hostBlocked' })
  })

  it('knows the unshared families by prefix', () => {
    expect(isUnsharedCommand('chart-legend:right')).toBe(true)
    expect(isUnsharedCommand('visual:size')).toBe(true)
    expect(isUnsharedCommand('format-as-table:medium2')).toBe(true)
    expect(isUnsharedCommand('cell-style:good')).toBe(false)
    expect(isUnsharedCommand('note-open')).toBe(false)
  })

  it('refuses copying a sheet (its copy journals as a blank sheet elsewhere)', () => {
    expect(isUnsharedUniverCommand('sheet.command.copy-sheet')).toBe(true)
    expect(isUnsharedUniverCommand('sheet.command.insert-sheet')).toBe(false)
  })
})

describe('saveVerdict', () => {
  it('a live guest never saves, and says so only when the person asked', () => {
    expect(saveVerdict('save', false, 'guest', true)).toBe('refuse')
    expect(saveVerdict('save-as', false, 'guest', true)).toBe('refuse')
    expect(saveVerdict('save', true, 'guest', true)).toBe('skip')
    expect(saveVerdict('recovery', false, 'guest', true)).toBe('skip')
    // a skill template's copy writes nothing of the person's
    expect(saveVerdict('template', false, 'guest', true)).toBe('run')
  })

  it('the host saves by hand, but AutoSave waits while others are in', () => {
    expect(saveVerdict('save', false, 'host', true)).toBe('run')
    expect(saveVerdict('save', true, 'host', true)).toBe('skip')
    expect(saveVerdict('save', true, 'host', false)).toBe('run')
    expect(saveVerdict('recovery', false, 'host', true)).toBe('run')
    expect(saveVerdict('save', true, null, false)).toBe('run')
  })
})

describe('pendingForClose', () => {
  it('a live guest has nothing to save; its copy afterwards always counts as unsaved', () => {
    expect(pendingForClose(7, 'live')).toBe(0)
    expect(pendingForClose(0, 'ended')).toBe(1)
    expect(pendingForClose(4, 'ended')).toBe(4)
    expect(pendingForClose(3, null)).toBe(3)
  })
})
