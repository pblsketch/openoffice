import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { RENDERER_SCHEME } from '../../../packages/electron-utils/src/renderer-scheme'
import {
  AGENT_PLUGIN_MODULE,
  APP_SCHEME,
  HANCOM_KEYS_MODULE,
  PASSWORD_FLAG,
  STUDIO_PATCHES,
  applyPatch,
  hancomHooks,
  missingHancomCommands,
  missingPluginHooks,
  patchTargets,
  pluginHooks,
} from '../scripts/rhwp-patches.mjs'
import { AGENT_PLUGIN_ID } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

describe('rhwp scheme patches', () => {
  it('admit the scheme the packaged renderers are served from', () => {
    expect(APP_SCHEME).toBe(RENDERER_SCHEME)
  })

  it('apply to the installed @rhwp/editor transport', () => {
    const transport = join(dirname(require.resolve('@rhwp/editor')), 'transport.js')
    const patched = applyPatch('sdk-scheme', readFileSync(transport, 'utf8'))
    expect(patched).toContain(`targetUrl.protocol !== '${APP_SCHEME}:'`)
    // http and https stay accepted: the dev server origin depends on them
    expect(patched).toContain("targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:'")
  })

  it('patch the studio origin check', () => {
    const source = "    return protocol === 'http:' || protocol === 'https:';\n"
    expect(applyPatch('studio-scheme', source)).toBe(
      `    return protocol === 'http:' || protocol === 'https:' || protocol === '${APP_SCHEME}:';\n`,
    )
  })
})

describe('rhwp password-flag patch', () => {
  it('adds the protection flag to the command context, next to the dirty flag', () => {
    const source = [
      '  return {',
      '    hasDocument: hasDoc,',
      '    isDirty: documentState.isDirty(),',
      '  };',
      '',
    ].join('\n')
    expect(applyPatch('studio-password-flag', source)).toBe(
      [
        '  return {',
        '    hasDocument: hasDoc,',
        '    isDirty: documentState.isDirty(),',
        `    ${PASSWORD_FLAG}: wasm.requiresPasswordForSave,`,
        '  };',
        '',
      ].join('\n'),
    )
  })
})

describe('rhwp plugin-allow patch', () => {
  it('lets the studio load the app plugin, and nothing else new', () => {
    const source = [
      'async function resolvePlugin(id: string): Promise<StudioPlugin | null> {',
      "  if (id === 'hwpctrl') return hwpctrlPlugin;",
      "  if (import.meta.env.DEV && id === 'dev-probe') {",
      '    return devProbePlugin;',
      '  }',
      '  return null;',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-plugin-allow', source)
    expect(patched).toContain(`if (id === '${AGENT_PLUGIN_ID}') {`)
    expect(patched).toContain(`import('${AGENT_PLUGIN_MODULE}')`)
    // the studio's own entries stay, in their order
    expect(patched.indexOf("id === 'hwpctrl'")).toBeLessThan(patched.indexOf(AGENT_PLUGIN_ID))
    expect(patched).toContain("  if (import.meta.env.DEV && id === 'dev-probe') {")
    expect(patched.split('if (').length).toBe(source.split('if (').length + 1)
  })
})

describe('a patch whose text is gone', () => {
  it('fails loudly instead of building an unpatched editor', () => {
    expect(() => applyPatch('sdk-scheme', 'export class EditorTransport {}')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-scheme', 'export const x = 1')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-password-flag', 'return { hasDocument }')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-plugin-allow', 'return null')).toThrow(/rhwp patch/)
  })

  it('refuses to guess between two matches', () => {
    const twice = "return protocol === 'http:' || protocol === 'https:';\n".repeat(2)
    expect(() => applyPatch('studio-scheme', twice)).toThrow(/exactly one/)
  })
})

describe('what the plugin reaches into the studio for', () => {
  const complete = (file: string) => {
    const needles = [...pluginHooks, ...hancomHooks]
      .filter((hook) => hook.file === file)
      .flatMap((hook) => hook.needles)
    return needles.length > 0 ? needles.join('\n') : null
  }

  it('is all there in a source that has every name', () => {
    expect(missingPluginHooks(complete)).toEqual([])
  })

  it('names the file and the name when one is gone', () => {
    const renamed = (file: string) =>
      (complete(file) ?? '').replace('getSelectionOrdered()', 'selectionInOrder()')
    expect(missingPluginHooks(renamed)).toEqual(['src/engine/cursor.ts: getSelectionOrdered()'])
  })

  it('counts every name of a file that is gone', () => {
    const gone = (file: string) => (file === 'src/automation/types.ts' ? null : complete(file))
    expect(missingPluginHooks(gone)).toEqual([
      'src/automation/types.ts: registerCommand(def: ExtCommandDef): void',
    ])
  })
})

describe('rhwp nested-table patches', () => {
  // the studio's text around each patch, as the pinned release has it
  const bridge = [
    '  deleteTableControl(sec: number, parentPara: number, controlIdx: number): { ok: boolean } {',
    "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
    '    return JSON.parse(this.doc.deleteTableControl(sec, parentPara, controlIdx));',
    '  }',
    '',
    '  getCellProperties(sec: number) {}',
    '',
  ].join('\n')

  it('give the bridge one call for a table in the body or in a cell', () => {
    const patched = applyPatch('studio-table-delete-at', bridge)
    expect(patched).toContain('deleteTableAt(ref: {')
    // a path of two or more is a table in a cell: the cell is all but the last step
    expect(patched).toContain(
      'if (path.length < 2) return this.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
    )
    expect(patched).toContain(
      'JSON.stringify(path.slice(0, -1)), path[path.length - 1].controlIndex',
    )
    expect(patched).toContain('this.doc.deleteCellTableControlByPath(')
    // the studio's own call stays as it was
    expect(patched.startsWith(bridge.split('\n\n')[0])).toBe(true)
    expect(patched).toContain('  getCellProperties(sec: number) {}')
  })

  it('let Delete take a selected table in a cell instead of dropping the selection', () => {
    const source = [
      '    if (this.cursor.isInTableObjectSelection()) {',
      '      const ref = this.cursor.getSelectedTableRef();',
      '      if (!ref) return;',
      '      if (ref.cellPath && ref.cellPath.length > 1) {',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      '        this.updateCaret();',
      '        return;',
      '      }',
      '      this.cursor.moveOutOfSelectedTable();',
      "      this.eventBus.emit('table-object-selection-changed', false);",
      "      this.executeOperation({ kind: 'snapshot', operationType: 'deleteTable', operation: (wasm: WasmBridge) => {",
      '        wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '        return this.cursor.getPosition();',
      '      }});',
      '',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-delete', source)
    expect(patched).not.toContain('ref.cellPath.length > 1')
    expect(patched).not.toContain('deleteTableControl')
    expect(patched).toContain(
      '        wasm.deleteTableAt(ref);\n        return this.cursor.getPosition();',
    )
    expect(patched.split('moveOutOfSelectedTable()').length).toBe(2)
  })

  it('let Cut take a selected table in a cell, after copying it', () => {
    const source = [
      '      if (ref) {',
      '        // 중첩 표 잘라내기는 지원하지 않는다. keydown 경로도 같은 선택 상태를 유지한다.',
      '        if (ref.cellPath && ref.cellPath.length > 1) return;',
      '        this.performCopy();',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      "        this.executeOperation({ kind: 'snapshot', operationType: 'cutTable', operation: (wasm: WasmBridge) => {",
      '          wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '          return this.cursor.getPosition();',
      '        }});',
      '',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-cut', source)
    expect(patched).not.toContain('ref.cellPath.length > 1')
    expect(patched.indexOf('this.performCopy();')).toBeLessThan(
      patched.indexOf('wasm.deleteTableAt(ref);'),
    )
  })

  it('make Delete Table take the table the caret is in, not the outer one', () => {
    const source = [
      '    execute(services) {',
      '      const ih = services.getInputHandler();',
      '      if (!ih) return;',
      '      const ref = ih.getSelectedTableRef();',
      '      if (ref) {',
      '        safeTableOp(() => ih.executeOperation({',
      "          kind: 'snapshot',",
      "          operationType: 'deleteTable',",
      '          operation: (wasm) => {',
      '            wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      '',
    ].join('\n')
    const patched = applyPatch('studio-nested-table-command', source)
    // a selected table in a cell goes the way Delete takes it
    const nested = patched.indexOf('if ((ref?.cellPath?.length ?? 0) > 1) {')
    expect(nested).toBeGreaterThan(-1)
    expect(patched.indexOf('ih.performDelete();')).toBeGreaterThan(nested)
    // from the caret, a path of two or more means the inner table, and the caret stays in its cell
    expect(patched).toContain('(at.cellPath?.length ?? 0) > 1')
    expect(patched).toContain('cellPath: at.cellPath')
    expect(patched).toContain('cellPath: outer,')
    // a table in the body is still deleted as before
    expect(patched).toContain('      if (ref) {\n        safeTableOp(() => ih.executeOperation({')
    expect(patched).toContain('wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);')
  })

  it('match a checkout with CRLF line ends, and keep them', () => {
    const patched = applyPatch('studio-table-delete-at', bridge.replaceAll('\n', '\r\n'))
    expect(patched).toContain('deleteTableAt(ref: {')
    expect(patched.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-table-delete-at',
      'studio-nested-table-delete',
      'studio-nested-table-cut',
      'studio-nested-table-command',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})

describe('rhwp font memo patches', () => {
  // the studio's text around the patches, as the pinned release has it
  const bridge = [
    'let canvasFontSubstitutionInstalled = false;',
    '',
    'function installCanvasFontSubstitution(): void {',
    '  Object.defineProperty(proto, "font", {',
    '    set(value: string) {',
    '      descriptor.set!.call(this, scopedHostCanvasFont(String(value)) ?? substituteCssFontFamily(String(value)));',
    '    },',
    '  });',
    '}',
    '',
  ].join('\n')
  const patched = applyPatch('studio-font-memo-use', applyPatch('studio-font-memo-state', bridge))

  /** The memo the patch adds, run against a substitution that counts its calls. */
  function memoWith(substitute: (font: string) => string): (font: string) => string {
    const start = patched.indexOf('let canvasFontMemo')
    const block = patched.slice(start, patched.indexOf('\n}\n', start) + 2)
    const js = ts.transpileModule(block, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
    return new Function('substituteCssFontFamily', `${js}\nreturn memoSubstituteCssFontFamily`)(
      substitute,
    )
  }

  it('send the font setter through the memo, after the host fonts as before', () => {
    expect(patched).toContain(
      'scopedHostCanvasFont(String(value)) ?? memoSubstituteCssFontFamily(String(value))',
    )
    expect(patched).not.toContain('?? substituteCssFontFamily(String(value))')
    expect(patched.startsWith('let canvasFontSubstitutionInstalled = false;\n')).toBe(true)
  })

  it('substitute a font string once in a synchronous stretch, and again after it', async () => {
    const calls: string[] = []
    const memo = memoWith((font) => {
      calls.push(font)
      return `${font} chain`
    })
    expect(memo('10px "A"')).toBe('10px "A" chain')
    expect(memo('10px "A"')).toBe('10px "A" chain')
    expect(memo('bold 10px "B"')).toBe('bold 10px "B" chain')
    expect(calls).toEqual(['10px "A"', 'bold 10px "B"'])
    // a microtask checkpoint: fonts found or a document opened since then are seen
    await Promise.resolve()
    expect(memo('10px "A"')).toBe('10px "A" chain')
    expect(calls).toEqual(['10px "A"', 'bold 10px "B"', '10px "A"'])
  })

  it('are in the studio build', () => {
    expect(STUDIO_PATCHES).toContain('studio-font-memo-state')
    expect(STUDIO_PATCHES).toContain('studio-font-memo-use')
  })
})

describe('the studio source the build fetched', () => {
  // build-studio.mjs keeps it under the tag the engine names (vendor/rhwp-core, decision 0050)
  const core = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'vendor', 'rhwp-core', 'package.json'), 'utf8'),
  )
  const studio = join(
    __dirname,
    '..',
    'node_modules',
    '.cache',
    'rhwp-studio',
    core.rhwp.tag,
    'rhwp-studio',
  )
  const files = [
    'src/main.ts',
    'src/embed/protocol.ts',
    'src/core/wasm-bridge.ts',
    'src/engine/input-handler.ts',
    'src/engine/input-handler-keyboard.ts',
    'src/command/commands/table.ts',
    'src/command/shortcut-map.ts',
    'src/command/registry.ts',
  ].map((file) => join(studio, file))

  // only where a build has fetched it; a fresh checkout has nothing to look at
  it.skipIf(!existsSync(studio))('takes every studio patch exactly once', () => {
    for (const name of STUDIO_PATCHES) {
      const targets = files.filter((file) => patchTargets(name, file))
      expect(targets, name).toHaveLength(1)
      expect(() => applyPatch(name, readFileSync(targets[0], 'utf8')), name).not.toThrow()
    }
  })

  it.skipIf(!existsSync(studio))('has what the plugin and the Hangul keys reach into', () => {
    const read = (file: string) => {
      try {
        return readFileSync(join(studio, file), 'utf8')
      } catch {
        return null
      }
    }
    expect(missingPluginHooks(read)).toEqual([])
    const commands = join(studio, 'src', 'command', 'commands')
    const sources = readdirSync(commands)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(join(commands, file), 'utf8'))
      .join('\n')
    expect(missingHancomCommands(sources)).toEqual([])
  })
})

describe('rhwp Hangul-key patches', () => {
  it('adapt the shortcut table after its last entry, importing the module', () => {
    const source = [
      'export const defaultShortcuts: [ShortcutDef, string][] = [',
      "  [{ key: 'z', ctrl: true }, 'edit:undo'],",
      "  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],",
      '];',
      '',
      'export function matchShortcut() {}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-shortcuts', source)
    expect(patched).toContain(`import { adaptToHancom } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched.indexOf('adaptToHancom(defaultShortcuts);')).toBeGreaterThan(
      patched.indexOf('];'),
    )
    expect(patched).toContain("  [{ key: 'z', ctrl: true }, 'edit:undo'],")
    expect(patched).toContain('export function matchShortcut() {}')
  })

  it('give the menus the new labels through the command registry', () => {
    const source = [
      "import type { CommandDef } from './types';",
      '',
      'export class CommandRegistry {',
      '  register(def: CommandDef): void {',
      '    this.commands.set(def.id, def);',
      '  }',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-labels', source)
    expect(patched).toContain(`import { withHancomLabel } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain('    this.commands.set(def.id, withHancomLabel(def));')
    expect(patched).not.toContain('this.commands.set(def.id, def);')
  })

  it("register the new commands after the studio's own, in its locale", () => {
    const source = [
      "import { initI18n, t } from '@/i18n/index.ts';",
      'registry.registerAll(pageCommands);',
      'registry.registerAll(toolCommands);',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-commands', source)
    expect(patched).toContain("import { getLocale } from '@/i18n/core.ts';")
    expect(patched).toContain(
      `import { hancomCommands, installHancomMainKeys, installHancomMenuItems } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the studio parts the new commands build on are handed over; the module imports none
    expect(patched).toContain("import { InsertTextCommand } from '@/engine/command';")
    expect(patched).toContain("import { ModalDialog } from '@/ui/dialog';")
    expect(patched).toContain("import { FindDialog, navigateToSearchHit } from '@/ui/find-dialog';")
    expect(patched).toContain(
      '  InsertTextCommand, ModalDialog, FindDialog, navigateToSearchHit,\n}));',
    )
    expect(patched.indexOf('registry.registerAll(hancomCommands(getLocale(), {')).toBeGreaterThan(
      patched.indexOf('registry.registerAll(toolCommands);'),
    )
    expect(patched).toContain('installHancomMenuItems(document, getLocale());')
    // the main process asks the editor about Ctrl+Shift+S and Ctrl+Shift+H through it
    expect(patched).toContain('installHancomMainKeys(window, () => inputHandler, dispatcher);')
  })

  it('give the bridge the page number calls of engine patch 0014', () => {
    const source = [
      '  applyStyle(sec: number, para: number, styleId: number): { ok: boolean } {',
      '    return { ok: true };',
      '  }',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-page-number', source)
    expect(patched).toContain(
      '  setPageNumberPos(sec: number, format: number, position: number, dash: boolean): string {',
    )
    expect(patched).toContain(
      'return (this.doc as any).setPageNumberPos(sec, format, position, dash);',
    )
    expect(patched).toContain('return (this.doc as any).getPageNumberPos(sec);')
    expect(patched.indexOf('setPageNumberPos(sec')).toBeLessThan(patched.indexOf('  applyStyle('))
  })

  it('hand the sequences to the module, the second key first and the IME path too', () => {
    const source = [
      "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
      'export function onKeyDown(this: any, e: KeyboardEvent): void {',
      '  this._cellBlockLetterImeGuard?.reset();',
      '  if (this._pendingChordK) {}',
      '  if (e.isComposing || e.keyCode === 229) {',
      "    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyM') {",
      '      e.preventDefault();',
      '      this._pendingChordM = true;',
      '      return;',
      '    }',
      '  }',
      '}',
      'export function handleCtrlKey(this: any, e: KeyboardEvent): void {',
      "  if (e.key === '/' && !e.shiftKey && !e.altKey) {",
      '    this.commandPalette?.open();',
      '    return;',
      '  }',
      '  const cmdId = matchShortcut(e, defaultShortcuts);',
      "  if ((e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') && !e.shiftKey && !e.altKey) {",
      '    this._pendingChordK = true;',
      '  }',
      '}',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-chords', source)
    expect(patched).toContain(
      `import { hancomChordKey, hancomChordStart, hancomContextKey, hancomCtrlKey } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the second key is looked at before anything else the handler does
    expect(patched).toContain(
      '  this._cellBlockLetterImeGuard?.reset();\n  if (hancomChordKey(this, e)) return;\n  if (this._pendingChordK)',
    )
    // the studio no longer starts its own Ctrl+M on the IME path
    expect(patched).not.toContain('this._pendingChordM = true;')
    expect(patched).toContain(
      '  if (e.isComposing || e.keyCode === 229) {\n    if (hancomCtrlKey(this, e)) return;',
    )
    // the keys that depend on the caret come ahead of the studio's shortcut table
    const context = patched.indexOf('  if (hancomContextKey(this, e)) return;')
    expect(context).toBeGreaterThan(patched.indexOf('this.commandPalette?.open();'))
    expect(context).toBeLessThan(
      patched.indexOf('const cmdId = matchShortcut(e, defaultShortcuts);'),
    )
    // and the module comes ahead of the studio's Ctrl+K
    expect(
      patched.indexOf('  if (hancomChordStart(this, e)) return;\n  if ((e.key'),
    ).toBeGreaterThan(patched.indexOf('handleCtrlKey'))
  })

  it('fail when one edit of several is gone', () => {
    const source = "import type { CommandDef } from './types';\n"
    expect(() => applyPatch('studio-hancom-labels', source)).toThrow(/studio-hancom-labels/)
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-hancom-shortcuts',
      'studio-hancom-labels',
      'studio-hancom-commands',
      'studio-hancom-chords',
      'studio-hancom-page-number',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})
