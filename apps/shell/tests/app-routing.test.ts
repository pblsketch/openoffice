import { describe, expect, it } from 'vitest'

import { TEXT_RE, appForPath, renameStaysInApp } from '../src/main/app-routing'

describe('appForPath', () => {
  it('routes the markdown app at every extension it opens', () => {
    expect(appForPath('/x/notes.md')).toBe('markdown')
    expect(appForPath('/x/notes.markdown')).toBe('markdown')
    expect(appForPath('/x/notes.txt')).toBe('markdown')
    expect(appForPath('/x/data.json')).toBe('markdown')
  })

  it('leaves the other apps on their own extensions', () => {
    expect(appForPath('/x/a.docx')).toBe('docs')
    expect(appForPath('/x/a.xlsx')).toBe('sheets')
    expect(appForPath('/x/a.pptx')).toBe('slides')
    expect(appForPath('/x/a.pdf')).toBe('pdf')
    expect(appForPath('/x/a.html')).toBe('html')
    expect(appForPath('/x/a.xmind')).toBe('mindmap')
    expect(appForPath('/x/A.XMIND')).toBe('mindmap')
  })

  it('routes drawings to the drawing app, an Obsidian drawing note before the markdown app', () => {
    expect(appForPath('/vault/Board.excalidraw.md')).toBe('excalidraw')
    expect(appForPath('/vault/BOARD.EXCALIDRAW.MD')).toBe('excalidraw')
    expect(appForPath('/x/board.excalidraw')).toBe('excalidraw')
    // only the name: a plain note stays with the markdown app here (the router reads its front matter)
    expect(appForPath('/vault/excalidraw.md')).toBe('markdown')
  })

  it('keeps a drawing in its app when renamed, not into a plain note', () => {
    expect(renameStaysInApp('/vault/a.excalidraw.md', 'b.excalidraw.md')).toBe(true)
    expect(renameStaysInApp('/vault/a.excalidraw.md', 'b.md')).toBe(false)
  })

  it('routes both Hangul formats to the hwp app', () => {
    expect(appForPath('/x/a.hwp')).toBe('hwp')
    expect(appForPath('/x/a.hwpx')).toBe('hwp')
    expect(appForPath('/x/A.HWPX')).toBe('hwp')
    // the backup the hwp editor leaves beside a document is not a document
    expect(appForPath('/x/a.hwp.bak')).toBeUndefined()
  })

  it('opens OpenDocument text in the Word tab', () => {
    expect(appForPath('/x/a.odt')).toBe('docs')
    expect(appForPath('C:/x/REPORT.ODT')).toBe('docs')
  })

  it('has no app for an extension nothing opens', () => {
    expect(appForPath('/x/a.xyz')).toBeUndefined()
    expect(appForPath('/x/noextension')).toBeUndefined()
  })

  it('is case-insensitive, because the filesystem is', () => {
    expect(appForPath('/x/NOTES.MD')).toBe('markdown')
    expect(appForPath('/x/DATA.JSON')).toBe('markdown')
  })
})

/**
 * The open route keys on TEXT_RE, and a mismatch between the two is exactly the
 * bug this file was written for: the open dialog listed .txt/.json and the route
 * still tested a markdown-only pattern, so a picked file fell through to the
 * unsupported-file notice. Pinning the regex the route uses keeps the offered
 * extensions and the routed extensions from drifting apart again.
 */
describe("the open route's text-app pattern", () => {
  it('claims every extension the open dialog offers for the text app', () => {
    for (const ext of ['md', 'markdown', 'txt', 'json']) {
      expect(TEXT_RE.test(`/x/notes.${ext}`)).toBe(true)
    }
  })

  it('claims nothing else, so an unknown file still gets the unsupported notice', () => {
    for (const ext of ['docx', 'xlsx', 'pptx', 'pdf', 'html', 'xmind', 'xyz']) {
      expect(TEXT_RE.test(`/x/notes.${ext}`)).toBe(false)
    }
    expect(TEXT_RE.test('/x/noextension')).toBe(false)
  })
})

describe('renameStaysInApp', () => {
  it('refuses a legal name in an extension no app routes to', () => {
    // the character rules accept this: it is the extension that turns an
    // openable file into an unopenable one
    expect(renameStaysInApp('/x/notes.md', 'notes.md')).toBe(true)
    expect(renameStaysInApp('/x/notes.md', 'notes.xyz')).toBe(false)
  })

  it('allows a rename that stays inside the text app', () => {
    expect(renameStaysInApp('/x/notes.md', 'notes.markdown')).toBe(true)
    expect(renameStaysInApp('/x/notes.txt', 'notes.md')).toBe(true)
    expect(renameStaysInApp('/x/data.json', 'data.txt')).toBe(true)
  })

  it('keeps a rename inside every other app too', () => {
    expect(renameStaysInApp('/x/a.docx', 'a.docx')).toBe(true)
    expect(renameStaysInApp('/x/a.docx', 'a.pdf')).toBe(false)
    expect(renameStaysInApp('/x/a.xlsx', 'a.csv')).toBe(true)
    expect(renameStaysInApp('/x/a.png', 'a.png')).toBe(true)
    expect(renameStaysInApp('/x/plan.xmind', 'plan2.xmind')).toBe(true)
    expect(renameStaysInApp('/x/plan.xmind', 'plan.md')).toBe(false)
  })

  it('refuses a rename between .docx and .odt: same tab, different bytes', () => {
    expect(renameStaysInApp('/x/a.docx', 'a.odt')).toBe(false)
    expect(renameStaysInApp('/x/a.odt', 'a.docx')).toBe(false)
    expect(renameStaysInApp('/x/a.odt', 'b.odt')).toBe(true)
    expect(renameStaysInApp('/x/a.odt', 'b.ODT')).toBe(true)
    expect(renameStaysInApp('/x/a.odt', 'a.pdf')).toBe(false)
  })

  it('stays put when the file was never openable to begin with', () => {
    // no app to stay in, so this gate is not what blocks it
    expect(renameStaysInApp('/x/a.xyz', 'a.anything')).toBe(true)
  })
})
