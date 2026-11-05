/**
 * The PC's fonts in the editor's font lists from the start.
 *
 * The studio reads only the fonts it found last time; looking at the PC again is the
 * 찾기 button in its options dialog, so a user who never pressed it saw the seven base
 * fonts and the document's own, and a font installed later stayed out of the list. On a
 * website that is deliberate (the browser asks the user before listing the fonts); the app
 * already lets its pages list them, as the Word, Excel and PowerPoint pickers do.
 *
 * At start-up the editor asks the PC for its font list. That answer is cheap: names only.
 * The studio's own detection then reads each font file's name table for the Korean names,
 * which touches every installed file, so it runs only when the list differs from what the
 * studio kept (first run, a font installed or removed). Nothing is shown or asked; a refused
 * or failed look leaves the kept list and the 찾기 button as they were.
 *
 * A font that is not on the PC is drawn with another one, while the document keeps its
 * name: a document from Hancom Office shows its 함초롬 fonts on a PC without Hancom Office
 * in a look-alike. The font lists and the font box mark such a font (markFontOption,
 * watchFontBox), and the app tells which of a document's fonts are drawn that way
 * (missingFonts). Until the start-up look is over, and when the kept records did not come
 * from the PC's own list, whether a font is there is not known and nothing is marked.
 */

/** Module specifier the studio-pc-fonts patches import; build-studio.mjs aliases it. */
export const PC_FONTS_MODULE = '@ieum/pc-fonts'

/** The studio's names that are not one font: its generic families and its font sets. */
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace'])
const FONT_SET_PREFIX = '__fontset__'

/**
 * What the studio knows of the PC's fonts (installFontPresence): its lookup of a name, its
 * records, the fonts its canvas probe found, and where and when its kept records came from.
 * @type {null | {
 *   resolveLocalFont: (name: string) => unknown,
 *   records: () => ReadonlyArray<{ family?: string; fullName?: string; postscriptName?: string; displayName?: string; aliases?: readonly string[] }>,
 *   detected: () => Iterable<string>,
 *   state: () => { source: string | null; count?: number; detectedAt?: unknown },
 * }}
 */
let presence = null
/** Every name of the studio's records, compared as the studio does, for the records it had then. */
let recordNames = { key: '', names: new Set() }
/** Settles when the start-up look at the PC's fonts is over, however it ended. */
let settled = Promise.resolve()
/**
 * The words a missing font is marked with, in the app's language (setMissingFontLabels).
 * @type {null | { tag: string, hint: string }}
 */
let labels = null
/**
 * The toolbar's font box, once watchFontBox has it.
 * @type {null | HTMLSelectElement}
 */
let fontBox = null

/** A font name the way the studio compares them (its `normalizeFontAlias`). */
const alias = (value) =>
  typeof value === 'string'
    ? value
        .replaceAll('\u0000', '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-US')
    : ''

/** The name the studio keys one listed face by: PostScript name, else full name, else family. */
const faceKey = (face) => alias(face.postscriptName) || alias(face.fullName) || alias(face.family)

/**
 * Whether the kept records already hold exactly the faces the PC lists now: as many faces,
 * and each listed one known under some name of a record (a record merges the names the
 * enumeration gave with those read from the file). Records the studio found by trying a
 * name (a presence probe) are not part of the list and are left out.
 */
export function sameFaces(listed, kept) {
  const faces = kept.filter((record) => record.detectionSource !== 'font-presence-probe')
  const now = new Set(listed.map(faceKey).filter(Boolean))
  if (now.size !== faces.length) return false
  const known = new Set(
    faces.flatMap((record) =>
      [record.postscriptName, record.fullName, record.family, ...(record.aliases ?? [])].map(alias),
    ),
  )
  for (const key of now) if (!known.has(key)) return false
  return true
}

/** Resolves once the page is visible: the enumeration refuses a hidden page (a tab opened behind another). */
function whenVisible(doc) {
  if (!doc || doc.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    const onShow = () => {
      if (doc.visibilityState !== 'visible') return
      doc.removeEventListener('visibilitychange', onShow)
      resolve()
    }
    doc.addEventListener('visibilitychange', onShow)
  })
}

/**
 * @param {{
 *   queryLocalFonts?: () => Promise<ReadonlyArray<{ family?: string; fullName?: string; postscriptName?: string }>>,
 *   loadStored: () => Promise<unknown>,
 *   records: () => ReadonlyArray<{ family?: string; fullName?: string; postscriptName?: string; aliases?: readonly string[]; detectionSource?: string }>,
 *   detect: () => Promise<unknown>,
 *   changed: () => void,
 *   document?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
 * }} studio
 * @returns {Promise<boolean>} whether the studio's list was detected anew
 */
export function refreshPcFonts(studio) {
  const run = refresh(studio)
  settled = run.then(() => remarkFontBox())
  return run
}

async function refresh(studio) {
  if (!studio.queryLocalFonts) return false
  try {
    await whenVisible(studio.document)
    await studio.loadStored()
    const listed = await studio.queryLocalFonts()
    if (listed.length === 0 || sameFaces(listed, studio.records())) return false
    await studio.detect()
    studio.changed()
    return true
  } catch (error) {
    console.warn('[pc-fonts] PC font list not refreshed; the kept list stays:', error)
    return false
  }
}

/** Hands over what the studio knows of the PC's fonts; the studio-pc-fonts patch calls it at start-up. */
export function installFontPresence(probe) {
  presence = probe
}

/** Resolves once the start-up look at the PC's fonts is over. */
export function whenPcFontsSettled() {
  return settled
}

/**
 * Whether a font is on this PC: true or false, or undefined while that is not known (before
 * the start-up look, with records from the studio's name probe alone, or for a generic
 * family or a font set). A font is there when the studio finds a record by that name, a
 * record carries the name (the studio's own font list shows records by names its lookup
 * does not take, a variable font's for one), or its canvas probe found it.
 */
export function fontOnPc(name) {
  if (!presence || typeof name !== 'string') return undefined
  const key = alias(name)
  if (!key || name.trim().startsWith(FONT_SET_PREFIX) || GENERIC_FAMILIES.has(key)) {
    return undefined
  }
  const state = presence.state()
  if (state.source !== 'local-font-access') return undefined
  if (presence.resolveLocalFont(name.trim())) return true
  if (namesOfRecords(state).has(key)) return true
  for (const found of presence.detected()) if (alias(found) === key) return true
  return false
}

/** The names of the studio's records, gathered again only when it detected anew. */
function namesOfRecords(state) {
  const key = `${state.count ?? ''}|${String(state.detectedAt ?? '')}`
  if (recordNames.key === key && recordNames.names.size > 0) return recordNames.names
  const names = new Set()
  for (const record of presence.records()) {
    const all = [record.family, record.fullName, record.postscriptName, record.displayName]
    for (const value of [...all, ...(record.aliases ?? [])]) {
      const name = alias(value)
      if (name) names.add(name)
    }
  }
  recordNames = { key, names }
  return names
}

/** The names, once each and in their order, of the fonts known not to be on this PC. */
export function missingFonts(names) {
  const seen = new Set()
  const missing = []
  for (const name of names) {
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    if (fontOnPc(trimmed) === false) missing.push(trimmed)
  }
  return missing
}

/** Sets the words a missing font is marked with and marks the font box anew. */
export function setMissingFontLabels(given) {
  labels = { tag: given.tag, hint: given.hint }
  remarkFontBox()
}

/** Marks one entry of the studio's font menu when its font is not on this PC. */
export function markFontOption(button, name) {
  if (!labels || fontOnPc(name) !== false) return
  const tag = button.ownerDocument.createElement('span')
  tag.textContent = labels.tag
  tag.style.marginInlineStart = '8px'
  tag.style.color = 'var(--color-text-muted)'
  tag.style.fontSize = 'var(--font-size-sm)'
  button.append(tag)
  button.title = `${name}: ${labels.hint}`
}

/**
 * Marks the font box when the font it shows is not on this PC: a dotted underline, and the
 * hint as its tooltip. The box keeps its own tooltip otherwise.
 */
export function markFontBox(box, name) {
  const missing = labels !== null && fontOnPc(name) === false
  if (box.dataset.ieumTitle === undefined) box.dataset.ieumTitle = box.title
  box.title = missing && labels ? `${name}: ${labels.hint}` : box.dataset.ieumTitle
  box.style.textDecoration = missing ? 'underline dotted' : ''
}

/**
 * Marks the toolbar's font box whenever the studio sets the font it shows. The studio sets
 * it in several places (the caret's font, the language choice, the menu, a refreshed list),
 * all through the box's value, so the box's own value property passes each one on.
 */
export function watchFontBox(box) {
  const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value')
  if (!own?.get || !own.set) return
  Object.defineProperty(box, 'value', {
    configurable: true,
    get: () => own.get.call(box),
    set: (value) => {
      own.set.call(box, value)
      markFontBox(box, own.get.call(box))
    },
  })
  fontBox = box
}

function remarkFontBox() {
  if (fontBox) markFontBox(fontBox, fontBox.value)
}
