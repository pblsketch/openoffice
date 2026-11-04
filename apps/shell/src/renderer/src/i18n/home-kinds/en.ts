import type { zh } from './zh'

export const en = {
  setHomeKinds: 'New documents on Home',
  setHomeKindsDesc:
    'Types you turn off leave Home’s new-document cards and the New menus. Files of those types still open as before.',
  homeKindUp: 'Move {name} up',
  homeKindDown: 'Move {name} down',
  homeKindsReset: 'Restore original order',
} satisfies Record<keyof typeof zh, string>
