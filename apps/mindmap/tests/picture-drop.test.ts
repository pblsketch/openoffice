/**
 * A picture file dropped from the desktop onto a topic: which files count,
 * how the bytes are told apart, and that the drop goes the way an AI picture
 * goes (a new entry, the reference through the controller, one undo step).
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { XmindTopic } from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { MapController } from '../src/renderer/map/controller'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import type { MapAiHost } from '../src/renderer/ai/map-tools'
import { MAX_PICTURE_BYTES } from '../src/renderer/ai/image-tools'
import {
  dragCarriesPicture,
  dropPicture,
  isPictureFile,
  readDroppedPicture,
  topicAt,
} from '../src/renderer/map/picture-drop'
import { documentOf, IDS, richSheet } from './helpers/fixtures'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0])
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

const fileOf = (bytes: Uint8Array, name: string, type = ''): File =>
  new File([bytes as BlobPart], name, { type })

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
})

async function rig() {
  const session = new DocumentSession(await documentOf(richSheet()))
  const key = session.tabs()[0]!.key
  const el = document.createElement('div')
  document.body.appendChild(el)
  const controller = new MapController({
    el,
    session,
    sheetKey: key,
    strings: mapStrings('en'),
    host: {
      confirmDelete: async () => true,
      openLink: () => {},
      onRequest: () => {},
      onStateChange: () => {},
    },
  })
  mounted.push(controller)
  const host: MapAiHost = {
    session: () => session,
    activeSheetKey: () => key,
    controllerOf: (each) => (each === key ? controller : null),
    showSheet: () => {},
    flush: () => {
      controller.commitEdit()
      controller.flush()
    },
    isUntitled: () => false,
    newSheetNames: (n) => ({ title: `Sheet ${n}`, rootTitle: 'Central Topic' }),
  }
  const topicOf = (id: string): XmindTopic | null => {
    const walk = (topic: XmindTopic): XmindTopic | null => {
      if (topic.id === id) return topic
      for (const child of topic.children?.attached ?? []) {
        const hit = walk(child)
        if (hit) return hit
      }
      return null
    }
    return walk(session.sheet(key).rootTopic)
  }
  return { session, controller, host, el, topicOf }
}

describe('which drops are pictures', () => {
  it('knows a picture by its type or its name, and leaves documents to open', () => {
    expect(isPictureFile({ name: 'photo.PNG', type: '' })).toBe(true)
    expect(isPictureFile({ name: 'scan', type: 'image/jpeg' })).toBe(true)
    expect(isPictureFile({ name: 'shot.webp', type: '' })).toBe(true)
    expect(isPictureFile({ name: 'plan.xmind', type: '' })).toBe(false)
    expect(isPictureFile({ name: 'report.docx', type: 'application/zip' })).toBe(false)
  })

  it('reads a drag over the page by the item types alone', () => {
    const transfer = (types: string[], items: { kind: string; type: string }[]) =>
      ({ types, items }) as unknown as DataTransfer
    expect(dragCarriesPicture(transfer(['Files'], [{ kind: 'file', type: 'image/png' }]))).toBe(
      true,
    )
    expect(dragCarriesPicture(transfer(['Files'], [{ kind: 'file', type: '' }]))).toBe(false)
    expect(
      dragCarriesPicture(transfer(['text/plain'], [{ kind: 'string', type: 'text/plain' }])),
    ).toBe(false)
    expect(dragCarriesPicture(null)).toBe(false)
  })

  it('finds the topic under the pointer, and nothing over the empty map', async () => {
    const r = await rig()
    const topic = r.el.querySelector<HTMLElement>(`[data-nodeid="me${IDS.a1}"]`)!
    expect(topicAt(topic)?.nodeObj.id).toBe(IDS.a1)
    expect(topicAt(topic.firstChild)?.nodeObj.id).toBe(IDS.a1)
    expect(topicAt(r.el.querySelector('.map-container'))).toBeNull()
    expect(topicAt(null)).toBeNull()
  })
})

describe('reading a dropped picture', () => {
  it('tells PNG, JPG and GIF by their first bytes, whatever the name says', async () => {
    expect(await readDroppedPicture(fileOf(PNG, 'a.jpg'))).toEqual({
      ok: true,
      picture: { bytes: PNG, ext: 'png' },
    })
    expect(await readDroppedPicture(fileOf(JPG, 'b.png'))).toMatchObject({
      ok: true,
      picture: { ext: 'jpg' },
    })
    expect(await readDroppedPicture(fileOf(GIF, 'c'))).toMatchObject({
      ok: true,
      picture: { ext: 'gif' },
    })
  })

  it('turns down what the map cannot keep', async () => {
    expect(await readDroppedPicture(fileOf(WEBP, 'd.webp'))).toEqual({
      ok: false,
      reason: 'unsupported',
    })
    expect(await readDroppedPicture(fileOf(new Uint8Array(), 'e.png'))).toEqual({
      ok: false,
      reason: 'unsupported',
    })
    const huge = { size: MAX_PICTURE_BYTES + 1 } as Blob
    expect(await readDroppedPicture(huge)).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('dropping a picture on a topic', () => {
  it('saves the bytes in the map file and puts the reference on the topic as one undo step', async () => {
    const r = await rig()
    const before = new Set(r.session.document.entryNames)
    expect(await dropPicture(r.host, IDS.a1, [fileOf(PNG, 'photo.png', 'image/png')])).toBe('done')
    const entry = r.session.document.entryNames.find((name) => !before.has(name))
    expect(entry).toMatch(/^resources\/[0-9a-f-]+\.png$/)
    expect(r.topicOf(IDS.a1)!.image).toEqual({ src: `xap:${entry}` })
    expect(await r.session.document.readEntry(entry!)).toEqual(PNG)

    expect(r.controller.undo()).toBe(true)
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })

  it('puts a second picture in place of the first', async () => {
    const r = await rig()
    await dropPicture(r.host, IDS.a1, [fileOf(PNG, 'one.png')])
    const first = r.topicOf(IDS.a1)!.image
    expect(await dropPicture(r.host, IDS.a1, [fileOf(GIF, 'two.gif')])).toBe('done')
    const second = r.topicOf(IDS.a1)!.image as { src: string }
    expect(second).not.toEqual(first)
    expect(second.src).toMatch(/\.gif$/)
  })

  it('takes the first of several pictures and says so', async () => {
    const r = await rig()
    const files = [fileOf(JPG, 'a.jpg'), fileOf(PNG, 'b.png')]
    expect(await dropPicture(r.host, IDS.a1, files)).toBe('done-first-only')
    expect((r.topicOf(IDS.a1)!.image as { src: string }).src).toMatch(/\.jpg$/)
  })

  it('leaves the map and the file as they were when the drop cannot land', async () => {
    const r = await rig()
    const entries = [...r.session.document.entryNames]
    const changed = r.session.document.changed
    expect(await dropPicture(r.host, null, [fileOf(PNG, 'a.png')])).toBe('no-topic')
    expect(await dropPicture(r.host, IDS.a1, [fileOf(WEBP, 'a.webp')])).toBe('unsupported')
    expect(await dropPicture(r.host, IDS.a1, [fileOf(PNG, 'plan.xmind')])).toBe('unsupported')
    expect(
      await dropPicture(r.host, '00000000-0000-4000-8000-000000000000', [fileOf(PNG, 'a.png')]),
    ).toBe('failed')
    expect(r.session.document.entryNames).toEqual(entries)
    expect(r.session.document.changed).toBe(changed)
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })
})
