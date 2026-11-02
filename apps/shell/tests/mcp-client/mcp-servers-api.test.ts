import { describe, expect, it } from 'vitest'
import {
  isNearAddress,
  permissionOf,
  plainHttpReach,
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
  reached: true,
  listedBefore: true,
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
  it('is connected only once the app reached the server in this run (B1)', () => {
    expect(serverStatusOf(idle)).toEqual({ status: 'connected' })
    // tools approved before, not reached yet: ready, it connects on first use
    expect(serverStatusOf({ ...idle, reached: false })).toEqual({ status: 'ready' })
    // never listed: nothing to offer until the connection check
    expect(serverStatusOf({ ...idle, reached: false, listedBefore: false })).toEqual({
      status: 'unchecked',
    })
    // connecting and failing still win
    expect(
      serverStatusOf({ ...idle, reached: false, listedBefore: false, connecting: true }),
    ).toEqual({ status: 'connecting' })
    expect(
      serverStatusOf({ ...idle, reached: false, listedBefore: false, failure: 'http-error' }),
    ).toEqual({ status: 'failed', reason: 'http-error' })
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
      'http-error',
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

describe('plainHttpReach (P1)', () => {
  it('tells this PC and private networks from internet addresses by number', () => {
    expect(plainHttpReach('http://127.0.0.1:8080/mcp')).toBe('near')
    expect(plainHttpReach('http://localhost/mcp')).toBe('near')
    expect(plainHttpReach('http://192.168.0.10/mcp')).toBe('near')
    expect(plainHttpReach('http://10.1.2.3/mcp')).toBe('near')
    expect(plainHttpReach('http://172.20.0.1/mcp')).toBe('near')
    expect(plainHttpReach('http://[::1]:3000/mcp')).toBe('near')
    expect(plainHttpReach('http://[fd00::1]/mcp')).toBe('near')
    expect(plainHttpReach('http://[::ffff:127.0.0.1]/mcp')).toBe('near')
    expect(plainHttpReach('http://203.0.113.5/mcp')).toBe('public')
    expect(plainHttpReach('http://172.32.0.1/mcp')).toBe('public')
    expect(plainHttpReach('http://[2001:db8::1]/mcp')).toBe('public')
    // a name is judged by the main process when it connects
    expect(plainHttpReach('http://nas.corp/mcp')).toBe('name')
    expect(plainHttpReach('https://203.0.113.5/mcp')).toBeNull()
    expect(plainHttpReach('not an address')).toBeNull()
  })

  it('knows which addresses are not reached over the internet (B4)', () => {
    expect(isNearAddress('http://127.0.0.1:9/mcp')).toBe(true)
    expect(isNearAddress('https://localhost/mcp')).toBe(true)
    expect(isNearAddress('https://192.168.1.2/mcp')).toBe(true)
    expect(isNearAddress('http://nas.corp/mcp')).toBe(true)
    expect(isNearAddress('https://law.example.com/mcp')).toBe(false)
    expect(isNearAddress('http://203.0.113.5/mcp')).toBe(false)
  })
})
