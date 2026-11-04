/**
 * The words the status line uses for what the map turned down: the reason
 * codes of the controller (`MapNotice`) as keys of the dictionaries.
 */
import type { StringKey } from '../i18n/locale'
import type { MapNotice } from '../map/controller'
import type { FormatKind } from '../map/format-painter'

/** What the format painter held when another kind of item was pressed. */
const PAINTER_KIND_ONLY: Readonly<Record<FormatKind, StringKey>> = {
  topic: 'painterTopicOnly',
  relationship: 'painterRelationshipOnly',
  summary: 'painterSummaryOnly',
  boundary: 'painterBoundaryOnly',
}

export function noticeText(notice: MapNotice): StringKey {
  switch (notice.code) {
    case 'boundary-refused':
      switch (notice.reason) {
        case 'nothing-selected':
          return 'selectTopicFirst'
        case 'both-sides':
          return 'boundarySameSide'
        default:
          // topics of different parents, or the central topic with others
          return 'boundarySameParent'
      }
    case 'painter-wrong-kind':
      return PAINTER_KIND_ONLY[notice.held]
    case 'painter-nothing-selected':
      return 'painterNothing'
  }
}
