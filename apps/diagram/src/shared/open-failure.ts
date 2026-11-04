/**
 * The words for "why this file did not open", by reason. The main process
 * shows them before the shell gives a broken file a tab (`open-check.ts`), and
 * the editor screen shows them when a file still fails once its tab is open
 * (it asks the shell to close the tab and say the same). Both translate the
 * same keys of the editor's one dictionary (`renderer/i18n/app`).
 */
import type { DiagramOpenStatus } from './ipc'

export const OPEN_FAILURE_KEYS = {
  unsupported: 'failUnsupported',
  no_original: 'failNoOriginal',
  corrupt_image: 'failCorruptImage',
  not_xml: 'failNotXml',
  decompress_failed: 'failDecompress',
  no_diagram: 'failNoDiagram',
  unreadable: 'failUnreadable',
} as const satisfies Record<Exclude<DiagramOpenStatus, 'ok'>, string>

export type OpenFailureKey = (typeof OPEN_FAILURE_KEYS)[keyof typeof OPEN_FAILURE_KEYS]
