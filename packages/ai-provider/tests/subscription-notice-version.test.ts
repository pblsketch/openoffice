import { describe, expect, it } from 'vitest'
import { normalizeAiSettings } from '../src/legacy-settings'
import {
  AI_SUBSCRIPTION_NOTICE_VERSION,
  LEGACY_NOTICE_VERSION_FOR_MIGRATION,
  subscriptionNoticeVersionOf,
  withMigratedSubscriptionNoticeVersion,
} from '../src/providers'

describe('first-connection notice versions', () => {
  it('an old file is migrated to version 1, so the added PDF sentence shows once', () => {
    expect(
      withMigratedSubscriptionNoticeVersion({ providers: {}, subscriptionNoticeSeen: true }),
    ).toMatchObject({
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: LEGACY_NOTICE_VERSION_FOR_MIGRATION,
    })
  })

  it('leaves a file that already carries a version alone', () => {
    for (const version of [0, 1, AI_SUBSCRIPTION_NOTICE_VERSION]) {
      expect(
        withMigratedSubscriptionNoticeVersion({
          subscriptionNoticeSeen: true,
          subscriptionNoticeVersion: version,
        }),
      ).toBeNull()
    }
    expect(withMigratedSubscriptionNoticeVersion(null)).toBeNull()
    expect(withMigratedSubscriptionNoticeVersion({ subscriptionNoticeSeen: false })).toBeNull()
  })

  it('normalization treats a boolean-only file as the current wording, as callers did before versions', () => {
    const seen = normalizeAiSettings({ providers: {}, subscriptionNoticeSeen: true })
    expect(seen.subscriptionNoticeVersion).toBe(AI_SUBSCRIPTION_NOTICE_VERSION)
    expect(normalizeAiSettings({ providers: {} }).subscriptionNoticeVersion).toBe(0)
    expect(normalizeAiSettings({ providers: {} }).pdfSendNoticeSeen).toBe(0)
    expect(subscriptionNoticeVersionOf(1, true)).toBe(1)
    expect(subscriptionNoticeVersionOf(99, true)).toBe(AI_SUBSCRIPTION_NOTICE_VERSION)
  })
})
