import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeAiSettings } from '@genoffice/ai-provider/browser'

/**
 * The end-to-end launcher (e2e/helpers.ts) starts every app run with the
 * first-connection notice already acknowledged, so a PC with a signed-in
 * Claude or Codex CLI does not get the notice over Settings or the ask panel.
 * The suite needs a full build to run, so what the seed has to look like is
 * pinned here, on the reader the app really uses.
 */

const helpers = readFileSync(join(__dirname, '../../../e2e/helpers.ts'), 'utf8')
const spec = readFileSync(join(__dirname, '../../../e2e/settings-media-search.spec.ts'), 'utf8')

describe('e2e settings seed', () => {
  it('is read back as "notice seen" by the app', () => {
    const seed = { providers: {}, subscriptionNoticeSeen: true, subscriptionNoticeVersion: 2 }
    expect(normalizeAiSettings(seed).subscriptionNoticeSeen).toBe(true)
    // everything else stays at its default
    expect(normalizeAiSettings(seed)).toEqual({
      ...normalizeAiSettings({}),
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
  })

  it('an old boolean-only file reads as the current notice until the main process migrates it', () => {
    const old = { providers: {}, subscriptionNoticeSeen: true }
    expect(normalizeAiSettings(old)).toMatchObject({
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
  })

  it('needs the providers table: without it the file reads as the defaults', () => {
    expect(normalizeAiSettings({ subscriptionNoticeSeen: true }).subscriptionNoticeSeen).toBe(false)
  })

  it('is what the launcher writes to ai-settings.json, unless a spec opts out', () => {
    expect(helpers).toContain('subscriptionNoticeVersion: 2')
    expect(helpers).toContain("join(userDataDir, 'ai-settings.json')")
    expect(helpers).toContain('options.subscriptionNoticeSeen !== false')
    expect(helpers).toContain('JSON.stringify(AI_SETTINGS_NOTICE_SEEN)')
  })

  it('seeds no setting of the removed star prompt', () => {
    expect(helpers).not.toMatch(/starPrompt/)
    expect(spec).not.toMatch(/starPrompt|star prompt/i)
  })
})
