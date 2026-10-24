/**
 * Settings → Skills without React: which skills show in which group, what a
 * row is called, what its more-menu offers and which sentence a failure gets.
 * The main process decides everything about a skill (`UserSkillView.can`);
 * this only arranges it for the screen.
 */
import type { Lang } from '@genoffice/i18n'
import { builtinSkillDesc, isBuiltinSkillName, skillDisplayName } from '@genoffice/ui'
import type { UserSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import type {
  UserSkillNameProblem,
  UserSkillUnreadable,
  UserSkillView,
  UserSkillsFailReason,
} from '@genoffice/electron-utils/user-skills-channels'
import type { SkillsStringKey } from '../i18n/strings-skills'

/** The settings screen's skills bridge (src/preload/index.ts); absent outside the shell */
export function userSkillsApi(): UserSkillsBridge | undefined {
  return (window as unknown as { aiOfficeUserSkills?: UserSkillsBridge }).aiOfficeUserSkills
}

/** The list's groups in screen order (spec 5.1); project skills never show here */
export const SKILL_GROUPS = ['builtin', 'app', 'user', 'plugin', 'codex'] as const
export type SkillGroupId = (typeof SKILL_GROUPS)[number]

const GROUP_LABEL: Record<SkillGroupId, SkillsStringKey> = {
  builtin: 'sourceBuiltin',
  app: 'sourceApp',
  user: 'sourceUser',
  plugin: 'sourcePluginGroup',
  codex: 'sourceCodex',
}

export function groupLabelKey(group: SkillGroupId): SkillsStringKey {
  return GROUP_LABEL[group]
}

type Text = (key: SkillsStringKey, params?: Record<string, string | number>) => string

/** What a row is called: the skill's name (a made-up name shows the title it was made with) */
export function skillDisplayTitle(view: UserSkillView): string {
  return skillDisplayName(view.source === 'builtin' ? { name: view.name } : view)
}

export function skillDisplayDesc(view: UserSkillView, lang: Lang): string {
  if (view.source === 'builtin' && isBuiltinSkillName(view.name)) {
    return builtinSkillDesc(lang, view.name)
  }
  return view.description
}

/** Plain source label: never a logo, only the folder or plugin it came from */
export function sourceLabel(view: UserSkillView, text: Text): string {
  switch (view.source) {
    case 'builtin':
      return text('sourceBuiltin')
    case 'app':
      return text(view.github ? 'sourceAppGitHub' : 'sourceApp')
    case 'user':
      return text('sourceUser')
    case 'plugin':
      return text('sourcePlugin', { plugin: view.plugin ?? '' })
    case 'codex':
      return text('sourceCodex')
    default:
      return ''
  }
}

function isListed(view: UserSkillView): view is UserSkillView & { source: SkillGroupId } {
  return (SKILL_GROUPS as readonly string[]).includes(view.source)
}

/** Does the skill match the search box (title, name, description; case ignored) */
export function skillMatches(view: UserSkillView, query: string, lang: Lang): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    skillDisplayTitle(view),
    view.title,
    view.name,
    skillDisplayDesc(view, lang),
    view.description,
  ].some((field) => field.toLowerCase().includes(needle))
}

export interface SkillGroup {
  id: SkillGroupId
  skills: UserSkillView[]
}

/** Visible skills grouped in screen order; hidden builtins and empty groups left out */
export function groupSkills(
  views: readonly UserSkillView[],
  query: string,
  lang: Lang,
): SkillGroup[] {
  const groups: SkillGroup[] = []
  for (const id of SKILL_GROUPS) {
    const skills = views
      .filter(isListed)
      .filter((view) => view.source === id && !view.hidden && skillMatches(view, query, lang))
      .sort((a, b) => {
        if (id === 'plugin' && a.plugin !== b.plugin) {
          return (a.plugin ?? '').localeCompare(b.plugin ?? '')
        }
        return skillDisplayTitle(a).localeCompare(skillDisplayTitle(b))
      })
    if (skills.length > 0) groups.push({ id, skills })
  }
  return groups
}

export function hiddenBuiltinCount(views: readonly UserSkillView[]): number {
  return views.filter((view) => view.source === 'builtin' && view.hidden).length
}

/** Skills the list would show with no search at all */
export function listedCount(views: readonly UserSkillView[]): number {
  return views.filter((view) => isListed(view) && !view.hidden).length
}

export type SkillMenuAction =
  'view' | 'edit' | 'copyToMine' | 'export' | 'checkUpdate' | 'openFolder' | 'remove' | 'hide'

const ACTION_LABEL: Record<SkillMenuAction, SkillsStringKey> = {
  view: 'actView',
  edit: 'actEdit',
  copyToMine: 'actCopy',
  export: 'actExport',
  checkUpdate: 'actCheckUpdate',
  openFolder: 'actOpenFolder',
  remove: 'actRemove',
  hide: 'actHide',
}

export function actionLabelKey(action: SkillMenuAction): SkillsStringKey {
  return ACTION_LABEL[action]
}

/** The more-menu in spec 5.1 order, from what the main process allows */
export function skillMenuActions(view: UserSkillView): SkillMenuAction[] {
  const actions: SkillMenuAction[] = []
  if (!view.unreadable) actions.push('view')
  if (view.can.edit) actions.push('edit')
  if (view.can.copyToMine) actions.push('copyToMine')
  if (view.can.export) actions.push('export')
  if (view.can.checkUpdate) actions.push('checkUpdate')
  if (view.can.openFolder) actions.push('openFolder')
  if (view.can.remove) actions.push('remove')
  else if (view.can.hide) actions.push('hide')
  return actions
}

const UNREADABLE: Record<UserSkillUnreadable, SkillsStringKey> = {
  'no-frontmatter': 'unreadableNoFrontmatter',
  'bad-name': 'unreadableBadName',
  'too-large': 'unreadableTooLarge',
  unreadable: 'unreadableUnreadable',
}

export function unreadableKey(reason: UserSkillUnreadable): SkillsStringKey {
  return UNREADABLE[reason] ?? 'unreadableUnreadable'
}

const NAME_PROBLEM: Record<UserSkillNameProblem | 'taken', SkillsStringKey> = {
  empty: 'nameEmpty',
  'too-long': 'nameTooLong',
  characters: 'nameCharacters',
  'hyphen-edge': 'nameHyphenEdge',
  'double-hyphen': 'nameDoubleHyphen',
  reserved: 'nameReserved',
  taken: 'nameTaken',
}

export function nameProblemKey(problem: string): SkillsStringKey {
  return NAME_PROBLEM[problem as UserSkillNameProblem | 'taken'] ?? 'failBadName'
}

/**
 * The sentence for a failed call; none for a cancel (the person stopped it).
 * `import` reads `not-found` as the GitHub repository, elsewhere as the skill.
 */
export function failureKey(
  reason: UserSkillsFailReason,
  context: 'import' | 'other' = 'other',
): SkillsStringKey | undefined {
  switch (reason) {
    case 'cancelled':
      return undefined
    case 'no-skills':
      return 'failNoSkills'
    case 'not-found':
      return context === 'import' ? 'failRepoNotFound' : 'failNotFound'
    case 'rate-limited':
      return 'failRateLimited'
    case 'network':
      return 'failNetwork'
    case 'too-large':
      return 'failTooLarge'
    case 'unsafe':
      return 'failUnsafe'
    case 'bad-address':
      return 'failBadAddress'
    case 'busy':
      return 'failBusy'
    case 'not-allowed':
      return 'failNotAllowed'
    case 'not-installable':
    case 'invalid-source':
      return 'failNotInstallable'
    case 'not-github':
      return 'failNotGitHub'
    case 'trash-failed':
      return 'failTrash'
    case 'hidden':
      return 'failHidden'
    case 'needs-choice':
      return 'chooseCollision'
    case 'empty-title':
      return 'failEmptyTitle'
    case 'empty-description':
      return 'failEmptyDescription'
    case 'empty-body':
      return 'failEmptyBody'
    case 'bad-name':
      return 'failBadName'
    case 'name-taken':
    case 'exists':
      return 'nameTaken'
    case 'unreadable':
      return 'unreadableUnreadable'
    default:
      return 'failGeneric'
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** bytes in the largest unit that keeps the number at least 1, e.g. "1.5 MB" */
export function formatSkillSize(bytes: number, locale: string): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${UNITS[unit]}`
}
