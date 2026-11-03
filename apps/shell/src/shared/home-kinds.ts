// Which new-document entries home shows, and in what order (Settings →
// General). Hiding a kind only takes it off the "new" lists: home's cards,
// the tab bar's "+" menu, home's File menu and the macOS Dock menu. Files of
// that kind still open as before.

/** the entries in their first order; a kind added later lands beside its neighbours */
export const HOME_KINDS = [
  'docx',
  'xlsx',
  'pptx',
  'md',
  'html',
  'xmind',
  'drawio',
  'hwp',
  'pdf',
  'pdfTools',
] as const

export type HomeKind = (typeof HOME_KINDS)[number]

/** `homeKinds` in userData/app-settings.json */
export const HOME_KINDS_SETTING_KEY = 'homeKinds'

export interface HomeKindsSettings {
  /** every kind exactly once, in the order home shows them */
  order: HomeKind[]
  /** kinds taken off the new-document lists */
  hidden: HomeKind[]
}

export function isHomeKind(value: unknown): value is HomeKind {
  return typeof value === 'string' && (HOME_KINDS as readonly string[]).includes(value)
}

export function defaultHomeKinds(): HomeKindsSettings {
  return { order: [...HOME_KINDS], hidden: [] }
}

function knownKinds(raw: unknown): HomeKind[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter(isHomeKind))]
}

/**
 * Read a stored or sent value. Unknown ids are dropped; a kind missing from a
 * saved order (one this version added) goes right after the nearest kind that
 * comes before it in the first order, or first when none does.
 */
export function normalizeHomeKinds(raw: unknown): HomeKindsSettings {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const order = knownKinds(obj.order)
  HOME_KINDS.forEach((kind, index) => {
    if (order.includes(kind)) return
    let at = 0
    for (let before = index - 1; before >= 0; before--) {
      const found = order.indexOf(HOME_KINDS[before])
      if (found >= 0) {
        at = found + 1
        break
      }
    }
    order.splice(at, 0, kind)
  })
  const hidden = knownKinds(obj.hidden)
  return { order, hidden: order.filter((kind) => hidden.includes(kind)) }
}

/** the value to store: only what differs from the first state */
export function storedHomeKinds(settings: HomeKindsSettings): {
  order?: HomeKind[]
  hidden?: HomeKind[]
} {
  const value = normalizeHomeKinds(settings)
  const stored: { order?: HomeKind[]; hidden?: HomeKind[] } = {}
  if (value.order.some((kind, index) => kind !== HOME_KINDS[index])) stored.order = value.order
  if (value.hidden.length > 0) stored.hidden = value.hidden
  return stored
}

/** the kinds home lists, in order */
export function visibleHomeKinds(settings: HomeKindsSettings): HomeKind[] {
  return settings.order.filter((kind) => !settings.hidden.includes(kind))
}

/** swap `kind` with its neighbour; unchanged at either end */
export function moveHomeKind(
  settings: HomeKindsSettings,
  kind: HomeKind,
  step: -1 | 1,
): HomeKindsSettings {
  const order = [...settings.order]
  const from = order.indexOf(kind)
  const to = from + step
  if (from < 0 || to < 0 || to >= order.length) return settings
  ;[order[from], order[to]] = [order[to], order[from]]
  return { order, hidden: [...settings.hidden] }
}

export function setHomeKindHidden(
  settings: HomeKindsSettings,
  kind: HomeKind,
  hidden: boolean,
): HomeKindsSettings {
  const next = new Set(settings.hidden)
  if (hidden) next.add(kind)
  else next.delete(kind)
  return { order: [...settings.order], hidden: settings.order.filter((k) => next.has(k)) }
}

/** home's bridge (`window.aiOfficeHomeKinds`) */
export interface HomeKindsApi {
  get(): Promise<HomeKindsSettings>
  /** store the value; resolves to what was stored */
  set(settings: HomeKindsSettings): Promise<HomeKindsSettings>
  /** the value changed (sent from the main process after every store) */
  onChanged(handler: (settings: HomeKindsSettings) => void): () => void
}

export const HOME_KINDS_CHANNELS = {
  get: 'home:get-home-kinds',
  set: 'home:set-home-kinds',
  changed: 'home:home-kinds-changed',
} as const
