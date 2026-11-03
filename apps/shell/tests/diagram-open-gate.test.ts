import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { setUiLang } from '@genoffice/i18n'
import {
  diagramOpenChecking,
  openDiagramChecked,
  type DiagramOpenGateDeps,
} from '../src/main/diagram-open-gate'
import { diagramOpenRefusal, visioOpenRefusal } from '../../diagram/src/main/open-check'
import { tm } from '../../diagram/src/main/i18n-main'

/**
 * Every open path routes a diagram through `openDiagramChecked`
 * (`routeDocumentPath`, see diagram-shell-wiring.test.ts). Here it runs with
 * the editor's real checks: a broken file, a picture without a diagram inside
 * and a `.vsdx` that is no Visio drawing open no tab and show the reason
 * (spec 3.1, 3.5); a good file opens its tab.
 */

const MODEL_FIXTURES = join(__dirname, '../../../packages/drawio-model/tests/fixtures')
const VISIO_FIXTURES = join(__dirname, '../../diagram/tests/fixtures')
/** a 1×1 PNG with no diagram inside */
const PLAIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let dir: string

beforeEach(() => {
  setUiLang('en')
  dir = mkdtempSync(join(tmpdir(), 'genoffice-diagram-gate-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function gate(): DiagramOpenGateDeps & {
  opened: string[]
  warned: { message: string; filePath: string }[]
} {
  const opened: string[] = []
  const warned: { message: string; filePath: string }[] = []
  return {
    opened,
    warned,
    refusal: (path) => diagramOpenRefusal(path, { hasRecoveryCopy: () => false }),
    visioRefusal: (path) => visioOpenRefusal(path),
    open: (path) => opened.push(path),
    warn: (message, filePath) => warned.push({ message, filePath }),
  }
}

function file(name: string, bytes: Uint8Array | string): string {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

describe('a diagram file is checked before it gets a tab', () => {
  it.each([
    ['not XML', 'bad.drawio', 'hello', 'failNotXml'],
    ['an empty file', 'empty.drawio', '', 'failNotXml'],
    [
      'a compressed page that does not unpack',
      'bad.dio',
      '<mxfile><diagram id="p">%%%notbase64%%%</diagram></mxfile>',
      'failDecompress',
    ],
    ['XML that is no diagram', 'other.drawio', '<html><body/></html>', 'failNoDiagram'],
    [
      'an mxfile without pages',
      'empty-pages.drawio',
      '<mxfile host="x"></mxfile>',
      'failNoDiagram',
    ],
    [
      'an SVG without a diagram inside',
      'plain.drawio.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
      'failNoOriginal',
    ],
    ['a PNG without a diagram inside', 'plain.drawio.png', PLAIN_PNG, 'failNoOriginal'],
    ['a PNG that is not a PNG', 'broken.drawio.png', 'not a png', 'failCorruptImage'],
  ] as const)('%s: no tab, the reason', (_what, name, bytes, key) => {
    const g = gate()
    const path = file(name, bytes)
    expect(openDiagramChecked(path, g)).toBe(false)
    expect(g.opened).toEqual([])
    expect(g.warned).toEqual([{ message: tm(key), filePath: path }])
  })

  it('a file that cannot be read: no tab, the reason', () => {
    const g = gate()
    const path = join(dir, 'gone.drawio')
    expect(openDiagramChecked(path, g)).toBe(false)
    expect(g.opened).toEqual([])
    expect(g.warned).toEqual([{ message: tm('failUnreadable'), filePath: path }])
  })

  it.each(['sample.drawio', 'out.drawio', 'out.drawio.svg', 'out.drawio.png'])(
    '%s opens its tab',
    (name) => {
      const g = gate()
      const path = join(dir, name)
      copyFileSync(join(MODEL_FIXTURES, name), path)
      expect(openDiagramChecked(path, g)).toBe(true)
      expect(g.opened).toEqual([path])
      expect(g.warned).toEqual([])
    },
  )

  it('a broken file with a recovery copy still opens, so the editor can offer the copy', () => {
    const path = file('kept.drawio', 'hello')
    const g = gate()
    g.refusal = (p) => diagramOpenRefusal(p, { hasRecoveryCopy: (q) => q === path })
    expect(openDiagramChecked(path, g)).toBe(true)
    expect(g.opened).toEqual([path])
  })
})

describe('a Visio drawing is checked before it gets a tab', () => {
  const refused = () => tm('failImport', { reason: tm('importVisioUnreadable') })

  async function settle(g: ReturnType<typeof gate>, path: string): Promise<void> {
    await vi.waitFor(() => expect(diagramOpenChecking(path)).toBe(false))
    expect(g.opened.length + g.warned.length).toBe(1)
  }

  it('a real drawing opens its tab', async () => {
    const g = gate()
    const path = join(dir, 'Network.vsdx')
    copyFileSync(join(VISIO_FIXTURES, 'visio-shapes.vsdx'), path)
    expect(openDiagramChecked(path, g)).toBe(true)
    await settle(g, path)
    expect(g.opened).toEqual([path])
  })

  it('opening it again while it is checked does not open a second tab', async () => {
    const g = gate()
    const path = join(dir, 'Twice.vsdx')
    copyFileSync(join(VISIO_FIXTURES, 'visio-shapes.vsdx'), path)
    expect(openDiagramChecked(path, g)).toBe(true)
    expect(openDiagramChecked(path, g)).toBe(true)
    await settle(g, path)
    expect(g.opened).toEqual([path])
  })

  it.each([
    ['an empty file', async () => new Uint8Array()],
    ['not a zip', async () => new TextEncoder().encode('PK not really')],
    [
      'a zip without a Visio drawing',
      async () => {
        const zip = new JSZip()
        zip.file('[Content_Types].xml', '<Types/>')
        zip.file('word/document.xml', '<w:document/>')
        return zip.generateAsync({ type: 'uint8array' })
      },
    ],
    [
      'a document part without the Visio content type',
      async () => {
        const zip = new JSZip()
        zip.file('[Content_Types].xml', '<Types/>')
        zip.file('visio/document.xml', '<VisioDocument/>')
        return zip.generateAsync({ type: 'uint8array' })
      },
    ],
  ])('%s: no tab, the reason', async (_what, make) => {
    const g = gate()
    const path = file('broken.vsdx', await make())
    expect(openDiagramChecked(path, g)).toBe(true)
    await settle(g, path)
    expect(g.opened).toEqual([])
    expect(g.warned).toEqual([{ message: refused(), filePath: path }])
  })

  it('a .vsdx that cannot be read: no tab, the reason', async () => {
    const g = gate()
    const path = join(dir, 'gone.vsdx')
    expect(openDiagramChecked(path, g)).toBe(true)
    await settle(g, path)
    expect(g.warned).toEqual([{ message: tm('failUnreadable'), filePath: path }])
  })
})
