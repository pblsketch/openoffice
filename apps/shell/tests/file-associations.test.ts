import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { LAUNCHABLE_EXTS } from '../src/main/launch-paths'

const require = createRequire(import.meta.url)
// Inspect packaging metadata without downloading Electron or compiling OCR
// helpers (same approach as shell-new.test.ts).
const configModule = { exports: {} as ReturnType<typeof require> }
runInNewContext(readFileSync(resolve(import.meta.dirname, '../electron-builder.cjs'), 'utf8'), {
  module: configModule,
  __dirname: resolve(import.meta.dirname, '..'),
  process: { platform: 'linux', arch: 'x64', env: {} },
  require: (id: string) =>
    id === 'node:fs' ? { ...require(id), existsSync: () => true } : require(id),
})
const config = configModule.exports
// Declared per platform (a top-level list would be appended to the Windows
// one); mac and Linux carry the full list.
const fileAssociations: Array<{ ext: string; mimeType?: string }> = config.linux.fileAssociations
/** launchable extensions build/installer.nsh offers in "Open with" itself */
const INSTALLER_OPEN_WITH_EXTS: ReadonlySet<string> = new Set([
  'odt',
  'hwp',
  'hwpx',
  'xmind',
  'excalidraw',
])
const installerScript = readFileSync(resolve(import.meta.dirname, '../build/installer.nsh'), 'utf8')

describe('packaged file associations', () => {
  // The OS can only offer GenOffice in "Open With" (mac CFBundleDocumentTypes,
  // the Linux desktop MimeType list, the NSIS ProgIds) for types the bundle
  // declares. A routing entry without a matching declaration means a file the
  // app opens fine can never reach it from Finder/Explorer — the .txt/.json
  // gap this closes.
  it('advertises every extension the app launches', () => {
    for (const ext of LAUNCHABLE_EXTS) {
      // .odt/.hwp/.hwpx/.xmind/.excalidraw are offered by the NSIS script alone
      // (tests/odt-open-with.test.ts, tests/open-with-icons.test.ts): an
      // association would make the app their default opener on Windows
      if (INSTALLER_OPEN_WITH_EXTS.has(ext)) continue
      const association = fileAssociations.find((entry) => entry.ext === ext)
      expect(association, `no file association declared for .${ext}`).toBeTruthy()
    }
    for (const ext of INSTALLER_OPEN_WITH_EXTS) {
      expect(LAUNCHABLE_EXTS).toContain(ext)
      expect(installerScript).toContain(`Software\\Classes\\.${ext}\\OpenWithProgids`)
    }
    expect(config.mac.fileAssociations).toEqual(fileAssociations)
    expect(config.fileAssociations).toBeUndefined()
  })

  it('gives every association the mimeType the Linux desktop entry needs', () => {
    for (const association of fileAssociations) {
      expect(
        association.mimeType,
        `.${association.ext} declares no mimeType — the Linux target drops it`,
      ).toBeTruthy()
    }
  })

  it('keeps plain text and JSON off the Windows list, where NSIS would make the app their default', () => {
    const winExts = config.win.fileAssociations.map((entry: { ext: string }) => entry.ext)
    expect(winExts).not.toContain('txt')
    expect(winExts).not.toContain('json')
    // a PC with Hancom Office keeps it as the opener for its own formats
    expect(winExts).not.toContain('hwp')
    expect(winExts).not.toContain('hwpx')
    for (const ext of ['docx', 'xlsx', 'pptx', 'pdf', 'md', 'html']) {
      expect(winExts, `.${ext} missing from the Windows associations`).toContain(ext)
    }
  })

  // Installing must not take the default program for a mind map file away from
  // whatever the user already opens it with.
  it('keeps .xmind off the Windows list, and Open With only everywhere else', () => {
    const winExts = config.win.fileAssociations.map((entry: { ext: string }) => entry.ext)
    expect(winExts).not.toContain('xmind')
    expect(LAUNCHABLE_EXTS).toContain('xmind')

    const offered = fileAssociations.find((entry) => entry.ext === 'xmind') as
      | { ext: string; name: string; description?: string; rank?: string; mimeType?: string }
      | undefined
    expect(offered, 'mac / Linux do not offer the app for .xmind').toBeTruthy()
    // macOS: an alternate handler never becomes the default by being installed
    expect(offered!.rank).toBe('Alternate')
    expect(offered!.mimeType).toBe('application/vnd.xmind.workbook')
    // the type is named for what it is, not after another product
    expect(`${offered!.name} ${offered!.description ?? ''}`).not.toMatch(/xmind/i)
  })

  // An Excalidraw drawing keeps the program the user already opens it with,
  // like a mind map; the label is the product's own word for the type.
  it('keeps .excalidraw off the Windows list, and Open With only everywhere else', () => {
    const winExts = config.win.fileAssociations.map((entry: { ext: string }) => entry.ext)
    expect(winExts).not.toContain('excalidraw')
    expect(LAUNCHABLE_EXTS).toContain('excalidraw')

    const offered = fileAssociations.find((entry) => entry.ext === 'excalidraw') as
      | { ext: string; name: string; description?: string; rank?: string; mimeType?: string }
      | undefined
    expect(offered, 'mac / Linux do not offer the app for .excalidraw').toBeTruthy()
    expect(offered!.rank).toBe('Alternate')
    expect(offered!.mimeType).toBe('application/vnd.excalidraw+json')
    expect(`${offered!.name} ${offered!.description ?? ''}`).not.toMatch(/excalidraw/i)
  })

  it('ships the module tree of every editor the bundle routes to', () => {
    const modules = (config.extraResources as Array<{ from: string; to: string }>)
      .map((entry) => entry.to)
      .filter((to) => to.startsWith('modules/'))
    expect(modules).toContain('modules/html')
    expect(modules).toContain('modules/mindmap')
    expect(modules).toContain('modules/excalidraw')
  })
})
