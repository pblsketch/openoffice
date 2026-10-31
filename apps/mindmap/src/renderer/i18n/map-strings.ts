import type { Lang } from '@genoffice/i18n'
import type { MapStrings } from '../map/controller'
import { translateIn } from './locale'

/**
 * The texts the map itself shows, in one language: the titles new topics and
 * summaries start with, and the drawing library's context menu. The library
 * ships its own menu texts for a handful of languages; all twelve entries are
 * passed from this app's dictionaries instead, so every one of the 21
 * languages has them.
 */
export function mapStrings(lang: Lang): MapStrings {
  const text = (key: Parameters<typeof translateIn>[1]): string => translateIn(lang, key)
  return {
    newTopic: text('newTopic'),
    summary: text('tbSummary'),
    menu: {
      addChild: text('meAddChild'),
      addParent: text('meAddParent'),
      addSibling: text('meAddSibling'),
      removeNode: text('meRemoveNode'),
      focus: text('meFocus'),
      cancelFocus: text('meCancelFocus'),
      moveUp: text('meMoveUp'),
      moveDown: text('meMoveDown'),
      link: text('meLink'),
      linkBidirectional: text('meLinkBidirectional'),
      clickTips: text('meClickTips'),
      summary: text('meSummary'),
    },
    menuRelationship: text('tbRelationship'),
    menuLabel: text('tbLabel'),
    menuNote: text('tbNote'),
    menuLink: text('tbLink'),
    menuRemovePicture: text('meRemovePicture'),
    decoration: {
      priority: PRIORITY_LEVELS.map((n) => translateIn(lang, 'markerPriority', { n })),
      progress: PROGRESS_PERCENT.map((percent) => translateIn(lang, 'markerProgress', { percent })),
      flag: text('markerFlag'),
      star: text('markerStar'),
      otherMarker: text('markerOther'),
      pictureNotShown: text('pictureNotShown'),
    },
  }
}

const PRIORITY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
/** The nine steps of the progress markers, from not started to done, as the share that is done. */
const PROGRESS_PERCENT = [0, 13, 25, 38, 50, 63, 75, 88, 100] as const
