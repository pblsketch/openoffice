import { describe, expect, it } from 'vitest'
import { drivePickedOf } from '../src/DriveAttachButton'

describe('drivePickedOf', () => {
  it('passes downloaded paths and explains what was left out', () => {
    expect(
      drivePickedOf({ ok: true, paths: ['C:/t/a.pdf', 3], skipped: 2, failed: 1 }, 'en'),
    ).toEqual({
      paths: ['C:/t/a.pdf'],
      notes: [
        'Not attached: 2 (a format that cannot be read, or past 20 files)',
        'Could not get from Drive: 1',
      ],
    })
  })

  it('says why nothing came back, and stays quiet on cancel', () => {
    expect(drivePickedOf({ ok: false, reason: 'not-connected' }, 'ko').notes).toEqual([
      'Google 드라이브 연결이 끊겼습니다',
    ])
    expect(drivePickedOf({ ok: false, reason: 'cancelled' }, 'ko')).toEqual({
      paths: [],
      notes: [],
    })
    expect(drivePickedOf(null, 'en')).toEqual({ paths: [], notes: [] })
  })

  it('says when Drive files are held back from the AI', () => {
    expect(drivePickedOf({ ok: false, reason: 'free-ai' }, 'en').notes[0]).toContain('free AI')
    expect(drivePickedOf({ ok: false, reason: 'training' }, 'en').notes[0]).toContain(
      'model training',
    )
  })
})
