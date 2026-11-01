import { describe, expect, it } from 'vitest'
import {
  permissionOf,
  serverStatusOf,
  toolDisplayOf,
  type McpServerStatusFacts,
} from '../../src/shared/mcp-servers-api'

const idle: McpServerStatusFacts = {
  enabled: true,
  commandReviewNeeded: false,
  loginRequired: false,
  failure: null,
  connecting: false,
}

describe('permissionOf', () => {
  it('keeps the three known values and reads anything else as ask', () => {
    expect(permissionOf('always')).toBe('always')
    expect(permissionOf('off')).toBe('off')
    expect(permissionOf('ask')).toBe('ask')
    expect(permissionOf('never')).toBe('ask')
    expect(permissionOf(undefined)).toBe('ask')
    expect(permissionOf(1)).toBe('ask')
  })
})

describe('serverStatusOf', () => {
  it('is connected when nothing else applies', () => {
    expect(serverStatusOf(idle)).toEqual({ status: 'connected' })
  })

  it('follows disabled > command review > login > failed > connecting', () => {
    const all: McpServerStatusFacts = {
      enabled: false,
      commandReviewNeeded: true,
      loginRequired: true,
      failure: 'unreachable',
      connecting: true,
    }
    expect(serverStatusOf(all)).toEqual({ status: 'disabled' })
    expect(serverStatusOf({ ...all, enabled: true })).toEqual({
      status: 'review-required',
      what: 'command',
    })
    expect(serverStatusOf({ ...all, enabled: true, commandReviewNeeded: false })).toEqual({
      status: 'login-required',
    })
    expect(
      serverStatusOf({ ...all, enabled: true, commandReviewNeeded: false, loginRequired: false }),
    ).toEqual({ status: 'failed', reason: 'unreachable' })
    expect(serverStatusOf({ ...idle, connecting: true })).toEqual({ status: 'connecting' })
  })

  it('carries each failure reason', () => {
    for (const reason of [
      'unreachable',
      'runtime-missing',
      'start-failed',
      'refused-redirect',
      'insecure-address',
    ] as const) {
      expect(serverStatusOf({ ...idle, failure: reason })).toEqual({ status: 'failed', reason })
    }
  })
})

describe('toolDisplayOf', () => {
  it('puts an unusable name before a pending change', () => {
    expect(toolDisplayOf({ pending: null }, null)).toEqual({ display: 'ok' })
    expect(toolDisplayOf({ pending: { description: 'x', inputSchema: {} } }, null)).toEqual({
      display: 'review',
    })
    expect(toolDisplayOf({ pending: { description: 'x', inputSchema: {} } }, 'too-long')).toEqual({
      display: 'unusable',
      reason: 'too-long',
    })
  })
})
