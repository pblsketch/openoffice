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
  'epub',
  'vsdx',
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
      // .odt/.hwp/.hwpx/.xmind/.epub/.vsdx are offered by the NSIS script alone
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

  // Installing must not take the default program for a book away from the
  // reader the user already has.
  it('keeps .epub off the Windows list, and Open With only everywhere else', () => {
    const winExts = config.win.fileAssociations.map((entry: { ext: string }) => entry.ext)
    expect(winExts).not.toContain('epub')
    expect(LAUNCHABLE_EXTS).toContain('epub')

    const offered = fileAssociations.find((entry) => entry.ext === 'epub') as
      { ext: string; name: string; rank?: string; mimeType?: string; icon?: string } | undefined
    expect(offered, 'mac / Linux do not offer the app for .epub').toBeTruthy()
    // macOS: an alternate handler never becomes the default by being installed
    expect(offered!.rank).toBe('Alternate')
    expect(offered!.mimeType).toBe('application/epub+zip')
    expect(offered!.icon).toBe('epub')
  })

  // A draw.io diagram is the app's own to edit and save: like the office
  // types the installer offers to take its default. A Visio drawing is only
  // imported, so it stays Open With only. The draw.io pictures keep the
  // picture's program (their extension is .svg / .png).
  it('takes .drawio and .dio as an editor, and .vsdx for Open With only', () => {
    const winExts = config.win.fileAssociations.map((entry: { ext: string }) => entry.ext)
    expect(winExts).toContain('drawio')
    expect(winExts).toContain('dio')
    expect(winExts).not.toContain('vsdx')
    expect(winExts).not.toContain('svg')
    expect(winExts).not.toContain('png')
    const byExt = (ext: string) =>
      fileAssociations.find((entry) => entry.ext === ext) as
        { name: string; role?: string; rank?: string; mimeType?: string; icon?: string } | undefined
    for (const ext of ['drawio', 'dio']) {
      expect(byExt(ext), ext).toMatchObject({
        name: 'Diagram',
        role: 'Editor',
        icon: 'diagram',
        mimeType: 'application/vnd.jgraph.mxfile',
      })
      expect(byExt(ext)!.rank, ext).toBeUndefined()
    }
    // the drawing is never written: a viewer, and never the default by being installed
    expect(byExt('vsdx')).toMatchObject({ role: 'Viewer', rank: 'Alternate', icon: 'diagram' })
    // the label names the format, not another product
    expect(byExt('vsdx')!.name).not.toMatch(/visio/i)
    // the type identifier "set as default" names on macOS resolves without draw.io
    const imported = config.mac.extendInfo.UTImportedTypeDeclarations as Array<{
      UTTypeIdentifier: string
      UTTypeTagSpecification: Record<string, string[]>
    }>
    const drawio = imported.find((type) => type.UTTypeIdentifier === 'com.jgraph.drawio')
    expect(drawio?.UTTypeTagSpecification['public.filename-extension']).toEqual(['drawio', 'dio'])
  })

  it('ships the module tree of every editor the bundle routes to', () => {
    const modules = (config.extraResources as Array<{ from: string; to: string }>)
      .map((entry) => entry.to)
      .filter((to) => to.startsWith('modules/'))
    expect(modules).toContain('modules/html')
    expect(modules).toContain('modules/mindmap')
    expect(modules).toContain('modules/epub')
    const epub = (config.extraResources as Array<{ from: string; to: string }>).find(
      (entry) => entry.to === 'modules/epub',
    )
    expect(epub?.from).toBe('../epub/out')
  })
})
