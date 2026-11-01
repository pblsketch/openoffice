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
 * studio-hancom-equal-cells, studio-hancom-chords
 *   A Hangul tab takes Hancom Hangul's keys (decision 0060). The table of them and
 *   the commands rhwp lacks live in studio-plugin/hancom-keys.mjs; these patches
 *   only hook it in. The studio's shortcut table is adapted in place, its command
 *   registry shows the new keys next to the menu items, the new commands are
 *   registered (with the studio parts they build on) and put into the menus, its
 *   two stub "equal cell size" commands hand over to the app's own equalizer, and
 *   its key handler hands the Ctrl+N/K/Q/M/G sequences, the keys that depend on
 *   the caret (the easy table formulas, Ctrl+Enter/Ctrl+Backspace in a cell, a cell
 *   block's letters, Enter and F3, and the format keys that act on the whole block)
 *   and the table-object keys (P/T/L/C/Ctrl+E) to the module, on the IME path too.
 *
 * studio-hancom-cell-props-block
 *   The studio's 표/셀 속성 writes its cell tab into the cell the caret is in, even when
 *   it was opened on a cell block. Hangul writes it into every selected cell. The
 *   dialog's apply hands what it wrote to studio-plugin/hancom-keys.mjs
 *   (hancomBlockCellProps), which writes what the user changed into the other cells
 *   of the block, in the same undo step.
 *
 * studio-hancom-row-drag
 *   Hangul's plain drag of a horizontal table border sizes the row above it and the table
 *   (help: 표 크기 조절); Alt+drag lets the row below give way. The studio did the latter on a
 *   plain drag and capped it by the row below's stored height, about 1 mm in any table. The
 *   drag end asks studio-plugin/hancom-keys.mjs (hancomRowDragUpdates) first, and the drag may
 *   go below the next line.
 *
 * studio-hancom-block-format-dialogs
 *   On a cell block the studio's 글자 모양 (Alt+L) wanted a text selection and did
 *   nothing, and its 문단 모양 (Alt+T) formatted the caret's paragraph alone. Hangul
 *   formats every selected cell. Opened on a block, each dialog now applies through the
 *   editor's own block path (the format-char event, applyParaPropsAtCursor).
 *
 * studio-hancom-page-number
 *   The bridge gains the two engine calls of vendor/rhwp-core patch 0014, setting and
 *   reading a section's page number (Hangul's 쪽 번호 매기기).
 *
 * studio-quick-correct
 *   Hangul's 빠른 교정 turns a straight quote typed into the document into a curly one,
 *   opening after a blank (도구 → 빠른 교정 → 빠른 교정 내용 → 입력 자동 서식). The typed text
 *   goes through studio-plugin/hancom-keys.mjs (quickCorrectTyped) before the editor puts it
 *   in the document, so what is pasted, dropped or still composing is left alone.
 *
 * studio-format-copy-safety, studio-format-copy, studio-format-copy-state
 *   The studio's format copy takes the cell's field name and form-edit flag with
 *   the cell's look; copying a plain cell over a named cell in a cell block
 *   therefore removes the cell field. The safety patch drops those two keys.
 *   The other two patches hand the two format commands to the app's own module
 *   (studio-plugin/format-copy.mjs) — a Hancom-style dialog, one undo step for
 *   one apply, and a copied format that lasts until it is overwritten — and make
 *   the editor's "has copied format" answer come from that module.
 *
 * studio-single-cell-resize
 *   The bridge gains the one-cell resize call of vendor/rhwp-core patch 0016, which
 *   moves one cell's right or bottom boundary and its next cell's opposite boundary
 *   (Hangul's Shift+arrow). The engine keeps the resulting irregular grid as spans.
 *   It also gains setTableCellExtents of patch 0027, which places cells at given starts
 *   and ends along one axis: Hangul's H/W and Shift+↑/↓ (studio-plugin/table-sizes.mjs).
 *
 * studio-merged-row-below
 *   "Insert row below" in a merged cell takes the cell's last row, so the new row lands
 *   below the merge instead of growing it. A caret in a plain cell inside another merge
 *   keeps that cell's row, because Hangul grows the merge there.
 *
 * studio-table-props-border-bg, studio-table-props-menu-label
 *   The studio's 표/셀 속성 dialog shows the table's border and fill tabs only with the
 *   table object selected, so from a cell (where the menu opens it) a table's own fill,
 *   such as a black one, could not be changed. Like Hangul, the dialog has them from a cell
 *   too, and the cell menu names it 표/셀 속성. The dialog used to send the border and fill
 *   it showed on every OK, and the engine gives those to the table and to every cell: an
 *   untouched OK wiped each cell's own lines and fill. It now sends only what changed
 *   (vendor/rhwp-core patch 0021 then keeps the rest of each cell's look).
 *
 * studio-memo-command, studio-memo-label-ko, studio-memo-label-en
 *   The studio's Insert > Comment item is a stub. It becomes the app's memo: with a
 *   document open outside form mode it sends `ieum:memo-insert` to the window the app
 *   listens on, and the menu names it 메모 (Memo) in the studio's two languages.
 *
 * studio-memo-context-menu
 *   The right-click menus of body text and of a table cell gain the same 메모 command,
 *   so a selection can take a memo without going to the Insert menu. The menu keeps the
 *   selection, and the memo editor reads it when it opens.
 *
 * studio-memo-anchors, studio-memo-delete-undo
 *   The engine drops a memo when Backspace or Delete removes the last character of its
 *   anchor (vendor/rhwp-core patch 0018, decision 0072). The studio's undo of a typed
 *   deletion only puts the text back, so the memo stayed gone. The bridge gains a call
 *   for the memo anchors, and a deletion that touches one captures its paragraph first,
 *   as the studio already does for a link, so undo restores the paragraph with the memo.
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
 *
 * studio-pc-fonts
 *   The studio lists the PC's fonts only after the 찾기 button of its options dialog,
 *   so its font lists held the base fonts and the document's own until then. At start-up
 *   it now asks the PC for its font list and detects anew when that differs from the
 *   kept one (studio-plugin/pc-fonts.mjs), then tells the font lists as the button does.
 */

import { CLIPBOARD_HTML_MODULE } from '../studio-plugin/clipboard-html.mjs'
import { HANCOM_KEYS_MODULE, studioCommandIds } from '../studio-plugin/hancom-keys.mjs'
import { PC_FONTS_MODULE } from '../studio-plugin/pc-fonts.mjs'

/** Must equal RENDERER_SCHEME in packages/electron-utils/src/renderer-scheme.ts. */
export const APP_SCHEME = 'genoffice-app'

/** Field the studio-password-flag patch adds to the studio's command context. */
export const PASSWORD_FLAG = 'passwordProtected'

/** Module specifier the studio-plugin-allow patch imports; build-studio.mjs aliases it. */
export const AGENT_PLUGIN_MODULE = '@ieum/agent-plugin'

/** Module specifier the studio-hancom-* patches import; build-studio.mjs aliases it. */
export { HANCOM_KEYS_MODULE }

/** Module specifier the studio-format-copy patches import; build-studio.mjs aliases it. */
export const FORMAT_COPY_MODULE = '@ieum/format-copy'

/** Module specifier the studio-clipboard-objects patch imports; build-studio.mjs aliases it. */
export { CLIPBOARD_HTML_MODULE }

/** Module specifier the studio-pc-fonts patch imports; build-studio.mjs aliases it. */
export { PC_FONTS_MODULE }

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
          "import { InsertTextCommand, InsertTabCommand } from '@/engine/command';\n" +
          "import { ModalDialog } from '@/ui/dialog';\n" +
          "import { FindDialog, navigateToSearchHit } from '@/ui/find-dialog';\n" +
          "import { CellBorderBgDialog } from '@/ui/cell-border-bg-dialog';\n" +
          "import { TableCellPropsDialog } from '@/ui/table-cell-props-dialog';\n" +
          "import { showToast } from '@/ui/toast';\n" +
          `import { hancomCommands, installHancomMainKeys, installHancomMenuItems, installHanjaKey } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the new commands, with the studio parts they build on, and their menu items
      {
        find: 'registry.registerAll(toolCommands);',
        replace:
          'registry.registerAll(toolCommands);\n' +
          'registry.registerAll(hancomCommands(getLocale(), {\n' +
          '  InsertTextCommand, InsertTabCommand, ModalDialog, FindDialog, navigateToSearchHit,\n' +
          '  CellBorderBgDialog, TableCellPropsDialog, showToast,\n' +
          '}));\n' +
          'installHancomMenuItems(document, getLocale());\n' +
          '// the keys the main process takes first and hands back for the table (decision 0060)\n' +
          'installHancomMainKeys(window, () => inputHandler, dispatcher);\n' +
          '// the Hanja key on a word already typed (the input method only converts while composing)\n' +
          'installHanjaKey(window, () => inputHandler, dispatcher);',
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
  'studio-quick-correct': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-text\.ts$/,
    edits: [
      {
        find: "import { showConfirm } from '@/ui/confirm-dialog';",
        replace:
          "import { showConfirm } from '@/ui/confirm-dialog';\n" +
          `import { quickCorrectTyped } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the typed character, before the editor decides what to do with it
      {
        find: '  const text = this.textarea.value;',
        replace: '  const text = quickCorrectTyped(this, this.textarea.value, e?.inputType);',
      },
    ],
  },
  'studio-format-copy-safety': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    // a cell's own look is not its form field: copying a plain cell over a named one in
    // a cell block must not clear the named cell's field
    find: ["  'cellProtect',", "  'fieldName',", "  'editableInForm',", "  'borderFillId',"].join(
      '\n',
    ),
    replace: ["  'cellProtect',", "  'borderFillId',"].join('\n'),
  },
  'studio-format-copy': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]edit\.ts$/,
    edits: [
      {
        find: "import { canExecuteFormatPaste } from '../format-paste-availability';",
        replace: [
          "import { canExecuteFormatPaste } from '../format-paste-availability';",
          "import { ApplyCharFormatCommand, ApplyParaFormatCommand } from '@/engine/command';",
          "import { selectCellIndicesInRange, paraFormatTargetsForCellBlock, withCellPathTarget } from '@/engine/cell-block-format';",
          "import { getLocale } from '@/i18n/core.ts';",
          "import { ModalDialog } from '@/ui/dialog';",
          "import { showToast } from '@/ui/toast';",
          `import { ieumFormatCopy, ieumFormatPaste } from '${FORMAT_COPY_MODULE}';`,
        ].join('\n'),
      },
      {
        find: [
          'let compareSessionStore: CompareSessionStore | null = null;',
          '',
          'export const editCommands: CommandDef[] = [',
        ].join('\n'),
        replace: [
          'let compareSessionStore: CompareSessionStore | null = null;',
          '',
          '/** The studio parts the app format-copy module builds on. */',
          'function formatCopyStudio() {',
          '  return {',
          '    ModalDialog,',
          '    showToast,',
          '    ApplyCharFormatCommand,',
          '    ApplyParaFormatCommand,',
          '    selectCellIndicesInRange,',
          '    paraFormatTargetsForCellBlock,',
          '    withCellPathTarget,',
          '    locale: getLocale(),',
          '  };',
          '}',
          '',
          'export const editCommands: CommandDef[] = [',
        ].join('\n'),
      },
      {
        find: [
          "    id: 'edit:format-copy',",
          "    label: t('command.edit.formatCopy.label'),",
          "    icon: 'icon-format-copy',",
          "    shortcutLabel: 'Alt+C',",
          '    canExecute: (ctx) => ctx.hasDocument,',
        ].join('\n'),
        replace: [
          "    id: 'edit:format-copy',",
          "    label: t('command.edit.formatCopy.label'),",
          "    icon: 'icon-format-copy',",
          "    shortcutLabel: 'Alt+C',",
          '    canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,',
        ].join('\n'),
      },
      {
        find: [
          '    execute(services) {',
          '      services.getInputHandler()?.performFormatCopy();',
          '    },',
        ].join('\n'),
        replace: [
          '    execute(services) {',
          '      ieumFormatCopy(services, formatCopyStudio());',
          '    },',
        ].join('\n'),
      },
      {
        find: [
          '    execute(services) {',
          '      services.getInputHandler()?.performFormatPaste();',
          '    },',
        ].join('\n'),
        replace: [
          '    execute(services) {',
          '      ieumFormatPaste(services, formatCopyStudio());',
          '    },',
        ].join('\n'),
      },
    ],
  },
  'studio-format-copy-state': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    edits: [
      {
        find: "import { selectCellIndicesInRange, paraFormatTargetsForCellBlock, withCellPathTarget } from './cell-block-format';",
        replace: [
          "import { selectCellIndicesInRange, paraFormatTargetsForCellBlock, withCellPathTarget } from './cell-block-format';",
          `import { ieumHasCopiedFormat } from '${FORMAT_COPY_MODULE}';`,
        ].join('\n'),
      },
      {
        find: '  hasCopiedFormat(): boolean { return this.formatCopyState !== null; }',
        replace: '  hasCopiedFormat(): boolean { return ieumHasCopiedFormat(this); }',
      },
    ],
  },
  'studio-single-cell-resize': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    // the engine call of vendor/rhwp-core patch 0016, ahead of a neighbour the bridge has once
    find: '  moveTableOffset(sec: number, parentPara: number, controlIdx: number, deltaH: number, deltaV: number): { ok: boolean; ppi: number; ci: number } {',
    replace: [
      '  /** One cell boundary (Hangul Shift+arrow): the target and its next cell move oppositely. */',
      '  resizeTableCell(',
      '    sec: number, parentPara: number, controlIdx: number,',
      '    row: number, col: number, vertical: boolean, forward: boolean,',
      '  ): { ok: boolean; moved?: boolean; reason?: string } {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return JSON.parse((this.doc as any).resizeTableCell(sec, parentPara, controlIdx, row, col, vertical, forward));',
      '  }',
      '',
      '  /** Cells placed at given starts and ends along one axis (vendor/rhwp-core patch 0027). */',
      '  setTableCellExtents(',
      '    sec: number, parentPara: number, controlIdx: number, vertical: boolean,',
      '    extents: Array<{ cellIdx: number; start: number; end: number }>,',
      '  ): { ok: boolean; reason?: string } {',
      "    if (!this.doc) throw new Error('문서가 로드되지 않았습니다');",
      '    return JSON.parse((this.doc as any).setTableCellExtents(sec, parentPara, controlIdx, vertical, JSON.stringify(extents)));',
      '  }',
      '',
      '  moveTableOffset(sec: number, parentPara: number, controlIdx: number, deltaH: number, deltaV: number): { ok: boolean; ppi: number; ci: number } {',
    ].join('\n'),
  },
  // Hangul puts a row below a merged cell after the merge's last row, not through its
  // first row. The engine's insertTableRow extends a merge it crosses; using the last
  // row makes the new row sit below it. A caret in a plain cell inside another merge
  // still uses that cell's row, as Hangul does.
  'studio-merged-row-below': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]table\.ts$/,
    edits: [
      {
        find: "import { t } from '../../i18n/index.ts';",
        replace:
          "import { t } from '../../i18n/index.ts';\n" +
          `import { insertRowBelow } from '${HANCOM_KEYS_MODULE}';`,
      },
      {
        find: [
          "          case 'row-below':",
          '            wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, cellInfo.row, true);',
          '            break;',
        ].join('\n'),
        replace: [
          "          case 'row-below': {",
          '            const afterRow = cellInfo.row + Math.max(1, cellInfo.rowSpan || 1) - 1 + i;',
          '            wasm.insertTableRow(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, afterRow, true);',
          '            if ((cellInfo.colSpan || 1) > 1) {',
          '              wasm.mergeTableCells(pos.sectionIndex, pos.parentParaIndex!, pos.controlIndex!, afterRow + 1, cellInfo.col, afterRow + 1, cellInfo.col + Math.max(1, cellInfo.colSpan || 1) - 1);',
          '            }',
          '            break;',
          '          }',
        ].join('\n'),
      },
      {
        find: [
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
        ].join('\n'),
        replace: [
          "    id: 'table:insert-row-below',",
          "    label: t('command.table.insertRowBelow.registryLabel'),",
          '    canExecute: inTable,',
          '    execute(services) {',
          '      insertRowBelow(services);',
          '    },',
          '  },',
        ].join('\n'),
      },
    ],
  },
  'studio-hancom-equal-cells': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]table\.ts$/,
    edits: [
      {
        find: "import { t } from '../../i18n/index.ts';",
        replace:
          "import { t } from '../../i18n/index.ts';\n" +
          "import { getLocale } from '@/i18n/core.ts';\n" +
          `import { equalizeTableCells } from '${HANCOM_KEYS_MODULE}';`,
      },
      {
        // the stub commands were disabled because a per-row/column boundary cannot be
        // stored; equalizing the rows/columns of the selection can, through deltas
        find: [
          '// HWP/HWPX cannot persist independent per-row or per-column geometry. Keep',
          '// commands that require that representation unavailable at command routing.',
          'const localTableGeometryCanPersist = () => false;',
          '',
        ].join('\n'),
        replace: '',
      },
      {
        find: [
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
        ].join('\n'),
        replace: [
          '  {',
          "    id: 'table:cell-height-equal',",
          "    label: t('command.table.cellHeightEqual.label'),",
          "    shortcutLabel: 'H',",
          '    canExecute: inTableOrCellSelection,',
          '    execute(services) {',
          "      equalizeTableCells(services, 'height', getLocale() === 'ko');",
          '    },',
          '  },',
          '  {',
          "    id: 'table:cell-width-equal',",
          "    label: t('command.table.cellWidthEqual.label'),",
          "    shortcutLabel: 'W',",
          '    canExecute: inTableOrCellSelection,',
          '    execute(services) {',
          "      equalizeTableCells(services, 'width', getLocale() === 'ko');",
          '    },',
          '  },',
        ].join('\n'),
      },
    ],
  },
  'studio-hancom-chords': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-keyboard\.ts$/,
    edits: [
      {
        find: "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
        replace:
          "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';\n" +
          `import { hancomCellBlockKey, hancomCellKey, hancomChordKey, hancomChordStart, hancomContextKey, hancomCtrlKey, hancomTableObjectKey } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the second key, first of all (the studio's own Ctrl+K/M/G flags are never set again)
      {
        find: '  this._cellBlockLetterImeGuard?.reset();',
        replace:
          '  this._cellBlockLetterImeGuard?.reset();\n  if (hancomChordKey(this, e)) return;',
      },
      // a table-object key, and H/W in a cell block, before the studio closes the selection
      // on an unhandled letter and lets it into the document
      {
        find: '  if (this.connectorDrawingMode) {',
        replace:
          '  if (hancomTableObjectKey(this, e)) return;\n' +
          '  if (hancomCellBlockKey(this, e, (ev: KeyboardEvent) => matchShortcut(ev, defaultShortcuts))) return;\n' +
          '  if (hancomCellKey(this, e)) return;\n' +
          '  if (this.connectorDrawingMode) {',
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
  // a copied block's pictures and tables reach another document (studio-plugin/clipboard-html.mjs),
  // and a picture or table copied in another editor is not taken for this one's own
  'studio-clipboard-objects': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-keyboard\.ts$/,
    edits: [
      {
        find: "import { tableObjectClipboardTarget } from './table-object-clipboard-target';",
        replace: [
          "import { tableObjectClipboardTarget } from './table-object-clipboard-target';",
          `import { ieumPasteHtmlInCell, ieumPictureHtml, ieumSelectionHtml } from '${CLIPBOARD_HTML_MODULE}';`,
        ].join('\n'),
      },
      {
        find: '          html = this.wasm.exportSelectionHtml(',
        replace: '          html = ieumSelectionHtml(this.wasm,',
      },
      // the engine's HTML paste into a cell drops the pictures; the app puts them in the cell
      {
        find: [
          '        result = wasm.pasteHtmlInCellByPath(',
          '          p.sectionIndex, p.parentParaIndex!, JSON.stringify(p.cellPath), p.charOffset, htmlForCore,',
          '        );',
        ].join('\n'),
        replace: [
          '        result = ieumPasteHtmlInCell(wasm, p, htmlForCore, (part: string) => wasm.pasteHtmlInCellByPath(',
          '          p.sectionIndex, p.parentParaIndex!, JSON.stringify(p.cellPath), p.charOffset, part,',
          '        ));',
        ].join('\n'),
      },
      {
        find: [
          '        result = wasm.pasteHtmlInCell(',
          '          p.sectionIndex, p.parentParaIndex, p.controlIndex!,',
          '          p.cellIndex!, p.cellParaIndex!, p.charOffset, htmlForCore,',
          '        );',
        ].join('\n'),
        replace: [
          '        result = ieumPasteHtmlInCell(wasm, p, htmlForCore, (part: string) => wasm.pasteHtmlInCell(',
          '          p.sectionIndex, p.parentParaIndex!, p.controlIndex!,',
          '          p.cellIndex!, p.cellParaIndex!, p.charOffset, part,',
          '        ));',
        ].join('\n'),
      },
      // the studio pastes its own engine clipboard when the plain text is the same "[그림]"/"[표]"
      // as its last copied object, for a browser that drops the HTML; HTML marked by another
      // editor (another tab) is that editor's copy
      {
        find: '    text === internalClipboardText;',
        replace: [
          '    text === internalClipboardText &&',
          '    readRhwpClipboardToken(html) === null;',
        ].join('\n'),
      },
      // a picture copied in another editor also lies on the clipboard as a picture file, at its
      // own pixel size; that editor's HTML has the size the picture had in its document
      {
        find: ['  const items = clipboardData?.items;', '  if (items) {'].join('\n'),
        replace: [
          '  const items = clipboardData?.items;',
          '  if (items && readRhwpClipboardToken(html) === null) {',
        ].join('\n'),
      },
      // a picture file from the clipboard went in with insertPicture, floating at the paper's top
      // left corner in the body and over the text in a cell; as HTML it goes in at the caret
      {
        find: '    // 스냅샷으로 삽입 (Undo 지원)\n',
        replace: [
          '    const ieumHtml = ieumPictureHtml(data, ext, wHwp, hHwp);',
          '    if (ieumHtml) {',
          "      pasteExternalHtml.call(this, ieumHtml, '', hasSelection);",
          '      return;',
          '    }',
          '    // 스냅샷으로 삽입 (Undo 지원)',
          '',
        ].join('\n'),
      },
      // Hangul's document model is pasted in the body only; elsewhere the studio goes on to the
      // HTML path. Its snapshot step said "skipped" with undefined, which the history takes for
      // the caret's new place: the caret lost its cell and the HTML landed at the body's top.
      // null is the history's "nothing changed"
      {
        find: '        if (p.parentParaIndex !== undefined) return undefined;',
        replace: '        if (p.parentParaIndex !== undefined) return null;',
      },
      {
        find: '        if (!parsed.ok) return undefined;',
        replace: '        if (!parsed.ok) return hasSelection ? this.cursor.getPosition() : null;',
      },
    ],
  },
  'studio-memo-command': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]insert\.ts$/,
    find: "  stub('insert:comment', t('command.insert.comment.label'), 'icon-comment'),",
    replace: [
      '  {',
      "    id: 'insert:comment',",
      "    label: t('command.insert.comment.label'),",
      "    icon: 'icon-comment',",
      '    canExecute: (ctx) => ctx.hasDocument && !ctx.isFormMode,',
      '    execute() {',
      '      // the app listens on this window and opens its memo editor',
      "      globalThis.dispatchEvent(new CustomEvent('ieum:memo-insert'));",
      '    },',
      '  },',
    ].join('\n'),
  },
  'studio-memo-context-menu': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    edits: [
      // the menu of body text (and of a header or footer)
      {
        find:
          "      { type: 'command', commandId: 'format:para-num-shape', label: '문단 번호 모양(N)...' },\n" +
          '    ];',
        replace:
          "      { type: 'command', commandId: 'format:para-num-shape', label: '문단 번호 모양(N)...' },\n" +
          "      { type: 'separator' },\n" +
          "      { type: 'command', commandId: 'insert:comment' },\n" +
          '    ];',
      },
      // the menu inside a table cell, after the cell's own commands
      {
        find:
          "      { type: 'command', commandId: 'table:formula', label: '계산식(F)...' },\n" +
          "      { type: 'separator' },",
        replace:
          "      { type: 'command', commandId: 'table:formula', label: '계산식(F)...' },\n" +
          "      { type: 'separator' },\n" +
          "      { type: 'command', commandId: 'insert:comment' },\n" +
          "      { type: 'separator' },",
      },
    ],
  },
  'studio-memo-label-ko': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]i18n[\\/]locales[\\/]ko\.ts$/,
    find: '  "command.insert.comment.label": "주석",',
    replace: '  "command.insert.comment.label": "메모",',
  },
  'studio-memo-label-en': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]i18n[\\/]locales[\\/]en\.ts$/,
    find: '  "command.insert.comment.label": "Comments",',
    replace: '  "command.insert.comment.label": "Memo",',
  },
  'studio-table-props-border-bg': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]ui[\\/]table-cell-props-dialog\.ts$/,
    edits: [
      {
        find: "import { t as i18nText } from '../i18n/index.ts';",
        replace: [
          "import { t as i18nText } from '../i18n/index.ts';",
          '',
          '/**',
          " * ieum: the table's border and fill go to the engine only when the dialog changed them.",
          ' * The engine hands what it gets to the table and to every cell, so sending the values the',
          " * dialog merely showed would overwrite each cell's own lines and fill. The dialog shows a",
          ' * fill it cannot edit (gradient, picture) as none, and has no "no pattern" choice: an',
          ' * unpatterned fill reads as an empty choice, and a solid fill is written with pattern -1',
          ' * (the engine writes 0 otherwise, which Hangul draws as horizontal lines).',
          ' */',
          'function ieumKeepUnchangedTableLook(next: Record<string, unknown>, now: TableProperties): void {',
          "  const sides = ['borderLeft', 'borderRight', 'borderTop', 'borderBottom'] as const;",
          "  const color = (value: unknown) => String(value ?? '').toLowerCase();",
          '  const pattern = (value: unknown) => {',
          '    const n = Number(value);',
          '    return Number.isFinite(n) && n > 0 ? n : 0;',
          '  };',
          '  const sameLine = (a: any, b: any) =>',
          '    !!a && !!b && a.type === b.type && a.width === b.width && color(a.color) === color(b.color);',
          '  if (sides.every((side) => sameLine(next[side], (now as any)[side]))) {',
          '    for (const side of sides) delete next[side];',
          '  }',
          '  if (next.fillType === undefined) return;',
          "  const wasSolid = now.fillType === 'solid';",
          "  const unchanged = next.fillType === 'none'",
          '    ? !wasSolid',
          '    : wasSolid &&',
          '      color(next.fillColor) === color(now.fillColor) &&',
          '      pattern(next.patternType) === pattern(now.patternType) &&',
          '      (pattern(next.patternType) === 0 || color(next.patternColor) === color(now.patternColor));',
          '  if (unchanged) {',
          "    for (const key of ['fillType', 'fillColor', 'patternColor', 'patternType']) delete next[key];",
          "  } else if (next.fillType === 'solid' && pattern(next.patternType) === 0) {",
          '    next.patternType = -1;',
          '  }',
          '}',
        ].join('\n'),
      },
      // Hangul's 표/셀 속성 opened from a cell has the table's border and fill tabs too
      {
        find:
          '      // 표 선택 시에만 테두리·배경 탭 표시 (셀 선택 시 별도 "셀 테두리/배경" 대화상자 사용)\n' +
          "      ...(this.mode === 'table' ? [",
        replace:
          "      // ieum: from a cell too, like Hangul's 표/셀 속성 (the cells' own look stays in 셀 테두리/배경)\n" +
          '      ...(true ? [',
      },
      {
        find: "    if (this.mode === 'table' && this.borderTarget === 'table' && this.borderEdits) {",
        replace: "    if (this.borderTarget === 'table' && this.borderEdits) {",
      },
      {
        find: "    if (this.mode === 'table' && this.bgTarget === 'table' && this.bgColorRadio) {",
        replace: "    if (this.bgTarget === 'table' && this.bgColorRadio) {",
      },
      {
        find:
          '    const applyProps = () => {\n' +
          '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);',
        replace:
          '    ieumKeepUnchangedTableLook(newTableProps, this.tableProps);\n' +
          '    const applyProps = () => {\n' +
          '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);',
      },
    ],
  },
  'studio-hancom-cell-props-block': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]ui[\\/]table-cell-props-dialog\.ts$/,
    edits: [
      {
        find: "import { t as i18nText } from '../i18n/index.ts';",
        replace:
          "import { t as i18nText } from '../i18n/index.ts';\n" +
          `import { hancomBlockCellProps } from '${HANCOM_KEYS_MODULE}';`,
      },
      // the other cells of a block take the cell tab too, in the same undo step
      {
        find: [
          '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);',
          '      this.wasm.setTableProperties(',
        ].join('\n'),
        replace: [
          '      this.wasm.setCellProperties(sec, ppi, ci, this.cellIdx, newCellProps as Partial<CellProperties>);',
          '      hancomBlockCellProps(this, newCellProps);',
          '      this.wasm.setTableProperties(',
        ].join('\n'),
      },
    ],
  },
  'studio-hancom-row-drag': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-table\.ts$/,
    edits: [
      {
        find: "import { showToast } from '@/ui/toast';",
        replace:
          "import { showToast } from '@/ui/toast';\n" +
          `import { hancomRowDragUpdates } from '${HANCOM_KEYS_MODULE}';`,
      },
      // a horizontal border may go past the next line: the table grows below it
      {
        find: '    max: next === undefined ? Infinity : next - minSizePx,',
        replace:
          "    max: next === undefined || edge.type === 'row' ? Infinity : next - minSizePx,",
      },
      {
        find: "  if (state.edge.type === 'col' && inCellSel && range) {",
        replace: [
          "  // ieum: Hangul's plain drag of a horizontal border sizes the row above and the table",
          '  const ieumRowDrag = hancomRowDragUpdates(this, state, deltaHwpUnit, e.altKey);',
          '  if (ieumRowDrag) {',
          '    updates = ieumRowDrag;',
          '    if (updates.length === 0) {',
          '      this.cleanupResizeDrag();',
          '      return;',
          '    }',
          "  } else if (state.edge.type === 'col' && inCellSel && range) {",
        ].join('\n'),
      },
    ],
  },
  'studio-hancom-block-format-dialogs': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]command[\\/]commands[\\/]format\.ts$/,
    edits: [
      // 글자 모양 on a cell block: the studio wanted a text selection and did nothing
      {
        find: '      const savedSel = ih.getSelection();\n      if (!savedSel) return;',
        replace: [
          '      const savedSel = ih.getSelection();',
          "      // ieum: on a cell block (F5) the dialog formats every selected cell, as Hangul's does",
          '      const ieumBlock = ih.isInCellSelectionMode();',
          '      if (!savedSel && !ieumBlock) return;',
        ].join('\n'),
      },
      {
        find: '        ih.applyCharPropsToRange(savedSel.start, savedSel.end, mods);',
        replace: [
          "        // the editor's own block path (format-char), one undo step for the block",
          "        if (ieumBlock) services.eventBus.emit('format-char', mods);",
          '        else if (savedSel) ih.applyCharPropsToRange(savedSel.start, savedSel.end, mods);',
        ].join('\n'),
      },
      // 문단 모양 on a cell block: the studio formatted the caret's paragraph alone
      {
        find: [
          '      dialog.onApply = (mods) => {',
          '        ih.applyParaPropsToRange(range.start, range.end, mods);',
          '      };',
        ].join('\n'),
        replace: [
          "      // ieum: on a cell block (F5) every selected cell's paragraphs, as Hangul's does",
          '      const ieumBlock = ih.isInCellSelectionMode();',
          '      dialog.onApply = (mods) => {',
          '        if (ieumBlock) ih.applyParaPropsAtCursor(mods);',
          '        else ih.applyParaPropsToRange(range.start, range.end, mods);',
          '      };',
        ].join('\n'),
      },
    ],
  },
  'studio-table-props-menu-label': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler\.ts$/,
    // the cell menu opens the whole 표/셀 속성 dialog; Hangul names it so
    find: "      { type: 'command', commandId: 'table:cell-props', label: '셀 속성...' },",
    replace: "      { type: 'command', commandId: 'table:cell-props', label: '표/셀 속성(P)...' },",
  },
  'studio-memo-anchors': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]core[\\/]wasm-bridge\.ts$/,
    // the memo list of vendor/rhwp-core patch 0018, ahead of a neighbour the bridge has once
    find: '  getHyperlinkContext(target: HyperlinkTarget): HyperlinkContext {',
    replace: [
      '  /** The memo anchors of the document; none from an engine without memos. */',
      '  getMemoAnchors(): {',
      '    sectionIndex: number;',
      '    paraIndex: number | null;',
      '    startCharIdx: number | null;',
      '    endCharIdx: number | null;',
      '    path: { controlIndex: number; cellIndex?: number; paraIndex: number }[] | null;',
      '  }[] {',
      '    const doc = this.doc as any;',
      "    if (!doc || typeof doc.getMemoList !== 'function') return [];",
      '    return JSON.parse(doc.getMemoList());',
      '  }',
      '',
      '  getHyperlinkContext(target: HyperlinkTarget): HyperlinkContext {',
    ].join('\n'),
  },
  'studio-memo-delete-undo': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]command\.ts$/,
    edits: [
      // whether a deletion touches a memo's anchor, next to the command that asks
      {
        find: 'export class DeleteTextCommand implements EditCommand {',
        replace: [
          "/** Whether deleting `count` characters at `offset` in `target` touches a memo's anchor. */",
          'export function memoAnchorOverlaps(',
          '  wasm: WasmBridge,',
          '  target: ReturnType<typeof hyperlinkTarget>,',
          '  offset: number,',
          '  count: number,',
          '): boolean {',
          '  const path = JSON.stringify(target.cellPath);',
          '  return wasm.getMemoAnchors().some(memo =>',
          '    memo.sectionIndex === target.section',
          '    && memo.paraIndex === target.para',
          '    && JSON.stringify((memo.path ?? []).map(entry =>',
          '      [entry.controlIndex, entry.cellIndex ?? 0, entry.paraIndex])) === path',
          '    && memo.startCharIdx !== null && memo.endCharIdx !== null',
          '    && memo.startCharIdx < memo.endCharIdx',
          '    && offset < memo.endCharIdx && memo.startCharIdx < offset + count);',
          '}',
          '',
          'export class DeleteTextCommand implements EditCommand {',
        ].join('\n'),
      },
      // the engine drops a memo whose whole anchor goes; capture the paragraph as for a link
      {
        find: [
          '      if (context.links.some(link => this.position.charOffset < link.end',
          '        && link.start < this.position.charOffset + this.count)) {',
        ].join('\n'),
        replace: [
          '      if (context.links.some(link => this.position.charOffset < link.end',
          '        && link.start < this.position.charOffset + this.count)',
          '        || memoAnchorOverlaps(wasm, target, this.position.charOffset, this.count)) {',
        ].join('\n'),
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
  'studio-pc-fonts': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]main\.ts$/,
    edits: [
      {
        find: ['  resolveLocalFont,', "} from '@/core/local-fonts';"].join('\n'),
        replace: [
          '  resolveLocalFont,',
          '  getLocalFontRecords,',
          "} from '@/core/local-fonts';",
          `import { refreshPcFonts } from '${PC_FONTS_MODULE}';`,
        ].join('\n'),
      },
      {
        find: ['    setupEventListeners();', '    setupModalFocusRestore();'].join('\n'),
        replace: [
          '    setupEventListeners();',
          '    void refreshPcFonts({',
          '      queryLocalFonts: (globalThis as { queryLocalFonts?: () => Promise<{ family: string; fullName: string; postscriptName: string }[]> }).queryLocalFonts?.bind(globalThis),',
          '      loadStored: loadStoredLocalFonts,',
          '      records: () => getLocalFontRecords({ includeRegistered: true }),',
          '      detect: () => detectLocalFonts({ force: true }),',
          "      changed: () => eventBus.emit('local-fonts-changed', { source: 'pc-fonts' }),",
          '      document,',
          '    });',
          '    setupModalFocusRestore();',
        ].join('\n'),
      },
    ],
  },
  // Paste onto a cell block fills the selected cells (hancom-keys.mjs); the key handler
  // keeps the block for Ctrl+V, and the paste event asks the module before the studio
  // pastes at the caret. Menu "paste" comes through the same event.
  'studio-cell-block-paste': {
    file: /[\\/]rhwp-studio[\\/]src[\\/]engine[\\/]input-handler-keyboard\.ts$/,
    edits: [
      {
        find: "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';",
        replace:
          "import { matchShortcut, defaultShortcuts } from '@/command/shortcut-map';\n" +
          `import { hancomPasteCells } from '${HANCOM_KEYS_MODULE}';`,
      },
      {
        find: [
          '  if (this.isFormMode?.()) return;',
          '',
          '  // 개체/표 선택 모드 해제 후 붙여넣기 진행',
        ].join('\n'),
        replace: [
          '  if (this.isFormMode?.()) return;',
          '  if (hancomPasteCells(this, e)) return;',
          '',
          '  // 개체/표 선택 모드 해제 후 붙여넣기 진행',
        ].join('\n'),
      },
    ],
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
  'studio-hancom-equal-cells',
  'studio-hancom-chords',
  'studio-hancom-page-number',
  'studio-quick-correct',
  'studio-format-copy-safety',
  'studio-format-copy',
  'studio-format-copy-state',
  'studio-single-cell-resize',
  'studio-merged-row-below',
  'studio-clipboard-objects',
  'studio-table-props-border-bg',
  'studio-hancom-cell-props-block',
  'studio-hancom-block-format-dialogs',
  'studio-hancom-row-drag',
  'studio-table-props-menu-label',
  'studio-memo-command',
  'studio-memo-context-menu',
  'studio-memo-label-ko',
  'studio-memo-label-en',
  'studio-memo-anchors',
  'studio-memo-delete-undo',
  'studio-font-memo-state',
  'studio-font-memo-use',
  'studio-cell-block-paste',
  'studio-pc-fonts',
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
      'isInPictureObjectSelection(): boolean',
      // word and paragraph selection in a header, footer or footnote being edited
      'isInHeaderFooter(): boolean',
      "get headerFooterMode(): 'none' | 'header' | 'footer'",
      'get hfSectionIdx(): number',
      'get hfApplyTo(): number',
      'get hfParaIdx(): number',
      'get hfCharOffset(): number',
      'get hfPreviewPage(): number',
      'selectHeaderFooterRange(',
      'getHeaderFooterSelectionOrdered()',
      'isInFootnote(): boolean',
      'get fnSectionIdx(): number',
      'get fnParaIdx(): number',
      'get fnControlIdx(): number',
      'get fnInnerParaIdx(): number',
      'get fnCharOffset(): number',
      'setFnCursorPosition(fnParaIdx: number, charOffset: number): void',
      'setFnAnchor(): void',
      'getFootnoteSelectionOrdered()',
    ],
  },
  {
    file: 'src/core/wasm-bridge.ts',
    needles: [
      'getHeaderFooterParaInfo(sec: number, isHeader: boolean, applyTo: number, hfParaIdx: number): string',
      'getFootnoteInfo(sec: number, para: number, controlIdx: number)',
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
      'isInTextBox(): boolean',
      'isInPictureObjectSelection(): boolean',
      'isInTableObjectSelection(): boolean',
      'getPosition(): DocumentPosition',
      'isInCellSelectionMode(): boolean',
      'getCellTableContext()',
      'getSelectedCellRange(): { startRow: number; startCol: number; endRow: number; endCol: number } | null',
      'enterCellSelectionMode(',
      'advanceCellSelectionPhase(',
      'getCellSelectionPhase(',
      'getCellSelectionFocus(',
      'setCellSelectionAnchor(',
      'setCellSelectionFocus(',
      'exitCellSelectionMode(',
      'moveToCellByIndex(',
      'moveTo(pos: DocumentPosition): void',
      'clearSelection(): void',
      'isProtectedCellSelectionMode(): boolean',
      'getExcludedCells(): Set<string>',
      'hasSelection(): boolean',
      'captureCellSelection(): CellBlockSelectionState | null',
    ],
  },
  {
    file: 'src/engine/input-handler.ts',
    needles: [
      'private dispatcher: CommandDispatcher | null',
      'private _cellBlockLetterImeGuard = new CellBlockLetterImeGuard()',
      'private wasm: WasmBridge',
      'private caret: CaretRenderer',
      'private deleteSelection(',
      'applyStyle(styleId: number): void',
      'executeOperation(desc: OperationDescriptor): void',
      'updateCellSelection(',
      'private cellSelectionRenderer: CellSelectionRenderer | null',
      'private updateCaret(skipScroll',
      'clearSelectedCellBlock(',
      'isFormMode(): boolean',
      'hasCopiedFormat(): boolean { return this.formatCopyState !== null; }',
      'getCharProperties(): CharProperties',
      'getParaProperties(): ParaProperties',
      'getCursorPosition(): DocumentPosition',
      'focus(): void',
      "eventBus.on('format-char'",
      // the typed character, for 빠른 교정 (quickCorrectTyped in hancom-keys.mjs)
      'private getTextAt(pos: DocumentPosition, count: number): string',
      // a cell block's cells (표/셀 속성 on a block) and whether it holds more than one
      'private getSelectedCellBlock(): SelectedCellBlock | null',
      'hasMultiCellSelection(): boolean',
      // Ctrl+Shift+Tab in a cell: the studio's Shift+Tab hanging indent
      'applyHangingIndentAtCursor(): boolean',
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
      'getTextInCell(sec: number, parentPara: number, controlIdx: number,',
      'getParagraphCount(sec: number): number {',
      'getParagraphLength(sec: number, para: number): number {',
      'setTableProperties(sec: number, parentPara: number, controlIdx: number, props: Partial<TableProperties>)',
      'changeShapeZOrder(',
      'getCellInfo(sec: number, parentPara: number, controlIdx: number, cellIdx: number): CellInfo',
      'getTableDimensions(sec: number, parentPara: number, controlIdx: number): TableDimensions',
      'insertTextInCell(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, charOffset: number, text: string)',
      'splitParagraphInCell(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, charOffset: number',
      'deleteRangeInCell(sec: number, parentPara: number, controlIdx: number, cellIdx: number, startCellPara: number',
      'getTableCellBboxes(sec: number,',
      'searchText(query: string, fromSec: number, fromPara: number, fromChar: number, forward: boolean',
      'getCharPropertiesAt(sec: number, para: number, charOffset: number)',
      'getCellCharPropertiesAtByPath(sec: number, parentPara: number, pathJson: string, charOffset: number)',
      'getCellCharPropertiesAt(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, charOffset: number)',
      'getParaPropertiesAt(sec: number, para: number)',
      'getCellParaPropertiesAt(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number)',
      'applyCharFormat(sec: number, para: number, startOffset: number, endOffset: number, propsJson: string)',
      'applyCharFormatInCellByPath(sec: number, parentPara: number, pathJson: string, startOffset: number, endOffset: number, propsJson: string)',
      'applyParaFormat(sec: number, para: number, propsJson: string)',
      'applyParaFormatInCell(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, propsJson: string)',
      'setCharShapeId(sec: number, para: number, startOffset: number, endOffset: number, charShapeId: number)',
      'setCharShapeIdInCellByPath(sec: number, parentPara: number, pathJson: string, startOffset: number, endOffset: number, charShapeId: number)',
      'getCharShapeRuns(sec: number, para: number, start: number, end: number)',
      'setCharShapeRuns(sec: number, para: number, start: number, end: number, runs: CharShapeRun[])',
      'getCharShapeRunsInCellByPath(sec: number, para: number, path: string, start: number, end: number)',
      'setCharShapeRunsInCellByPath(sec: number, para: number, path: string, start: number, end: number, runs: CharShapeRun[])',
      'getCellOwnProperties(sec: number, parentPara: number, controlIdx: number, cellIdx: number): CellProperties',
      'getCellPropertiesByPath(sec: number, parentPara: number, pathJson: string, cellIdx: number): CellProperties',
      'setCellProperties(',
      'getStyleAt(sec: number, para: number)',
      'getCellStyleAt(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number)',
      'applyStyle(sec: number, para: number, styleId: number): { ok: boolean }',
      'applyCellStyle(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, styleId: number)',
      'findOrCreateFontIdForLang(lang: number, name: string): number',
      'getCellParagraphCountByPath(sec: number, parentPara: number, pathJson: string)',
      'getCellParagraphLengthByPath(sec: number, parentPara: number, pathJson: string)',
      'getTableDimensionsByPath(sec: number, parentPara: number, pathJson: string)',
      'getCellInfoByPath(sec: number, parentPara: number, pathJson: string)',
      'runInBatch<T>(fn: () => T): T',
      // the cell copy's table HTML and the 셀 붙이기 dialog's new rows and columns
      "exportControlHtml(sec: number, para: number, ci: number, cellPathJson = ''): string",
      'getCellProperties(sec: number, parentPara: number, controlIdx: number, cellIdx: number): CellProperties',
      'insertTableRow(sec: number, parentPara: number, controlIdx: number, rowIdx: number, below: boolean)',
      'insertTableColumn(sec: number, parentPara: number, controlIdx: number, colIdx: number, right: boolean)',
      'mergeTableCells(sec: number, parentPara: number, controlIdx: number, startRow: number',
      // 문서 정보 reads the document through these (studio-plugin/document-info.mjs)
      'getSectionCount(): number {',
      'getTextRange(sec: number, para: number, charOffset: number, count: number): string {',
      'getTextInCellByPath(sec: number, parentPara: number, pathJson: string, charOffset: number, count: number): string {',
      'getControlTextPositions(sec: number, para: number): number[] {',
      'getTableDimensions(sec: number, parentPara: number, controlIdx: number): TableDimensions {',
      'getTextBoxControlIndex(sec: number, para: number): number {',
      'getLineInfo(sec: number, para: number, charOffset: number): LineInfo {',
      'getLineInfoInCell(sec: number, parentPara: number, controlIdx: number, cellIdx: number, cellParaIdx: number, charOffset: number): LineInfo {',
      'getControlImageMime(sec: number, para: number, ci: number,',
      'getDocumentInfo(): DocumentInfo {',
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
  {
    file: 'src/engine/command.ts',
    needles: [
      'export class InsertTextCommand',
      // the Hanja conversion replaces a word with the studio's overwrite typing (5th argument)
      "    private replacedText = '',",
      'export class ApplyCharFormatCommand',
      'export class ApplyParaFormatCommand',
    ],
  },
  // the drag state hancomRowDragUpdates reads at the end of a border drag
  {
    file: 'src/engine/input-handler-table.ts',
    needles: [
      'tableRef: { ...this.cachedTableRef },',
      '    affectedCellIndices,',
      "const rawNewPos = state.edge.type === 'row' ? pageY : pageX;",
      'const deltaHwpUnit = Math.round(deltaPagePx * 75);',
    ],
  },
  // a cell block's L/C/B/F open the studio's own border/background dialog on its tab
  {
    file: 'src/ui/cell-border-bg-dialog.ts',
    needles: ['export class CellBorderBgDialog', 'private switchTab(idx: number)'],
  },
  // the table-object L/C keys open 표/셀 속성 on its border/background tab, and a block's
  // 표/셀 속성 reads what the dialog showed and where (hancomBlockCellProps)
  {
    file: 'src/ui/table-cell-props-dialog.ts',
    needles: [
      'export class TableCellPropsDialog',
      'private tabs: HTMLButtonElement[] = [];',
      'private switchTab(idx: number)',
      'btn.dataset.tab = def.id;',
      'private cellProps!: CellProperties;',
      'private tableCtx: { sec: number; ppi: number; ci: number };',
      'private cellIdx: number;',
      "private mode: 'table' | 'cell';",
      'private services: CommandServices | undefined;',
    ],
  },
  // the studio parts the studio-format-copy patches hand to the app's module
  {
    file: 'src/command/commands/edit.ts',
    needles: [
      "id: 'edit:format-copy'",
      'services.getInputHandler()?.performFormatCopy();',
      'services.getInputHandler()?.performFormatPaste();',
    ],
  },
  {
    file: 'src/engine/cell-block-format.ts',
    needles: [
      'export function selectCellIndicesInRange(',
      'export function paraFormatTargetsForCellBlock(',
      'export function withCellPathTarget(',
    ],
  },
  { file: 'src/ui/toast.ts', needles: ['export function showToast(options: ToastOptions): void'] },
  { file: 'src/i18n/core.ts', needles: ['export function getLocale(): Locale'] },
  // what installHancomMainKeys and installHanjaKey are handed where the commands are registered
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
