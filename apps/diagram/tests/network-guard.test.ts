// @vitest-environment node
// Nothing leaves the PC from the diagram tab: which requests the session lets
// through, which windows and navigations it allows, and which links open.
import { describe, expect, it } from 'vitest'
import {
  devServerOrigins,
  isAllowedDiagramRequest,
  isAllowedNavigation,
  newRequestLog,
  REFUSED_ADDRESSES_KEPT,
  screenRequest,
  windowOpenAction,
} from '../src/main/network-guard'
import { openableLink } from '../src/shared/links'

describe('isAllowedDiagramRequest', () => {
  it('lets the app scheme, the draw.io scheme, data: and blob: through', () => {
    for (const url of [
      'genoffice-app://diagram/index.html',
      'drawio-app://editor/js/app.min.js',
      'data:image/png;base64,AAAA',
      'blob:drawio-app://editor/1234',
    ]) {
      expect(isAllowedDiagramRequest(url), url).toBe(true)
    }
  })

  it('refuses everything else', () => {
    for (const url of [
      'https://app.diagrams.net/',
      'http://localhost:5182/index.html',
      'https://fonts.googleapis.com/css?family=Roboto',
      'ws://localhost:5182/',
      'file:///C:/Windows/win.ini',
      'chrome-extension://abc/x.js',
      'devtools://devtools/bundled/x.js',
      'ftp://example.com/x',
      'not a url',
    ]) {
      expect(isAllowedDiagramRequest(url), url).toBe(false)
    }
  })

  it('lets a dev server through only when one is named', () => {
    const dev = ['http://localhost:5182']
    expect(isAllowedDiagramRequest('http://localhost:5182/src/main.tsx', dev)).toBe(true)
    expect(isAllowedDiagramRequest('ws://localhost:5182/', dev)).toBe(true)
    expect(isAllowedDiagramRequest('http://localhost:5183/', dev)).toBe(false)
    expect(isAllowedDiagramRequest('https://example.com/', dev)).toBe(false)
  })
})

describe('devServerOrigins', () => {
  it('takes loopback dev servers in a development run', () => {
    expect(
      devServerOrigins(['http://localhost:5182/', undefined, 'http://127.0.0.1:9/x'], false),
    ).toEqual(['http://localhost:5182', 'http://127.0.0.1:9'])
  })

  it('never lets anything through in a packaged app', () => {
    expect(devServerOrigins(['http://localhost:5182/'], true)).toEqual([])
  })

  it('ignores addresses that are not a loopback web server', () => {
    expect(
      devServerOrigins(
        ['https://example.com/', 'file:///x', 'genoffice-app://diagram/', 'bad'],
        false,
      ),
    ).toEqual([])
  })
})

describe('windows and navigation', () => {
  it('denies every new window', () => {
    expect(windowOpenAction()).toEqual({ action: 'deny' })
  })

  it('keeps the page where it is', () => {
    const currentUrl = 'genoffice-app://diagram/index.html'
    expect(isAllowedNavigation({ url: currentUrl, isMainFrame: true, currentUrl })).toBe(true)
    expect(
      isAllowedNavigation({ url: 'https://example.com/', isMainFrame: true, currentUrl }),
    ).toBe(false)
  })

  it('lets the draw.io frame (re)load only draw.io’s start page', () => {
    const currentUrl = 'genoffice-app://diagram/index.html'
    expect(
      isAllowedNavigation({
        url: 'drawio-app://editor/index.html?embed=1&lang=ko',
        isMainFrame: false,
        currentUrl,
      }),
    ).toBe(true)
    for (const url of [
      'https://app.diagrams.net/',
      'drawio-app://editor/teams.html',
      'drawio-app://other/index.html',
      'about:blank',
    ]) {
      expect(isAllowedNavigation({ url, isMainFrame: false, currentUrl }), url).toBe(false)
    }
  })
})

describe('request log', () => {
  it('counts what went through and keeps refused addresses without their query', () => {
    const log = newRequestLog()
    expect(screenRequest(log, 'drawio-app://editor/index.html', [])).toBe(true)
    expect(screenRequest(log, 'https://example.com/a?secret=1', [])).toBe(false)
    expect(log.allowed).toBe(1)
    expect(log.refused).toBe(1)
    expect([...log.schemes]).toEqual(['drawio-app:'])
    expect(log.blocked).toEqual(['https://example.com/a'])
  })

  it('counts every refusal but keeps only the last addresses', () => {
    const log = newRequestLog()
    const total = REFUSED_ADDRESSES_KEPT + 25
    for (let n = 1; n <= total; n++) {
      expect(screenRequest(log, `https://example.com/${n}?q=${n}`, [])).toBe(false)
    }
    expect(log.refused).toBe(total)
    expect(log.blocked).toHaveLength(REFUSED_ADDRESSES_KEPT)
    expect(log.blocked[0]).toBe('https://example.com/26')
    expect(log.blocked.at(-1)).toBe(`https://example.com/${total}`)
    // a refused request is still refused after the list is full
    expect(screenRequest(log, 'https://example.org/late', [])).toBe(false)
    expect(log.blocked.at(-1)).toBe('https://example.org/late')
  })
})

describe('links a person clicked', () => {
  it('opens web and mail links only', () => {
    expect(openableLink('https://example.com/a')).toBe('https://example.com/a')
    expect(openableLink('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    for (const url of [
      'javascript:alert(1)',
      'file:///C:/x',
      'drawio-app://editor/index.html',
      'genoffice-app://diagram/index.html',
      'data:text/html,x',
      42,
    ]) {
      expect(openableLink(url), String(url)).toBeNull()
    }
  })
})
