import { describe, expect, it } from 'vitest'
import {
  checkResolvedServerAddress,
  checkServerAddress,
  plainHttpAllowedIp,
} from '../../src/main/mcp-client/address'

describe('checkServerAddress', () => {
  it('passes https anywhere without a warning', () => {
    expect(checkServerAddress('https://law.example.com/mcp')).toEqual({
      ok: true,
      plain: false,
      mustResolve: false,
    })
    expect(checkServerAddress('https://8.8.8.8/mcp')).toMatchObject({ ok: true, plain: false })
  })

  it('passes http to this PC and private ranges with a warning', () => {
    for (const url of [
      'http://127.0.0.1:3000/mcp',
      'http://127.9.9.9/',
      'http://localhost:8080/mcp',
      'http://[::1]:3000/',
      'http://10.1.2.3/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://192.168.0.10/mcp',
      'http://[fc00::1]/',
      'http://[fd12:3456::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:192.168.1.1]/',
    ]) {
      expect(checkServerAddress(url), url).toEqual({ ok: true, plain: true, mustResolve: false })
    }
  })

  it('refuses http to public addresses', () => {
    for (const url of [
      'http://8.8.8.8/',
      'http://172.32.0.1/',
      'http://172.15.255.255/',
      'http://192.169.0.1/',
      'http://11.0.0.1/',
      'http://0.0.0.0/',
      'http://[2001:4860:4860::8888]/',
      'http://[::ffff:8.8.8.8]/',
    ]) {
      expect(checkServerAddress(url), url).toEqual({ ok: false, problem: 'public-http' })
    }
  })

  it('refuses other schemes and broken addresses', () => {
    expect(checkServerAddress('ftp://example.com/')).toEqual({ ok: false, problem: 'scheme' })
    expect(checkServerAddress('file:///C:/x')).toEqual({ ok: false, problem: 'scheme' })
    expect(checkServerAddress('not a url')).toEqual({ ok: false, problem: 'invalid' })
    expect(checkServerAddress('')).toEqual({ ok: false, problem: 'invalid' })
  })

  it('leaves an http host name to the resolved check', () => {
    expect(checkServerAddress('http://nas.local:8080/mcp')).toEqual({
      ok: true,
      plain: true,
      mustResolve: true,
    })
  })
})

describe('plainHttpAllowedIp', () => {
  it('knows the loopback and private ranges', () => {
    expect(plainHttpAllowedIp('127.0.0.1')).toBe(true)
    expect(plainHttpAllowedIp('::1')).toBe(true)
    expect(plainHttpAllowedIp('fe80::abcd')).toBe(true)
    expect(plainHttpAllowedIp('203.0.113.5')).toBe(false)
    expect(plainHttpAllowedIp('nonsense')).toBe(false)
  })
})

describe('checkResolvedServerAddress', () => {
  const resolver = (table: Record<string, string[]>) => async (host: string) => {
    const found = table[host]
    if (!found) throw new Error('ENOTFOUND')
    return found
  }

  it('refuses a private-looking name that resolves to a public address', async () => {
    const resolve = resolver({ 'nas.local': ['93.184.216.34'] })
    expect(await checkResolvedServerAddress('http://nas.local/mcp', resolve)).toEqual({
      ok: false,
      problem: 'public-http',
    })
  })

  it('refuses when any resolved address is public', async () => {
    const resolve = resolver({ 'mixed.lan': ['192.168.0.2', '8.8.4.4'] })
    expect(await checkResolvedServerAddress('http://mixed.lan/', resolve)).toEqual({
      ok: false,
      problem: 'public-http',
    })
  })

  it('accepts a name that resolves only to private addresses', async () => {
    const resolve = resolver({ 'nas.local': ['192.168.0.20', 'fe80::1'] })
    expect(await checkResolvedServerAddress('http://nas.local/', resolve)).toEqual({
      ok: true,
      plain: true,
      mustResolve: false,
    })
  })

  it('re-checks localhost by what it resolves to', async () => {
    const resolve = resolver({ localhost: ['203.0.113.9'] })
    expect(await checkResolvedServerAddress('http://localhost:3000/', resolve)).toEqual({
      ok: false,
      problem: 'public-http',
    })
  })

  it('refuses a name that does not resolve', async () => {
    expect(await checkResolvedServerAddress('http://gone.lan/', resolver({}))).toEqual({
      ok: false,
      problem: 'unresolved',
    })
  })

  it('does not resolve https or literal addresses', async () => {
    const resolve = async () => {
      throw new Error('must not be called')
    }
    expect(await checkResolvedServerAddress('https://example.com/', resolve)).toMatchObject({
      ok: true,
      plain: false,
    })
    expect(await checkResolvedServerAddress('http://10.0.0.5/', resolve)).toMatchObject({
      ok: true,
      plain: true,
    })
  })
})
