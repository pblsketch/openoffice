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
  PC_FONTS_MODULE,
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

describe('rhwp format-copy safety patch', () => {
  const source = [
    'const FORMAT_COPY_CELL_KEYS: Array<keyof CellProperties> = [',
    "  'cellProtect',",
    "  'fieldName',",
    "  'editableInForm',",
    "  'borderFillId',",
    '];',
  ].join('\n')

  it('drops the form field name and editability from a copied cell look', () => {
    const patched = applyPatch('studio-format-copy-safety', source)
    expect(patched).not.toContain("'fieldName'")
    expect(patched).not.toContain("'editableInForm'")
    expect(patched).toContain("'cellProtect'")
    expect(patched).toContain("'borderFillId'")
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

describe('rhwp memo menu patches', () => {
  // the studio's text around the command, as the pinned release has it
  const insert = [
    "  stub('insert:para-band', t('command.insert.paraBand.label')),",
    "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
    '  {',
    "    id: 'insert:footnote',",
  ].join('\n')

  it('turn the comment stub into a command that asks the app for a memo', () => {
    const patched = applyPatch('studio-memo-command', insert)
    expect(patched).not.toContain("stub('insert:comment'")
    expect(patched).toContain("    id: 'insert:comment',")
    expect(patched).toContain("    icon: 'icon-comment',")
    expect(patched).toContain('canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode')
    expect(patched).toContain("globalThis.dispatchEvent(new CustomEvent('ieum:memo-insert'))")
    // no shortcut: the menu shows none for the memo
    const command = patched.slice(
      patched.indexOf("    id: 'insert:comment',"),
      patched.indexOf("    id: 'insert:footnote',"),
    )
    expect(command).not.toContain('shortcutLabel')
  })

  it('name the menu 메모 in Korean and Memo in English', () => {
    const ko = '  "command.insert.comment.label": "주석",'
    expect(applyPatch('studio-memo-label-ko', ko)).toBe('  "command.insert.comment.label": "메모",')
    const en = '  "command.insert.comment.label": "Comments",'
    expect(applyPatch('studio-memo-label-en', en)).toBe('  "command.insert.comment.label": "Memo",')
  })

  it('fail when the stub or a label is gone', () => {
    expect(() => applyPatch('studio-memo-command', 'export const insertCommands = []')).toThrow(
      /rhwp patch/,
    )
    expect(() => applyPatch('studio-memo-label-ko', 'const catalog = {}')).toThrow(/rhwp patch/)
    expect(() => applyPatch('studio-memo-label-en', 'const catalog = {}')).toThrow(/rhwp patch/)
  })

  it('refuse to guess between two matches', () => {
    const twice = [
      "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
      "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
    ].join('\n')
    expect(() => applyPatch('studio-memo-command', twice)).toThrow(/exactly one/)
    expect(() =>
      applyPatch('studio-memo-label-ko', '  "command.insert.comment.label": "주석",\n'.repeat(2)),
    ).toThrow(/exactly one/)
    expect(() =>
      applyPatch(
        'studio-memo-label-en',
        '  "command.insert.comment.label": "Comments",\n'.repeat(2),
      ),
    ).toThrow(/exactly one/)
  })

  // the ends of the two right-click lists, as the pinned release has them
  const menus = [
    '  private getTableContextMenuItems(): ContextMenuItem[] {',
    '    return [',
    "      { type: 'command', commandId: 'table:formula', label: '계산식(F)...' },",
    "      { type: 'separator' },",
    "      { type: 'command', commandId: 'table:split', label: '표 나누기' },",
    '    ];',
    '  }',
    '  private getDefaultContextMenuItems(): ContextMenuItem[] {',
    '    return [',
    "      { type: 'command', commandId: 'format:para-num-shape', label: '문단 번호 모양(N)...' },",
    '    ];',
    '  }',
  ].join('\n')

  it('put the memo command in the body and table cell right-click menus', () => {
    const patched = applyPatch('studio-memo-context-menu', menus)
    const table = patched.slice(0, patched.indexOf('getDefaultContextMenuItems'))
    const body = patched.slice(patched.indexOf('getDefaultContextMenuItems'))
    for (const menu of [table, body]) {
      expect(menu.match(/commandId: 'insert:comment'/g)).toHaveLength(1)
    }
    // no label of its own: the menu shows the command's localized 메모 / Memo
    expect(patched).toContain("      { type: 'command', commandId: 'insert:comment' },")
    expect(body).toMatch(/'insert:comment' \},\n {4}\];/)
  })

  it('keep CRLF sources working and fail when a list changed', () => {
    const crlf = applyPatch('studio-memo-context-menu', menus.replaceAll('\n', '\r\n'))
    expect(crlf.match(/'insert:comment'/g)).toHaveLength(2)
    expect(crlf).not.toMatch(/[^\r]\n/)
    expect(() =>
      applyPatch('studio-memo-context-menu', menus.replace("'table:formula'", "'table:sum'")),
    ).toThrow(/rhwp patch/)
  })

  it('are all in the studio build', () => {
    for (const name of [
      'studio-memo-command',
      'studio-memo-context-menu',
      'studio-memo-label-ko',
      'studio-memo-label-en',
    ] as const) {
      expect(STUDIO_PATCHES).toContain(name)
    }
  })
})

describe('rhwp memo delete-undo patches', () => {
  // the studio's text around the patches, as the pinned release has it
  const bridge = [
    '  getHyperlinkContext(target: HyperlinkTarget): HyperlinkContext {',
    "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
    '    return JSON.parse(this.doc.getHyperlinkContext(JSON.stringify(target)));',
    '  }',
    '',
  ].join('\n')
  const command = [
    'export class DeleteTextCommand implements EditCommand {',
    '  execute(wasm: WasmBridge): DocumentPosition {',
    '    if (!isCaption && this.count > 0) {',
    '      const target = hyperlinkTarget(this.position);',
    '      const context = wasm.getHyperlinkContext(target);',
    '      if (context.links.some(link => this.position.charOffset < link.end',
    '        && link.start < this.position.charOffset + this.count)) {',
    '        this.fragmentId = wasm.captureDeleteRange(target.section, target.para, target.para);',
    '      }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n')
  const patched = applyPatch('studio-memo-delete-undo', command)

  type Anchor = {
    sectionIndex: number
    paraIndex: number | null
    startCharIdx: number | null
    endCharIdx: number | null
    path: { controlIndex: number; cellIndex?: number; paraIndex: number }[] | null
  }
  type Target = { section: number; para: number; cellPath: [number, number, number][] }

  /** The helper the patch adds, run against a bridge that holds the given memos. */
  function overlaps(anchors: Anchor[], target: Target, offset: number, count: number): boolean {
    const start = patched.indexOf('export function memoAnchorOverlaps(')
    const block = patched.slice(start, patched.indexOf('\n}\n', start) + 2)
    const js = ts.transpileModule(block.replace('export function', 'function'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
    const helper = new Function(`${js}\nreturn memoAnchorOverlaps`)() as (
      wasm: { getMemoAnchors(): Anchor[] },
      target: Target,
      offset: number,
      count: number,
    ) => boolean
    return helper({ getMemoAnchors: () => anchors }, target, offset, count)
  }

  const body = (start: number, end: number): Anchor => ({
    sectionIndex: 0,
    paraIndex: 3,
    startCharIdx: start,
    endCharIdx: end,
    path: null,
  })

  it('give the bridge the memo anchors, and none from an engine without memos', () => {
    const patched = applyPatch('studio-memo-anchors', bridge)
    expect(patched).toContain('  getMemoAnchors(): {')
    expect(patched).toContain("if (!doc || typeof doc.getMemoList !== 'function') return [];")
    expect(patched).toContain('return JSON.parse(doc.getMemoList());')
    expect(patched.indexOf('getMemoAnchors(')).toBeLessThan(
      patched.indexOf('  getHyperlinkContext('),
    )
  })

  it('capture the paragraph when a typed deletion touches a memo anchor, as for a link', () => {
    expect(patched).toContain(
      '        || memoAnchorOverlaps(wasm, target, this.position.charOffset, this.count)) {',
    )
    expect(patched.indexOf('export function memoAnchorOverlaps(')).toBeLessThan(
      patched.indexOf('export class DeleteTextCommand'),
    )
    expect(patched.split('captureDeleteRange').length).toBe(2)
  })

  it('see a deletion inside or at the edge of a body memo, not beside it', () => {
    const at = { section: 0, para: 3, cellPath: [] as [number, number, number][] }
    expect(overlaps([body(2, 5)], at, 4, 1)).toBe(true)
    expect(overlaps([body(2, 5)], at, 2, 1)).toBe(true)
    expect(overlaps([body(2, 5)], at, 1, 1)).toBe(false)
    expect(overlaps([body(2, 5)], at, 5, 1)).toBe(false)
    expect(overlaps([body(2, 5)], at, 0, 9)).toBe(true)
    // a caret memo is not removed by a deletion, so nothing to capture
    expect(overlaps([body(2, 2)], at, 1, 2)).toBe(false)
    // another paragraph or section, or a range-less memo spanning paragraphs
    expect(overlaps([body(2, 5)], { ...at, para: 4 }, 3, 1)).toBe(false)
    expect(overlaps([{ ...body(2, 5), sectionIndex: 1 }], at, 3, 1)).toBe(false)
    expect(overlaps([{ ...body(2, 5), startCharIdx: null, endCharIdx: null }], at, 3, 1)).toBe(
      false,
    )
    expect(overlaps([], at, 3, 1)).toBe(false)
  })

  it('match a memo in a table cell or a text box by its path', () => {
    const cell: Anchor = {
      ...body(0, 4),
      path: [{ controlIndex: 1, cellIndex: 2, paraIndex: 0 }],
    }
    const box: Anchor = { ...body(0, 4), path: [{ controlIndex: 5, paraIndex: 1 }] }
    expect(overlaps([cell], { section: 0, para: 3, cellPath: [[1, 2, 0]] }, 1, 1)).toBe(true)
    expect(overlaps([cell], { section: 0, para: 3, cellPath: [[1, 3, 0]] }, 1, 1)).toBe(false)
    expect(overlaps([cell], { section: 0, para: 3, cellPath: [] }, 1, 1)).toBe(false)
    expect(overlaps([box], { section: 0, para: 3, cellPath: [[5, 0, 1]] }, 3, 1)).toBe(true)
  })

  it('fail when the text is gone, and are in the studio build', () => {
    expect(() => applyPatch('studio-memo-anchors', 'export class WasmBridge {}')).toThrow(
      /rhwp patch/,
    )
    expect(() =>
      applyPatch('studio-memo-delete-undo', command.replace('implements EditCommand', '')),
    ).toThrow(/rhwp patch/)
    expect(STUDIO_PATCHES).toContain('studio-memo-anchors')
    expect(STUDIO_PATCHES).toContain('studio-memo-delete-undo')
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

describe('rhwp PC fonts patch', () => {
  // the studio's text around the patch, as the pinned release has it
  const main = [
    'import {',
    '  clearStoredLocalFonts,',
    '  detectLocalFonts,',
    '  getLocalFontState,',
    '  loadStoredLocalFonts,',
    '  resolveLocalFont,',
    "} from '@/core/local-fonts';",
    '',
    '    setupZoomControls();',
    '    setupEventListeners();',
    '    setupModalFocusRestore();',
    '',
  ].join('\n')
  const patched = applyPatch('studio-pc-fonts', main)

  it('looks at the PC once the studio listens for font changes, with its own detection', () => {
    expect(patched).toContain(`import { refreshPcFonts } from '${PC_FONTS_MODULE}';`)
    expect(patched).toContain('  getLocalFontRecords,\n')
    const call = patched.indexOf('void refreshPcFonts({')
    expect(call).toBeGreaterThan(patched.indexOf('setupEventListeners();'))
    expect(call).toBeLessThan(patched.indexOf('setupModalFocusRestore();'))
    expect(patched).toContain('detect: () => detectLocalFonts({ force: true }),')
    expect(patched).toContain("eventBus.emit('local-fonts-changed'")
  })

  it('keeps CRLF sources working, fails when the text is gone, and is in the studio build', () => {
    expect(applyPatch('studio-pc-fonts', main.replaceAll('\n', '\r\n'))).toContain(
      'void refreshPcFonts({\r\n',
    )
    expect(() => applyPatch('studio-pc-fonts', main.replace('setupEventListeners', 'x'))).toThrow(
      /studio-pc-fonts/,
    )
    expect(STUDIO_PATCHES).toContain('studio-pc-fonts')
  })
})

describe('rhwp clipboard objects patch', () => {
  // the studio's text around the patch, as the pinned release has it
  const keyboard = [
    "import { tableObjectClipboardTarget } from './table-object-clipboard-target';",
    'export function onCopy(this: any, e: ClipboardEvent): void {',
    '        } else {',
    '          html = this.wasm.exportSelectionHtml(',
    '            start.sectionIndex,',
    '            start.paragraphIndex, start.charOffset,',
    '            end.paragraphIndex, end.charOffset,',
    '          );',
    '        }',
    '}',
    '  const hasMatchingInternalControlText =',
    '    this.wasm.clipboardHasControl?.() === true &&',
    '    !!internalClipboardText &&',
    '    text === internalClipboardText;',
    '  const items = clipboardData?.items;',
    '  if (items) {',
    '    // 스냅샷으로 삽입 (Undo 지원)',
    '        if (p.parentParaIndex !== undefined) return undefined;',
    '        if (!parsed.ok) return undefined;',
    '      if (isNestedCellPosition(p)) {',
    '        result = wasm.pasteHtmlInCellByPath(',
    '          p.sectionIndex, p.parentParaIndex!, JSON.stringify(p.cellPath), p.charOffset, htmlForCore,',
    '        );',
    '      } else if (p.parentParaIndex !== undefined) {',
    '        result = wasm.pasteHtmlInCell(',
    '          p.sectionIndex, p.parentParaIndex, p.controlIndex!,',
    '          p.cellIndex!, p.cellParaIndex!, p.charOffset, htmlForCore,',
    '        );',
    '      }',
  ].join('\n')

  it('keep the caret in its cell when Hangul’s model is not pasted there', () => {
    const patched = applyPatch('studio-clipboard-objects', keyboard)
    expect(patched).toContain('        if (p.parentParaIndex !== undefined) return null;')
    expect(patched).toContain(
      '        if (!parsed.ok) return hasSelection ? this.cursor.getPosition() : null;',
    )
    expect(patched).not.toContain('return undefined;')
  })

  it('let the app put the pictures of HTML pasted into a cell', () => {
    const patched = applyPatch('studio-clipboard-objects', keyboard)
    expect(patched.match(/result = ieumPasteHtmlInCell\(wasm, p, htmlForCore,/g)).toHaveLength(2)
    expect(patched).not.toMatch(/result = wasm\.pasteHtmlInCell/)
  })

  it('send a pasted picture file through the HTML paste first', () => {
    const patched = applyPatch('studio-clipboard-objects', keyboard)
    expect(patched).toContain(
      [
        '    const ieumHtml = ieumPictureHtml(data, ext, wHwp, hHwp);',
        '    if (ieumHtml) {',
        "      pasteExternalHtml.call(this, ieumHtml, '', hasSelection);",
        '      return;',
        '    }',
        '    // 스냅샷으로 삽입 (Undo 지원)',
      ].join('\n'),
    )
  })

  it('let the app write a block, and leave another editor’s copy to that editor', () => {
    const patched = applyPatch('studio-clipboard-objects', keyboard)
    expect(patched).toContain(
      "import { ieumPasteHtmlInCell, ieumPictureHtml, ieumSelectionHtml } from '@ieum/clipboard-html';",
    )
    expect(patched).toContain(
      'html = ieumSelectionHtml(this.wasm,\n            start.sectionIndex,',
    )
    expect(patched).not.toContain('this.wasm.exportSelectionHtml(')
    expect(patched).toContain(
      '    text === internalClipboardText &&\n    readRhwpClipboardToken(html) === null;',
    )
    expect(patched).toContain('  if (items && readRhwpClipboardToken(html) === null) {')
  })

  it('fail when the text is gone, and are in the studio build', () => {
    expect(() =>
      applyPatch('studio-clipboard-objects', keyboard.replace('exportSelectionHtml', 'x')),
    ).toThrow(/rhwp patch/)
    expect(STUDIO_PATCHES).toContain('studio-clipboard-objects')
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
    'src/engine/input-handler-text.ts',
    'src/engine/input-handler-table.ts',
    'src/engine/command.ts',
    'src/command/commands/edit.ts',
    'src/command/commands/format.ts',
    'src/command/commands/insert.ts',
    'src/command/commands/table.ts',
    'src/command/shortcut-map.ts',
    'src/ui/table-cell-props-dialog.ts',
    'src/command/registry.ts',
    'src/i18n/locales/ko.ts',
    'src/i18n/locales/en.ts',
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
      `import { hancomCommands, installHancomMainKeys, installHancomMenuItems, installHanjaKey } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the studio parts the new commands build on are handed over; the module imports none
    expect(patched).toContain(
      "import { InsertTextCommand, InsertTabCommand } from '@/engine/command';",
    )
    expect(patched).toContain("import { ModalDialog } from '@/ui/dialog';")
    expect(patched).toContain("import { FindDialog, navigateToSearchHit } from '@/ui/find-dialog';")
    expect(patched).toContain("import { CellBorderBgDialog } from '@/ui/cell-border-bg-dialog';")
    expect(patched).toContain("import { showToast } from '@/ui/toast';")
    expect(patched).toContain(
      '  InsertTextCommand, InsertTabCommand, ModalDialog, FindDialog, navigateToSearchHit,\n' +
        '  CellBorderBgDialog, TableCellPropsDialog, showToast,\n}));',
    )
    expect(patched.indexOf('registry.registerAll(hancomCommands(getLocale(), {')).toBeGreaterThan(
      patched.indexOf('registry.registerAll(toolCommands);'),
    )
    expect(patched).toContain('installHancomMenuItems(document, getLocale());')
    // the main process asks the editor about Ctrl+Shift+S and Ctrl+Shift+H through it
    expect(patched).toContain('installHancomMainKeys(window, () => inputHandler, dispatcher);')
    // the Hanja key on a word already typed
    expect(patched).toContain('installHanjaKey(window, () => inputHandler, dispatcher);')
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

  it('give the bridge the one-cell resize call of engine patch 0016', () => {
    const source = [
      '  moveTableOffset(sec: number, parentPara: number, controlIdx: number, deltaH: number, deltaV: number): { ok: boolean; ppi: number; ci: number } {',
      '    return { ok: true, ppi: 0, ci: 0 };',
      '  }',
      '',
    ].join('\n')
    const patched = applyPatch('studio-single-cell-resize', source)
    expect(patched).toContain('  resizeTableCell(')
    expect(patched).toContain(
      'return JSON.parse((this.doc as any).resizeTableCell(sec, parentPara, controlIdx, row, col, vertical, forward));',
    )
    expect(patched.indexOf('resizeTableCell(')).toBeLessThan(patched.indexOf('  moveTableOffset('))
    // and the cell placing call of engine patch 0027 (H/W, Shift+Up/Down)
    expect(patched).toContain(
      'return JSON.parse((this.doc as any).setTableCellExtents(sec, parentPara, controlIdx, vertical, JSON.stringify(extents)));',
    )
  })

  it('puts a new row below a merged cell after the merge, in both insert paths', () => {
    const source = [
      "import { t } from '../../i18n/index.ts';",
      'function applyTableInsertRowColumn() {',
      '  switch (mode) {',
      "          case 'row-below':",
      '            wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, cellInfo.row, true);',
      '            break;',
      '  }',
      '}',
      'const commands = [',
      '  {',
      "    id: 'table:insert-row-below',",
      "    label: t('command.table.insertRowBelow.registryLabel'),",
      '    canExecute: inTable,',
      '    execute(services) {',
      '      const ih = services.getInputHandler();',
      '      if (!ih) return;',
      '      const pos = ih.getCursorPosition();',
      '      if (pos.parentParaIndex === undefined || pos.controlIndex === undefined || pos.cellIndex === undefined) return;',
      '      const cellInfo = services.wasm.getCellInfo(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex, pos.cellIndex);',
      '      safeTableOp(() => ih.executeOperation({',
      "        kind: 'snapshot',",
      "        operationType: 'insertTableRow',",
      '        operation: (wasm) => {',
      '          wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, cellInfo.row, true);',
      '          return pos;',
      '        },',
      "      }), '줄 추가');",
      '    },',
      '  },',
      '];',
      '',
    ].join('\n')
    const patched = applyPatch('studio-merged-row-below', source)
    expect(patched).toContain(`import { insertRowBelow } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain(
      'const afterRow = cellInfo.row + Math.max(1, cellInfo.rowSpan || 1) - 1 + i;',
    )
    expect(patched).toContain('wasm.mergeTableCells(')
    expect(patched).toContain('      insertRowBelow(services);')
    expect(patched).not.toContain('safeTableOp(() => ih.executeOperation({')
  })

  it('hand the equal-size stubs to the app’s own equalizer', () => {
    const source = [
      "import { t } from '../../i18n/index.ts';",
      '// HWP/HWPX cannot persist independent per-row or per-column geometry. Keep',
      '// commands that require that representation unavailable at command routing.',
      'const localTableGeometryCanPersist = () => false;',
      '',
      '  {',
      "    id: 'table:cell-height-equal',",
      "    label: t('command.table.cellHeightEqual.label'),",
      "    shortcutLabel: 'H',",
      '    canExecute: localTableGeometryCanPersist,',
      '    execute() {},',
      '  },',
      '  {',
      "    id: 'table:cell-width-equal',",
      "    label: t('command.table.cellWidthEqual.label'),",
      "    shortcutLabel: 'W',",
      '    canExecute: localTableGeometryCanPersist,',
      '    execute() {},',
      '  },',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-equal-cells', source)
    expect(patched).toContain(`import { equalizeTableCells } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).not.toContain('localTableGeometryCanPersist')
    expect(patched).toContain('    canExecute: inTableOrCellSelection,')
    expect(patched).toContain("      equalizeTableCells(services, 'height', getLocale() === 'ko');")
    expect(patched).toContain("      equalizeTableCells(services, 'width', getLocale() === 'ko');")
  })

  it('hand the sequences to the module, the second key first and the IME path too', () => {
    const source = [
      "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
      'export function onKeyDown(this: any, e: KeyboardEvent): void {',
      '  this._cellBlockLetterImeGuard?.reset();',
      '  if (this._pendingChordK) {}',
      '  if (this.connectorDrawingMode) {',
      '    return;',
      '  }',
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
      `import { hancomCellBlockKey, hancomCellKey, hancomChordKey, hancomChordStart, hancomContextKey, hancomCtrlKey, hancomTableObjectKey } from '${HANCOM_KEYS_MODULE}';`,
    )
    // the second key is looked at before anything else the handler does
    expect(patched).toContain(
      '  this._cellBlockLetterImeGuard?.reset();\n  if (hancomChordKey(this, e)) return;\n  if (this._pendingChordK)',
    )
    // a table-object key and a cell block's keys come before the selection is dropped; the
    // block's keys are told what the studio's shortcut table makes of the key
    expect(patched).toContain(
      '  if (hancomTableObjectKey(this, e)) return;\n' +
        '  if (hancomCellBlockKey(this, e, (ev: KeyboardEvent) => matchShortcut(ev, defaultShortcuts))) return;\n' +
        '  if (hancomCellKey(this, e)) return;\n' +
        '  if (this.connectorDrawingMode) {',
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

describe('the table/cell properties dialog on a cell block', () => {
  it('hands what its cell tab wrote to the module, in the same apply', () => {
    const source = [
      "import { t as i18nText } from '../i18n/index.ts';",
      '',
      '    const applyProps = () => {',
      '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);',
      '      this.wasm.setTableProperties(sec, ppi, ci, newTableProps as Partial<TableProperties>);',
      '    };',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-cell-props-block', source)
    expect(patched).toContain(`import { hancomBlockCellProps } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain(
      '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);\n' +
        '      hancomBlockCellProps(this, newCellProps);\n' +
        '      this.wasm.setTableProperties(',
    )
    // after the border/fill patch, which rewrites the lines just above
    const order = STUDIO_PATCHES.indexOf('studio-hancom-cell-props-block')
    expect(order).toBeGreaterThan(STUDIO_PATCHES.indexOf('studio-table-props-border-bg'))
  })

  it('fails when the apply is gone', () => {
    expect(() =>
      applyPatch(
        'studio-hancom-cell-props-block',
        "import { t as i18nText } from '../i18n/index.ts';\n",
      ),
    ).toThrow(/exactly one occurrence/)
  })
})

describe('the character and paragraph dialogs on a cell block', () => {
  it("format the whole block through the editor's block path", () => {
    const source = [
      '    execute(services) {',
      '      const ih = services.getInputHandler();',
      '      if (!ih) return;',
      '      const charProps = ih.getCharProperties();',
      '      const savedSel = ih.getSelection();',
      '      if (!savedSel) return;',
      '      dialog.onApply = (mods) => {',
      '        ih.applyCharPropsToRange(savedSel.start, savedSel.end, mods);',
      '      };',
      '    },',
      '    execute(services) {',
      '      const range = sel ?? { start: curPos, end: curPos };',
      '      dialog.onApply = (mods) => {',
      '        ih.applyParaPropsToRange(range.start, range.end, mods);',
      '      };',
      '    },',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-block-format-dialogs', source)
    expect(patched).toContain('      if (!savedSel && !ieumBlock) return;')
    expect(patched).toContain("        if (ieumBlock) services.eventBus.emit('format-char', mods);")
    expect(patched).toContain(
      '        else if (savedSel) ih.applyCharPropsToRange(savedSel.start, savedSel.end, mods);',
    )
    expect(patched).toContain('        if (ieumBlock) ih.applyParaPropsAtCursor(mods);')
    expect(patched).toContain(
      '        else ih.applyParaPropsToRange(range.start, range.end, mods);',
    )
    expect(patched.split('const ieumBlock = ih.isInCellSelectionMode();')).toHaveLength(3)
    expect(STUDIO_PATCHES).toContain('studio-hancom-block-format-dialogs')
  })
})

describe("Hangul's plain drag of a horizontal table border", () => {
  it('asks the module first and lets the border go below the next line', () => {
    const source = [
      "import { showToast } from '@/ui/toast';",
      '  return {',
      '    min: prev === undefined ? -Infinity : prev + minSizePx,',
      '    max: next === undefined ? Infinity : next - minSizePx,',
      '  };',
      '  const inCellSel = this.cursor.isInCellSelectionMode();',
      "  if (state.edge.type === 'col' && inCellSel && range) {",
      '    updates = [];',
      '  } else {',
      '  }',
      '',
    ].join('\n')
    const patched = applyPatch('studio-hancom-row-drag', source)
    expect(patched).toContain(`import { hancomRowDragUpdates } from '${HANCOM_KEYS_MODULE}';`)
    expect(patched).toContain(
      "    max: next === undefined || edge.type === 'row' ? Infinity : next - minSizePx,",
    )
    expect(patched).toContain(
      '  const ieumRowDrag = hancomRowDragUpdates(this, state, deltaHwpUnit, e.altKey);',
    )
    expect(patched).toContain("  } else if (state.edge.type === 'col' && inCellSel && range) {")
    expect(STUDIO_PATCHES).toContain('studio-hancom-row-drag')
  })
})
