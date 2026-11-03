// @vitest-environment node
// `drawio-app://`: only files under the bundle folder, the bridge put first in
// index.html, a strict policy on every page.
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRINT_PAGE_CSP,
  contentTypeOf,
  drawioCsp,
  injectBridge,
  resolveDrawioRequest,
} from '../src/main/drawio-protocol'

const root = resolve('/bundle/drawio')

describe('resolveDrawioRequest', () => {
  it('serves files under the bundle folder', () => {
    expect(resolveDrawioRequest(root, 'drawio-app://editor/js/app.min.js')).toEqual({
      kind: 'file',
      path: join(root, 'js', 'app.min.js'),
      relative: 'js/app.min.js',
    })
    expect(resolveDrawioRequest(root, 'drawio-app://editor/index.html?embed=1')).toMatchObject({
      kind: 'file',
      relative: 'index.html',
    })
  })

  it('never leaves the folder', () => {
    for (const url of [
      'drawio-app://editor/../secret.txt',
      'drawio-app://editor/js/../../secret.txt',
      'drawio-app://editor/%2e%2e/secret.txt',
      'drawio-app://editor/js%2f..%2f..%2fsecret.txt',
      'drawio-app://editor/js%5c..%5c..%5csecret.txt',
      'drawio-app://editor/a%00b',
      'drawio-app://editor/',
    ]) {
      const target = resolveDrawioRequest(root, url)
      // refused, or (URL parsing already folded `..` at the root) a name inside the folder
      if (target.kind === 'file') expect(target.path.startsWith(root + sep), url).toBe(true)
      else expect(target.kind, url).toBe('refused')
    }
    expect(resolveDrawioRequest(root, 'drawio-app://editor/js/../../secret.txt')).toMatchObject({
      kind: 'file',
      path: join(root, 'secret.txt'),
    })
    expect(resolveDrawioRequest(root, 'drawio-app://editor/js%2f..%2f..%2fsecret.txt').kind).toBe(
      'refused',
    )
  })

  it('refuses other hosts and schemes', () => {
    expect(resolveDrawioRequest(root, 'drawio-app://other/index.html').kind).toBe('refused')
    expect(resolveDrawioRequest(root, 'file:///C:/bundle/drawio/index.html').kind).toBe('refused')
    expect(resolveDrawioRequest(root, 'not a url').kind).toBe('refused')
  })

  it('names our bridge and one-time print pages, nothing else under our prefix', () => {
    expect(resolveDrawioRequest(root, 'drawio-app://editor/__ieum/bridge.js')).toEqual({
      kind: 'bridge',
    })
    const token = 'a'.repeat(32)
    expect(resolveDrawioRequest(root, `drawio-app://editor/__ieum/print/${token}`)).toEqual({
      kind: 'print',
      token,
    })
    expect(resolveDrawioRequest(root, 'drawio-app://editor/__ieum/print/xyz').kind).toBe('refused')
    expect(resolveDrawioRequest(root, 'drawio-app://editor/__ieum/other.js').kind).toBe('refused')
  })
})

describe('injectBridge', () => {
  it('puts our script first in <head> and leaves the rest of the page as it is', () => {
    const page =
      '<!DOCTYPE html>\n<html>\n<head>\n<title>x</title><script src="js/bootstrap.js"></script></head><body></body></html>'
    const out = injectBridge(page)
    expect(out.indexOf('__ieum/bridge.js')).toBeLessThan(out.indexOf('js/bootstrap.js'))
    expect(out.replace('\n<script src="/__ieum/bridge.js"></script>', '')).toBe(page)
  })

  it('fails loudly on a page without <head>', () => {
    expect(() => injectBridge('<html><body></body></html>')).toThrow(/head/)
  })
})

describe('drawioCsp', () => {
  const csp = drawioCsp(['genoffice-app:'])
  const directive = (name: string) =>
    csp
      .split('; ')
      .find((part) => part.startsWith(`${name} `))
      ?.slice(name.length + 1)

  it('lets scripts come only from our scheme, without eval', () => {
    expect(directive('script-src')).toBe('drawio-app:')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('connects, loads pictures and fonts only from our scheme, data: and blob:', () => {
    expect(directive('default-src')).toBe("'none'")
    expect(directive('connect-src')).toBe('drawio-app: data: blob:')
    expect(directive('img-src')).toBe('drawio-app: data: blob:')
    expect(directive('font-src')).toBe('drawio-app: data:')
    expect(csp).not.toMatch(/https?:|\*/)
  })

  it('lets only the app frame draw.io', () => {
    expect(directive('frame-ancestors')).toBe('genoffice-app:')
    expect(drawioCsp([])).toContain("frame-ancestors 'none'")
  })

  it('runs no script at all on a print page', () => {
    expect(PRINT_PAGE_CSP).toContain("script-src 'none'")
    expect(PRINT_PAGE_CSP).toContain("connect-src 'none'")
  })
})

describe('contentTypeOf', () => {
  it('names the types draw.io loads', () => {
    expect(contentTypeOf('index.html')).toMatch(/^text\/html/)
    expect(contentTypeOf('js/app.min.js')).toMatch(/^text\/javascript/)
    expect(contentTypeOf('img/a.svg')).toBe('image/svg+xml')
    expect(contentTypeOf('resources/dia_ko.txt')).toMatch(/^text\/plain/)
    expect(contentTypeOf('x.unknown')).toBe('application/octet-stream')
  })
})
