/**
 * Pictures of the body against the real rhwp engine: the AI panel lists them and hands
 * one to the picture reader by the number it listed. The fixture is a Hangul-saved HWPX
 * with a square-wrapped picture in the body (tests/fixtures/square-picture-after-page-reset.hwpx).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const PICTURE_DOC = new Uint8Array(
  readFileSync(join(__dirname, 'fixtures', 'square-picture-after-page-reset.hwpx')),
)

function open(bytes: Uint8Array) {
  const doc = new HwpDocument(bytes)
  const listeners: (() => void)[] = []
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) =>
      fn({ doc: () => doc, deferPagination: () => {} } as never),
    events: { on: (_name: string, handler: () => void) => listeners.push(handler) },
    automation: { execute: () => null },
  } as unknown as AgentPluginHost
  return agentPlugin.activate(host)
}

describe('pictures of the body', () => {
  it('lists the picture with its type, page and the text beside it', () => {
    const plugin = open(PICTURE_DOC)
    const list = plugin.listPictures()
    expect(list.count).toBe(1)
    expect(list.limited).toBe(false)
    expect(list.pictures[0]).toMatchObject({
      picture: 1,
      type: 'image/png',
      page: 1,
      table: null,
    })
    expect(typeof list.pictures[0]!.near).toBe('string')
  })

  it('hands the picture over as base64 a picture reader can take', () => {
    const plugin = open(PICTURE_DOC)
    const read = plugin.readPicture(1)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.mime).toBe('image/png')
    // the PNG signature, in base64
    expect(read.base64.startsWith('iVBORw0KGgo')).toBe(true)
    expect(read.base64.length).toBeGreaterThan(1000)
  })

  it('refuses a number that is not in the list', () => {
    const plugin = open(PICTURE_DOC)
    expect(plugin.readPicture(99)).toEqual({ ok: false, reason: 'no_such_picture', count: 1 })
    expect(() => plugin.readPicture(0)).toThrow()
  })

  it('says a document without pictures has none', () => {
    const empty = HwpDocument.createEmpty()
    empty.createBlankDocument()
    expect(open(empty.exportHwp()).listPictures()).toEqual({
      count: 0,
      limited: false,
      pictures: [],
    })
  })
})
