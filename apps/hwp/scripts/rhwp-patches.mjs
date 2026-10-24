/**
 * The source patches this app applies to rhwp when it builds it. Each one is
 * an exact-text replacement that fails loudly when the text is gone, so an
 * rhwp upgrade cannot drop one silently.
 *
 * sdk-scheme, studio-scheme
 *   rhwp's embed bridge accepts only http(s) origins, on both ends: the SDK
 *   (`@rhwp/editor`) refuses a studio URL on any other scheme, and the studio
 *   ignores a parent whose origin is not http(s). The packaged app serves every
 *   renderer from the privileged `genoffice-app` scheme, so both checks have to
 *   admit that one scheme as well.
 *
 * studio-password-flag
 *   The bridge's export calls write plain bytes even for a document that was
 *   opened with a password; only the studio's own Save, which embed mode
 *   removes, asks for the password again. The studio knows the document is
 *   protected but does not say so over the bridge, so its command context
 *   gains one field and the host can refuse to write such a document.
 *
 * studio-plugin-allow
 *   The studio loads plugins only from a list compiled into it, and in a
 *   production build that list holds its own HwpCtrl plugin alone. The AI
 *   panel edits the document through this app's plugin
 *   (studio-plugin/agent-plugin.mjs), so the list gains that one name.
 *
 * studio-table-delete-at, studio-nested-table-delete, studio-nested-table-cut,
 * studio-nested-table-command
 *   The studio cannot delete a table that sits in another table's cell (a form
 *   whose cells hold tables). With such a table selected, Delete and Cut drop
 *   the selection and leave the table, and "Delete Table" from the cell's menu
 *   reads the caret by the outer table alone and deletes the whole outer table.
 *   The engine has the call for a table in a cell (`deleteCellTableControlByPath`,
 *   which the AI's table deletion uses too). The bridge gains one method that
 *   deletes the table a selection or a caret points at, in the body or in a
 *   cell, and the three paths call it: the inner table goes, the outer stays.
 *
 * studio-hancom-shortcuts, studio-hancom-labels, studio-hancom-commands,
 * studio-hancom-chords
 *   A Hangul tab takes Hancom Hangul's keys (decision 0060). The table of them and
 *   the commands rhwp lacks live in studio-plugin/hancom-keys.mjs; these patches
 *   only hook it in. The studio's shortcut table is adapted in place, its command
 *   registry shows the new keys next to the menu items, the new commands are
 *   registered (with the studio parts they build on) and put into the menus, and
 *   its key handler hands the Ctrl+N/K/Q/M/G sequences and the keys that depend on
 *   the caret (the easy table formulas) to the module, on the IME path too.
 *
 * studio-hancom-page-number
 *   The bridge gains the two engine calls of vendor/rhwp-core patch 0014, setting and
 *   reading a section's page number (Hangul's 쪽 번호 매기기).
 *
 * studio-font-memo-state, studio-font-memo-use
 *   The studio replaces the Canvas2D `font` setter so that every font string
 *   the engine sets passes its font substitution, which builds the family
 *   chain anew each time. Drawing a page sets the same few strings thousands
 *   of times, and that rebuilding was most of the cost of a keystroke. The
 *   setter keeps each string's answer until the next microtask checkpoint:
 *   one synchronous draw reuses it, and what the answer depends on (the fonts
 *   found on the PC, the open document's substitutions) changes only when an
 *   asynchronous step ends, so every later draw asks again.
 */

import { HANCOM_KEYS_MODULE, studioCommandIds } from '../studio-plugin/hancom-keys.mjs'

/** Must equal RENDERER_SCHEME in packages/electron-utils/src/renderer-scheme.ts. */
export const APP_SCHEME = 'genoffice-app'

/** Field the studio-password-flag patch adds to the studio's command context. */
export const PASSWORD_FLAG = 'passwordProtected'

/** Module specifier the studio-plugin-allow patch imports; build-studio.mjs aliases it. */
export const AGENT_PLUGIN_MODULE = '@ieum/agent-plugin'

/** Module specifier the studio-hancom-* patches import; build-studio.mjs aliases it. */
export { HANCOM_KEYS_MODULE }

const PATCHES = {
  'sdk-scheme': {
    file: /[\\/]@rhwp[\\/]editor[\\/]transport\.js$/,
    find: "if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {",
    replace: `if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:' && targetUrl.protocol !== '${APP_SCHEME}:') {`,
  },
  'studio-scheme': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]embed[\\/]protocol\.ts$/,
    find: "return protocol === 'http:' || protocol === 'https:';",
    replace: `return protocol === 'http:' || protocol === 'https:' || protocol === '${APP_SCHEME}:';`,
  },
  'studio-password-flag': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]main\.ts$/,
    find: '    isDirty: documentState.isDirty(),',
    replace: `    isDirty: documentState.isDirty(),\n    ${PASSWORD_FLAG}: wasm.requiresPasswordForSave,`,
  },
  'studio-plugin-allow': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]main\.ts$/,
    find: "  if (import.meta.env.DEV && id === 'dev-probe') {",
    replace:
      "  if (id === 'ieum-agent') {\n" +
      `    return (await import('${AGENT_PLUGIN_MODULE}')).agentPlugin as StudioPlugin;\n` +
      '  }\n' +
      "  if (import.meta.env.DEV && id === 'dev-probe') {",
  },
  'studio-table-delete-at': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    find: [
      '  deleteTableControl(sec: number, parentPara: number, controlIdx: number): { ok: boolean } {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return JSON.parse(this.doc.deleteTableControl(sec, parentPara, controlIdx));',
      '  }',
      '',
    ].join('\n'),
    replace: [
      '  deleteTableControl(sec: number, parentPara: number, controlIdx: number): { ok: boolean } {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return JSON.parse(this.doc.deleteTableControl(sec, parentPara, controlIdx));',
      '  }',
      '',
      '  /** The table a selection or a caret points at: in the body, or (a path of two or more) the innermost one in a cell. */',
      '  deleteTableAt(ref: { sec: number; ppi: number; ci: number; cellPath?: CellPathEntry[] }): { ok: boolean } {',
      '    const path = ref.cellPath ?? [];',
      '    if (path.length < 2) return this.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return JSON.parse(this.doc.deleteCellTableControlByPath(',
      '      ref.sec, ref.ppi, JSON.stringify(path.slice(0, -1)), path[path.length - 1].controlIndex,',
      '    ));',
      '  }',
      '',
    ].join('\n'),
  },
  'studio-nested-table-delete': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    find: [
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
    ].join('\n'),
    replace: [
      '      this.cursor.moveOutOfSelectedTable();',
      "      this.eventBus.emit('table-object-selection-changed', false);",
      "      this.executeOperation({ kind: 'snapshot', operationType: 'deleteTable', operation: (wasm: WasmBridge) => {",
      '        wasm.deleteTableAt(ref);',
    ].join('\n'),
  },
  'studio-nested-table-cut': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    find: [
      '        // 중첩 표 잘라내기는 지원하지 않는다. keydown 경로도 같은 선택 상태를 유지한다.',
      '        if (ref.cellPath && ref.cellPath.length > 1) return;',
      '        this.performCopy();',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      "        this.executeOperation({ kind: 'snapshot', operationType: 'cutTable', operation: (wasm: WasmBridge) => {",
      '          wasm.deleteTableControl(ref.sec, ref.ppi, ref.ci);',
    ].join('\n'),
    replace: [
      '        this.performCopy();',
      '        this.cursor.moveOutOfSelectedTable();',
      "        this.eventBus.emit('table-object-selection-changed', false);",
      "        this.executeOperation({ kind: 'snapshot', operationType: 'cutTable', operation: (wasm: WasmBridge) => {",
      '          wasm.deleteTableAt(ref);',
    ].join('\n'),
  },
  'studio-nested-table-command': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]table\.ts$/,
    find: [
      '      const ref = ih.getSelectedTableRef();',
      '      if (ref) {',
      '        safeTableOp(() => ih.executeOperation({',
      "          kind: 'snapshot',",
      "          operationType: 'deleteTable',",
    ].join('\n'),
    replace: [
      '      const ref = ih.getSelectedTableRef();',
      '      // a table in a cell: a selected one goes the way Delete takes it, and from',
      '      // the caret the table the caret is in goes, not the outer one',
      '      if ((ref?.cellPath?.length ?? 0) > 1) {',
      '        ih.performDelete();',
      '        return;',
      '      }',
      '      const at = ih.getCursorPosition();',
      '      if (!ref && at.parentParaIndex !== undefined && at.controlIndex !== undefined && (at.cellPath?.length ?? 0) > 1) {',
      '        const outer = at.cellPath!.slice(0, -1);',
      '        const cell = outer[outer.length - 1];',
      '        safeTableOp(() => ih.executeOperation({',
      "          kind: 'snapshot',",
      "          operationType: 'deleteTable',",
      '          operation: (wasm) => {',
      '            wasm.deleteTableAt({ sec: at.sectionIndex, ppi: at.parentParaIndex!, ci: at.controlIndex!, cellPath: at.cellPath });',
      '            return {',
      '              sectionIndex: at.sectionIndex,',
      '              paragraphIndex: cell.cellParaIndex,',
      '              charOffset: 0,',
      '              parentParaIndex: at.parentParaIndex,',
      '              controlIndex: outer[0].controlIndex,',
      '              cellIndex: cell.cellIndex,',
      '              cellParaIndex: cell.cellParaIndex,',
      '              cellPath: outer,',
      '              isTextBox: at.isTextBox && outer.length === 1 ? true : undefined,',
      '            };',
      '          },',
      "        }), '표 지우기');",
      '        return;',
      '      }',
      '      if (ref) {',
      '        safeTableOp(() => ih.executeOperation({',
      "          kind: 'snapshot',",
      "          operationType: 'deleteTable',",
    ].join('\n'),
  },
  'studio-hancom-shortcuts': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]shortcut-map\.ts$/,
    // the table's last entry; an import may sit anywhere at the top level of a module
    find: "  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],\n];",
    replace:
      "  [{ key: 'p', ctrl: true, shift: true }, 'table:block-product'],\n];\n\n" +
      `import { adaptToHancom } from '${HANCOM_KEYS_MODULE}';\n` +
      'adaptToHancom(defaultShortcuts);',
  },
  'studio-hancom-labels': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]registry\.ts$/,
    edits: [
      {
        find: "import type { CommandDef } from './types';",
        replace:
          "import type { CommandDef } from './types';\n" +
          `import { withHancomLabel } from '${HANCOM_KEYS_MODULE}';`,
      },
      {
        find: '    this.commands.set(def.id, def);',
        replace: '    this.commands.set(def.id, withHancomLabel(def));',
      },
    ],
  },
  'studio-hancom-commands': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]main\.ts$/,
    edits: [
      {
        find: "import { initI18n, t } from '@/i18n/index.ts';",
        replace:
          "import { initI18n, t } from '@/i18n/index.ts';\n" +
          "import { getLocale } from '@/i18n/core.ts';\n" +
          "import { InsertTextCommand } from '@/engine/command';\n" +
          "import { ModalDialog } from '@/ui/dialog';\n" +
          "import { FindDialog, navigateToSearchHit } from '@/ui/find-dialog';\n" +
          `import { hancomCommands, installHancomMainKeys, installHancomMenuItems } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the new commands, with the studio parts they build on, and their menu items
      {
        find: 'registry.registerAll(toolCommands);',
        replace:
          'registry.registerAll(toolCommands);\n' +
          'registry.registerAll(hancomCommands(getLocale(), {\n' +
          '  InsertTextCommand, ModalDialog, FindDialog, navigateToSearchHit,\n' +
          '}));\n' +
          'installHancomMenuItems(document, getLocale());\n' +
          '// the keys the main process takes first and hands back for the table (decision 0060)\n' +
          'installHancomMainKeys(window, () => inputHandler, dispatcher);',
      },
    ],
  },
  'studio-hancom-page-number': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    // the engine calls of vendor/rhwp-core patch 0014, ahead of a neighbour the bridge has once
    find: '  applyStyle(sec: number, para: number, styleId: number): { ok: boolean } {',
    replace: [
      '  /** The section page number (Hangul: 쪽 번호 매기기); replaces the one the section has. */',
      '  setPageNumberPos(sec: number, format: number, position: number, dash: boolean): string {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return (this.doc as any).setPageNumberPos(sec, format, position, dash);',
      '  }',
      '',
      '  getPageNumberPos(sec: number): string {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return (this.doc as any).getPageNumberPos(sec);',
      '  }',
      '',
      '  applyStyle(sec: number, para: number, styleId: number): { ok: boolean } {',
    ].join('\n'),
  },
  'studio-hancom-chords': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-keyboard\.ts$/,
    edits: [
      {
        find: "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
        replace:
          "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';\n" +
          `import { hancomChordKey, hancomChordStart, hancomContextKey, hancomCtrlKey } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the second key, first of all (the studio's own Ctrl+K/M/G flags are never set again)
      {
        find: '  this._cellBlockLetterImeGuard?.reset();',
        replace:
          '  this._cellBlockLetterImeGuard?.reset();\n  if (hancomChordKey(this, e)) return;',
      },
      // the first key, or a key that depends on the caret, while the IME composes, where the
      // studio took Ctrl+M alone
      {
        find: [
          "    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyM') {",
          '      e.preventDefault();',
          '      this._pendingChordM = true;',
          '      return;',
          '    }',
        ].join('\n'),
        replace: '    if (hancomCtrlKey(this, e)) return;',
      },
      // a key that depends on the caret, ahead of the studio's shortcut table
      {
        find: ['    this.commandPalette?.open();', '    return;', '  }'].join('\n'),
        replace: [
          '    this.commandPalette?.open();',
          '    return;',
          '  }',
          '  if (hancomContextKey(this, e)) return;',
        ].join('\n'),
      },
      // the first key otherwise, ahead of the studio's Ctrl+K/M/G
      {
        find: "  if ((e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') && !e.shiftKey && !e.altKey) {",
        replace:
          '  if (hancomChordStart(this, e)) return;\n' +
          "  if ((e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') && !e.shiftKey && !e.altKey) {",
      },
    ],
  },
  'studio-font-memo-state': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    find: 'let canvasFontSubstitutionInstalled = false;',
    replace: [
      'let canvasFontSubstitutionInstalled = false;',
      '',
      '// one answer per font string until the next microtask checkpoint: a page draw sets the',
      '// same strings thousands of times, and what the answer depends on changes between tasks',
      'let canvasFontMemo: Map<string, string> | null = null;',
      'function memoSubstituteCssFontFamily(cssFont: string): string {',
      '  if (!canvasFontMemo) {',
      '    canvasFontMemo = new Map();',
      '    queueMicrotask(() => { canvasFontMemo = null; });',
      '  }',
      '  let out = canvasFontMemo.get(cssFont);',
      '  if (out === undefined) {',
      '    out = substituteCssFontFamily(cssFont);',
      '    canvasFontMemo.set(cssFont, out);',
      '  }',
      '  return out;',
      '}',
    ].join('\n'),
  },
  'studio-font-memo-use': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    find: 'descriptor.set!.call(this, scopedHostCanvasFont(String(value)) ?? substituteCssFontFamily(String(value)));',
    replace:
      'descriptor.set!.call(this, scopedHostCanvasFont(String(value)) ?? memoSubstituteCssFontFamily(String(value)));',
  },
}

/** The patches the studio build applies, in order; the SDK's own is applied by the renderer builds. */
export const STUDIO_PATCHES = /** @type {const} */ ([
  'studio-scheme',
  'studio-password-flag',
  'studio-plugin-allow',
  'studio-table-delete-at',
  'studio-nested-table-delete',
  'studio-nested-table-cut',
  'studio-nested-table-command',
  'studio-hancom-shortcuts',
  'studio-hancom-labels',
  'studio-hancom-commands',
  'studio-hancom-chords',
  'studio-hancom-page-number',
  'studio-font-memo-state',
  'studio-font-memo-use',
])

/** Whether a patch is written against this file. */
export function patchTargets(name, file) {
  const patch = PATCHES[name]
  if (!patch) throw new Error(`rhwp patch: unknown patch "${name}"`)
  return patch.file.test(file)
}

/**
 * @param {keyof typeof PATCHES} name
 * @param {string} code
 * @returns {string}
 */
/**
 * What the app's plugin uses of the studio beyond the plugin host: the editor's caret, to
 * show a change, to read the selection and to select a word, and the pages' places and the
 * zoom, to mark its changes on the pages. The host hands out none of it; the plugin reaches
 * it through a command it registers, which the studio calls with its own services. These
 * are names inside the studio, not a contract, so the build looks for them in the source
 * it fetched: a release that renames one fails the build instead of turning those things
 * off without a word.
 */
export const pluginHooks = [
  {
    file: 'src/engine/cursor.ts',
    needles: [
      'hasSelection(): boolean',
      'getSelectionOrdered()',
      'clearSelection(): void',
      'moveTo(pos: DocumentPosition): void',
      'setAnchor(): void',
      'getPosition(): DocumentPosition',
      'isInCellSelectionMode(): boolean',
      'getSelectedCellRange()',
      'getCellTableContext()',
      'getExcludedCells()',
    ],
  },
  {
    file: 'src/engine/input-handler.ts',
    needles: [
      'private cursor: CursorState',
      'updateCaret(',
      'private virtualScroll: VirtualScroll',
      'private emitCursorFormatState(): void',
    ],
  },
  {
    file: 'src/command/types.ts',
    needles: [
      'getInputHandler: () => InputHandler | null',
      'getViewportManager: () => ViewportManager | null',
      'execute: (services: CommandServices, params?: Record<string, unknown>) => void',
    ],
  },
  // the toolbar's style list the plugin refills after styles change: options valued by
  // style number, shown by number at the caret, applied by number when picked; the caret's
  // state is sent again after a refill
  {
    file: 'src/ui/toolbar.ts',
    needles: [
      "querySelector('#style-name')",
      'opt.value = String(style.id)',
      'this.styleName.value = String(info.id)',
      'const styleId = parseInt(this.styleName.value)',
    ],
  },
  // where the marks of the plugin's changes go: the pages' places and the zoom
  {
    file: 'src/view/virtual-scroll.ts',
    needles: [
      'getPageOffset(pageIdx: number): number',
      'getPageLeftResolved(pageIdx: number, containerWidth: number): number',
    ],
  },
  { file: 'src/view/viewport-manager.ts', needles: ['getZoom(): number'] },
  { file: 'index.html', needles: ['<div id="scroll-content"></div>'] },
  { file: 'src/automation/types.ts', needles: ['registerCommand(def: ExtCommandDef): void'] },
]

/**
 * What studio-plugin/hancom-keys.mjs uses of the studio, on the same terms as pluginHooks: the
 * caret and the key handler its commands drive, and the shortcut entries it takes out.
 */
export const hancomHooks = [
  {
    file: 'src/engine/cursor.ts',
    needles: [
      'moveToLineStart(): void',
      'moveToLineEnd(): void',
      'moveHorizontal(delta: number): void',
      'getSelection(): { anchor: DocumentPosition; focus: DocumentPosition } | null',
      'isInHeaderFooter(): boolean',
      'isInFootnote(): boolean',
      'isInPictureObjectSelection(): boolean',
      'isInTableObjectSelection(): boolean',
    ],
  },
  {
    file: 'src/engine/input-handler.ts',
    needles: [
      'private dispatcher: CommandDispatcher | null',
      'private _cellBlockLetterImeGuard = new CellBlockLetterImeGuard()',
      'private deleteSelection(',
      'applyStyle(styleId: number): void',
      'executeOperation(desc: OperationDescriptor): void',
      'isFormMode(): boolean',
      "eventBus.on('format-char'",
    ],
  },
  {
    file: 'src/command/dispatcher.ts',
    needles: ['dispatch(commandId: string', 'isEnabled(commandId: string): boolean'],
  },
  { file: 'src/command/contextual-shortcut.ts', needles: ['arm('] },
  {
    file: 'src/core/wasm-bridge.ts',
    needles: [
      'getStyleList(): Array<{ id: number',
      'evaluateTableFormula(sec: number, parentPara: number, controlIdx: number,',
      'getCellParagraphCount(sec: number, parentPara: number, controlIdx: number, cellIdx: number)',
      'getCellParagraphLength(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number)',
      'getCellInfo(sec: number, parentPara: number, controlIdx: number, cellIdx: number): CellInfo',
      'searchText(query: string, fromSec: number, fromPara: number, fromChar: number, forward: boolean',
    ],
  },
  // the studio parts the studio-hancom-commands patch hands to the new commands
  {
    file: 'src/ui/dialog.ts',
    needles: [
      'export abstract class ModalDialog',
      'protected abstract createBody(): HTMLElement;',
      'protected abstract onConfirm(): void | boolean;',
    ],
  },
  {
    file: 'src/ui/find-dialog.ts',
    needles: [
      "static lastQuery = '';",
      'static lastCaseSensitive = false;',
      'export function navigateToSearchHit(',
    ],
  },
  { file: 'src/engine/command.ts', needles: ['export class InsertTextCommand'] },
  // what installHancomMainKeys is handed where the commands are registered
  {
    file: 'src/main.ts',
    needles: [
      'let inputHandler: InputHandler | null = null;',
      'const dispatcher = new CommandDispatcher(',
    ],
  },
  {
    // the entries adaptToHancom takes out (REMOVED_SHORTCUTS), as the studio writes them
    file: 'src/command/shortcut-map.ts',
    needles: [
      "[{ key: 'y', ctrl: true }, 'edit:redo']",
      "[{ key: 'h', alt: true, shift: true }, 'format:align-right']",
      "[{ key: 'ㅗ', alt: true, shift: true }, 'format:align-right']",
      "[{ key: 'c', alt: true, shift: true }, 'format:align-center']",
      "[{ key: 'ㅊ', alt: true, shift: true }, 'format:align-center']",
      "[{ key: 'd', alt: true, shift: true }, 'format:align-distribute']",
      "[{ key: 'ㅇ', alt: true, shift: true }, 'format:align-distribute']",
      "[{ key: '0', ctrl: true }, 'view:zoom-100']",
    ],
  },
]

/**
 * The studio commands the Hangul keys run that the studio's command sources no longer name;
 * `sources` is the text of every file in src/command/commands.
 */
export function missingHancomCommands(sources) {
  // a numbered command may be made from a template, as `view:zoom-${pct}` is
  const named = (id) =>
    sources.includes(`'${id}'`) ||
    (/-\d+$/.test(id) && sources.includes('`' + id.replace(/\d+$/, '${')))
  return studioCommandIds().filter((id) => !named(id))
}

/** The hooks a studio source tree lacks; `read` gives the text of one of its files, or null. */
export function missingPluginHooks(read) {
  const missing = []
  for (const { file, needles } of [...pluginHooks, ...hancomHooks]) {
    const text = read(file)
    for (const needle of needles) {
      if (text === null || !text.includes(needle)) missing.push(`${file}: ${needle}`)
    }
  }
  return missing
}

export function applyPatch(name, code) {
  const patch = PATCHES[name]
  if (!patch) throw new Error(`rhwp patch: unknown patch "${name}"`)
  // a checkout on Windows may carry CRLF; the patches are written with LF
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  // a patch is one replacement, or (edits) several in the same file, each found exactly once
  let next = code
  for (const edit of patch.edits ?? [patch]) {
    const find = edit.find.replaceAll('\n', eol)
    const first = next.indexOf(find)
    if (first === -1 || next.indexOf(find, first + 1) !== -1) {
      throw new Error(
        `rhwp patch ${name}: expected exactly one occurrence of the text to replace; ` +
          'the upstream source changed, review apps/hwp/scripts/rhwp-patches.mjs',
      )
    }
    const replace = edit.replace.replaceAll('\n', eol)
    next = next.replace(find, () => replace)
  }
  return next
}

/**
 * Vite plugin applying the named patches during a production build. Dev
 * servers load the renderer over http://localhost, where the unpatched SDK
 * check already passes; the studio is always a production build.
 *
 * @param {...keyof typeof PATCHES} names
 * @returns {import('vite').Plugin}
 */
export function rhwpPatches(...names) {
  const applied = new Set()
  return {
    name: `rhwp-patches:${names.join('+')}`,
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      let next = code
      for (const name of names) {
        if (!PATCHES[name].file.test(file)) continue
        next = applyPatch(name, next)
        applied.add(name)
      }
      return next === code ? null : { code: next, map: null }
    },
    buildEnd() {
      const missing = names.filter((name) => !applied.has(name))
      if (missing.length > 0) {
        this.error(`rhwp patches never applied: ${missing.join(', ')} (file not loaded)`)
      }
    },
  }
}
