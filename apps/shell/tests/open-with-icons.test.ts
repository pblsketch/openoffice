import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { LAUNCHABLE_EXTS } from '../src/main/launch-paths'

/**
 * .hwp/.hwpx/.xmind/.excalidraw are offered in Explorer's "Open with" and never made the
 * default (build/installer.nsh), so a PC that opens them with Hancom Office or
 * another tool keeps it. Each Open-With ProgId carries the per-type document
 * icon, which is what the user sees once they pick this app. The installer
 * itself can only be checked by installing it, so this pins the script text, the
 * ProgIds and the win.extraResources that put the icons on disk.
 */
const require = createRequire(import.meta.url)
const SHELL = resolve(import.meta.dirname, '..')
const nsh = readFileSync(join(SHELL, 'build/installer.nsh'), 'utf8')

function loadBuilderConfig(platform: string) {
  const configModule = { exports: {} as ReturnType<typeof require> }
  runInNewContext(readFileSync(join(SHELL, 'electron-builder.cjs'), 'utf8'), {
    module: configModule,
    __dirname: SHELL,
    process: { platform, arch: 'x64', env: {} },
    require: (id: string) =>
      id === 'node:fs' ? { ...require(id), existsSync: () => true } : require(id),
  })
  return configModule.exports
}

/** body of one `!macro NAME` … `!macroend` block */
function macroBody(name: string): string {
  const match = nsh.match(new RegExp(`!macro ${name}\\b[^\\n]*\\n([\\s\\S]*?)\\n!macroend`))
  if (!match) throw new Error(`no ${name} macro in installer.nsh`)
  return match[1]
}

/** the instructions of a macro, comments dropped */
function instructions(name: string): string[] {
  return macroBody(name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith(';'))
}

/** one Open-With ProgId the installer writes, with its icon and extension */
const OPEN_WITH = [
  {
    ext: 'hwp',
    progId: 'IeumOffice.HWPDocument',
    define: 'GENOFFICE_HWP_PROGID',
    name: 'HWP Document',
    icon: 'hwp.ico',
    register: 'GenOfficeRegisterOpenWithHwp',
    unregister: 'GenOfficeUnregisterOpenWithHwp',
  },
  {
    ext: 'hwpx',
    progId: 'IeumOffice.HWPXDocument',
    define: 'GENOFFICE_HWPX_PROGID',
    name: 'HWPX Document',
    icon: 'hwp.ico',
    register: 'GenOfficeRegisterOpenWithHwpx',
    unregister: 'GenOfficeUnregisterOpenWithHwpx',
  },
  {
    ext: 'xmind',
    progId: 'IeumOffice.MindMap',
    define: 'GENOFFICE_MINDMAP_PROGID',
    name: 'Mind Map',
    icon: 'mindmap.ico',
    register: 'GenOfficeRegisterOpenWithMindmap',
    unregister: 'GenOfficeUnregisterOpenWithMindmap',
  },
  {
    ext: 'excalidraw',
    progId: 'IeumOffice.Drawing',
    define: 'GENOFFICE_DRAWING_PROGID',
    name: 'Drawing',
    icon: 'excalidraw.ico',
    register: 'GenOfficeRegisterOpenWithDrawing',
    unregister: 'GenOfficeUnregisterOpenWithDrawing',
  },
] as const

describe('the .hwp / .hwpx / .xmind / .excalidraw "Open with" registration', () => {
  it('covers only launchable extensions', () => {
    for (const { ext } of OPEN_WITH) expect(LAUNCHABLE_EXTS).toContain(ext)
  })

  it('uses a product-own ProgId within the Windows limits', () => {
    for (const { progId, define } of OPEN_WITH) {
      expect(nsh).toContain(`!define ${define} "${progId}"`)
      expect(progId).toMatch(/^IeumOffice\.[A-Za-z][A-Za-z0-9]*$/)
      // Windows limits a ProgId to 39 characters
      expect(progId.length).toBeLessThanOrEqual(39)
      expect(progId.toLowerCase()).not.toContain('genoffice')
    }
  })

  it('writes each ProgId with a name, the per-type icon and an open command', () => {
    for (const { define, name, icon, register, ext } of OPEN_WITH) {
      const body = instructions(register)
      const progKey = `Software\\Classes\\\${${define}}`
      expect(body, register).toContain(`WriteRegStr SHELL_CONTEXT "${progKey}" "" "${name}"`)
      expect(body, register).toContain(
        `WriteRegStr SHELL_CONTEXT "${progKey}\\DefaultIcon" "" "$INSTDIR\\resources\\${icon}"`,
      )
      expect(body, register).toContain(
        `WriteRegStr SHELL_CONTEXT "${progKey}\\shell\\open\\command" "" '"$appExe" "%1"'`,
      )
      expect(body, register).toContain(
        `WriteRegNone SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "\${${define}}"`,
      )
    }
  })

  it('never writes the default value of the extension or any other key under it', () => {
    for (const { ext, define, register } of OPEN_WITH) {
      const writes = instructions(register).filter((line) => line.includes(`\\.${ext}`))
      // the OpenWithProgids value is the only thing written under the extension
      expect(writes, ext).toEqual([
        `WriteRegNone SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "\${${define}}"`,
      ])
      expect(nsh, ext).not.toMatch(new RegExp(`"Software\\\\Classes\\\\\\.${ext}" ""`))
      expect(nsh, ext).not.toMatch(new RegExp(`\\.${ext}\\\\ShellNew`))
    }
  })

  it('removes only its own value and its own ProgId on uninstall', () => {
    for (const { ext, define, unregister } of OPEN_WITH) {
      expect(instructions(unregister), ext).toEqual([
        `DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${ext}\\OpenWithProgids" "\${${define}}"`,
        `DeleteRegKey SHELL_CONTEXT "Software\\Classes\\\${${define}}"`,
      ])
    }
  })

  it('runs the registration on install and the removal on uninstall', () => {
    const install = macroBody('customInstall')
    const uninstall = macroBody('customUnInstall')
    for (const { register, unregister } of OPEN_WITH) {
      expect(install, register).toContain(`!insertmacro ${register}`)
      expect(uninstall, unregister).toContain(`!insertmacro ${unregister}`)
    }
  })

  it('ships the icons the ProgIds point at into resources on Windows', () => {
    const win = loadBuilderConfig('win32')
    const resources = win.win.extraResources as Array<{ from: string; to: string }>
    for (const { icon } of OPEN_WITH) {
      const entry = resources.find((resource) => resource.to === icon)
      expect(entry, `${icon} is not shipped to resources`).toBeTruthy()
      expect(entry!.from).toBe(`build/${icon}`)
      expect(existsSync(join(SHELL, entry!.from))).toBe(true)
    }
  })
})

/**
 * Windows' Default apps page records the ProgId an app declares for a type
 * when the app is in RegisteredApplications. Without the declaration it records
 * Applications\IeumOffice.exe, whose icon is the app logo: .hwp chosen before
 * the per-type ProgId existed still shows that logo while .hwpx shows hwp.ico.
 * Capabilities only make IeumOffice a candidate; no default changes at install.
 */
describe('the IeumOffice Default-apps registration', () => {
  const CAPABILITIES = 'Software\\IeumOffice\\Capabilities'

  function declaredAssociations(): Map<string, string> {
    const defines = new Map(
      [...nsh.matchAll(/!define\s+(GENOFFICE_\w+_PROGID)\s+"([^"]+)"/g)].map((m) => [m[1], m[2]]),
    )
    const declared = new Map<string, string>()
    for (const line of instructions('GenOfficeRegisterApplicationCapabilities')) {
      const match = /FileAssociations" "\.([a-z0-9]+)" "([^"]+)"/.exec(line)
      if (match) {
        declared.set(
          match[1],
          match[2].replace(/\$\{(\w+)\}/g, (whole, name) => defines.get(name) ?? whole),
        )
      }
    }
    return declared
  }

  it('registers the product with its own capabilities key', () => {
    const body = instructions('GenOfficeRegisterApplicationCapabilities')
    expect(body).toContain(
      `WriteRegStr SHELL_CONTEXT "Software\\RegisteredApplications" "\${PRODUCT_NAME}" "\${GENOFFICE_CAPABILITIES_KEY}"`,
    )
    expect(nsh).toContain(`!define GENOFFICE_CAPABILITIES_KEY "${CAPABILITIES}"`)
    expect(body).toContain(
      `WriteRegStr SHELL_CONTEXT "\${GENOFFICE_CAPABILITIES_KEY}" "ApplicationName" "\${PRODUCT_NAME}"`,
    )
    expect(body).toContain(
      `WriteRegStr SHELL_CONTEXT "\${GENOFFICE_CAPABILITIES_KEY}" "ApplicationIcon" "$appExe,0"`,
    )
  })

  it('maps every Windows association to the ProgId whose icon the user should see', () => {
    const declared = declaredAssociations()
    const win = loadBuilderConfig('win32')
    for (const association of win.win.fileAssociations as Array<{ ext: string; name: string }>) {
      expect(declared.get(association.ext), `.${association.ext}`).toBe(association.name)
    }
    for (const { ext, progId } of OPEN_WITH) expect(declared.get(ext), `.${ext}`).toBe(progId)
    expect(declared.get('odt')).toBe('IeumOffice.OpenDocumentText')
  })

  it('never advertises a type whose ProgId Windows does not register', () => {
    const declared = declaredAssociations()
    // .txt/.json stay off win.fileAssociations, so no Windows ProgId exists
    expect(declared.has('txt')).toBe(false)
    expect(declared.has('json')).toBe(false)
  })

  it('never writes an extension default, only the capability entry', () => {
    for (const line of instructions('GenOfficeRegisterApplicationCapabilities')) {
      expect(line).not.toMatch(/"Software\\Classes\\\./)
      expect(line).not.toContain('"Software\\Classes\\.hwp" ""')
    }
  })

  it('removes only its registration and capabilities key on uninstall', () => {
    expect(instructions('GenOfficeUnregisterApplicationCapabilities')).toEqual([
      'DeleteRegValue SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}"',
      'DeleteRegKey SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}"',
      'DeleteRegKey /ifempty SHELL_CONTEXT "Software\\IeumOffice"',
    ])
  })

  it('runs on install and uninstall with the other file registrations', () => {
    expect(macroBody('customInstall')).toContain(
      '!insertmacro GenOfficeRegisterApplicationCapabilities',
    )
    expect(macroBody('customUnInstall')).toContain(
      '!insertmacro GenOfficeUnregisterApplicationCapabilities',
    )
  })
})
