import { describe, expect, it } from 'vitest'
import { subscriptionConnectHelpUrl } from '../src/browser'

describe('subscriptionConnectHelpUrl', () => {
  it('opens the section of each path the connect guide offers', () => {
    expect(subscriptionConnectHelpUrl('claude-code')).toBe('https://ieumoffice.com/connect#claude')
    expect(subscriptionConnectHelpUrl('codex')).toBe('https://ieumoffice.com/connect#codex')
    expect(subscriptionConnectHelpUrl('free')).toBe('https://ieumoffice.com/connect#free')
  })

  it('opens the top of the page for anything else a renderer sends', () => {
    for (const path of [null, undefined, '', 'toString', '#evil', 'https://example.com', 42]) {
      expect(subscriptionConnectHelpUrl(path)).toBe('https://ieumoffice.com/connect')
    }
  })
})
