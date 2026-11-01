/**
 * A link's preview put on its topic (decision 0099): which addresses offer
 * one, when the page's title replaces the topic's, which pictures are kept as
 * they came and which are drawn into a PNG, and that picture and title land as
 * one step of the undo history while a preview that cannot be had changes
 * nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { XmindTopic } from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { MapController } from '../src/renderer/map/controller'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import type { MapAiHost } from '../src/renderer/ai/map-tools'
import {
  applyLinkPreview,
  previewableLink,
  previewPicture,
  previewTitle,
} from '../src/renderer/map/link-preview'
import type { LinkPreviewResult } from '../src/shared/ipc'
import { documentOf, IDS, richSheet } from './helpers/fixtures'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9])
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

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
  return { session, controller, host, topicOf }
}

const reading = (result: LinkPreviewResult) => vi.fn(async () => result)

describe('which links offer a preview', () => {
  it('is a web address written out in full', () => {
    expect(previewableLink('https://example.com/a')).toBe(true)
    expect(previewableLink(' http://example.com ')).toBe(true)
    expect(previewableLink('mailto:a@b.c')).toBe(false)
    expect(previewableLink('example.com')).toBe(false)
    expect(previewableLink('https://exa mple.com')).toBe(false)
  })
})

describe('the title a topic takes from the page', () => {
  const take = (current: string, page: string | null) =>
    previewTitle(current, page, 'https://example.com/post/', 'New topic')

  it('replaces only a title the person has not written', () => {
    expect(take('', 'Post')).toBe('Post')
    expect(take('New topic', 'Post')).toBe('Post')
    expect(take('https://example.com/post/', 'Post')).toBe('Post')
    expect(take('example.com/post', 'Post')).toBe('Post')
    expect(take('My reading list', 'Post')).toBeNull()
    expect(take('', null)).toBeNull()
  })
})

describe('the picture the map keeps', () => {
  it('keeps PNG, JPG and GIF as they came', async () => {
    const toPng = vi.fn()
    expect(await previewPicture(base64(PNG), toPng)).toEqual({ bytes: PNG, ext: 'png' })
    expect(toPng).not.toHaveBeenCalled()
  })

  it('draws other pictures into a PNG, and takes nothing that is no picture', async () => {
    const toPng = vi.fn(async () => PNG)
    expect(await previewPicture(base64(WEBP), toPng)).toEqual({ bytes: PNG, ext: 'png' })
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(await previewPicture(base64(svg), toPng)).toBeNull()
    expect(await previewPicture('', toPng)).toBeNull()
    expect(await previewPicture('%%%', toPng)).toBeNull()
    expect(toPng).toHaveBeenCalledTimes(1)
    expect(await previewPicture(base64(WEBP), async () => null)).toBeNull()
  })
})

describe('putting a preview on a topic', () => {
  it('puts the picture and the title on the topic as one step that undoes back to the original', async () => {
    const r = await rig()
    r.controller.setLink(IDS.a1, 'https://example.com/post')
    await settle()
    const read = reading({
      ok: true,
      title: 'A post',
      picture: { base64: base64(PNG), mime: 'image/png' },
    })

    // the topic has a title of its own: it stays
    expect(
      await applyLinkPreview(r.host, IDS.a1, 'https://example.com/post', {
        read,
        newTopicName: 'New topic',
      }),
    ).toBe('done')
    expect(read).toHaveBeenCalledWith('https://example.com/post')
    const topic = r.topicOf(IDS.a1)!
    expect(topic.title).toBe('Alpha one')
    expect((topic.image as { src: string }).src).toMatch(/^xap:resources\/[0-9a-f-]+\.png$/)
    const entry = (topic.image as { src: string }).src.slice('xap:'.length)
    expect(await r.session.document.readEntry(entry)).toEqual(PNG)

    expect(r.controller.undo()).toBe(true)
    await settle()
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })

  it('gives a topic still without a title of its own the page title, in the same step', async () => {
    const r = await rig()
    r.controller.edit((root) => {
      const node = root
        .children!.find((each) => each.id === IDS.a)!
        .children!.find((each) => each.id === IDS.a1)!
      node.topic = 'https://example.com/post'
    })
    await settle()
    const read = reading({
      ok: true,
      title: 'A post',
      picture: { base64: base64(PNG), mime: 'image/png' },
    })
    await applyLinkPreview(r.host, IDS.a1, 'https://example.com/post', {
      read,
      newTopicName: 'New topic',
    })
    expect(r.topicOf(IDS.a1)!.title).toBe('A post')
    expect(r.topicOf(IDS.a1)!.image).toBeDefined()

    expect(r.controller.undo()).toBe(true)
    await settle()
    expect(r.topicOf(IDS.a1)!.title).toBe('https://example.com/post')
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })

  it('puts the title alone when the page has no picture', async () => {
    const r = await rig()
    r.controller.edit((root) => {
      const node = root
        .children!.find((each) => each.id === IDS.a)!
        .children!.find((each) => each.id === IDS.a1)!
      node.topic = 'New topic'
    })
    await settle()
    const read = reading({ ok: true, title: 'A post', picture: null })
    expect(
      await applyLinkPreview(r.host, IDS.a1, 'https://example.com/post', {
        read,
        newTopicName: 'New topic',
      }),
    ).toBe('title-only')
    expect(r.topicOf(IDS.a1)!.title).toBe('A post')
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })

  it('changes nothing when the page cannot be read or has nothing to give', async () => {
    const r = await rig()
    const entries = [...r.session.document.entryNames]
    const changed = r.session.document.changed
    const options = (result: LinkPreviewResult) => ({
      read: reading(result),
      newTopicName: 'New topic',
    })
    expect(
      await applyLinkPreview(
        r.host,
        IDS.a1,
        'https://example.com',
        options({ ok: false, reason: 'unreachable' }),
      ),
    ).toBe('failed')
    expect(
      await applyLinkPreview(
        r.host,
        IDS.a1,
        'https://example.com',
        options({ ok: true, title: 'Page', picture: null }),
      ),
    ).toBe('nothing')
    expect(
      await applyLinkPreview(
        r.host,
        IDS.a1,
        'https://example.com',
        options({ ok: true, title: null, picture: { base64: 'PHN2Zz4=', mime: 'image/svg+xml' } }),
      ),
    ).toBe('nothing')
    expect(r.session.document.entryNames).toEqual(entries)
    expect(r.session.document.changed).toBe(changed)
    expect(r.topicOf(IDS.a1)!.title).toBe('Alpha one')
    expect(r.topicOf(IDS.a1)!.image).toBeUndefined()
  })
})
