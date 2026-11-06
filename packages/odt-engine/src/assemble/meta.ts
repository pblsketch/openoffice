/**
 * Document metadata across the bridge.
 *
 * The bridge docx carries the ODT's people fields in `docProps/core.xml`
 * (`dc:creator` = `meta:initial-creator`, `cp:lastModifiedBy` = `dc:creator`),
 * so the editor's "remove personal information" scrubs them like any docx.
 * On save, `meta.xml` is touched only when that happened: the people fields
 * are then removed from it. Otherwise it keeps its bytes.
 */
import type { OdtDocument } from '../core/open'
import { decodeXmlEntities, escapeXmlText, readRoot, walkElements } from '../core/xml'

/** People fields the bridge docx showed (`ext.assemble.core`). */
export interface BridgeCoreProps {
  creator: string | null
  lastModifiedBy: string | null
}

const PEOPLE = ['meta:initial-creator', 'dc:creator', 'meta:printed-by']

/** Text of the first element named `name` (canonical) in meta.xml, or null. */
function metaField(metaXml: string, name: string): string | null {
  const root = readRoot(metaXml)
  if (!root) return null
  let out: string | null = null
  walkElements(metaXml, root.prefixes, {
    open(el) {
      if (el.name !== name) return
      el.data = true
      return 'skip'
    },
    close(el) {
      if (!el.data) return
      out = el.selfClosing ? '' : decodeXmlEntities(metaXml.slice(el.openEnd, el.closeStart))
      return 'stop'
    },
  })
  return out
}

export function readMetaPeople(doc: OdtDocument): BridgeCoreProps {
  const meta = doc.metaXml
  if (!meta) return { creator: null, lastModifiedBy: null }
  return {
    creator: metaField(meta, 'meta:initial-creator'),
    lastModifiedBy: metaField(meta, 'dc:creator'),
  }
}

/** `docProps/core.xml` for the bridge docx, or null when meta.xml names nobody. */
export function coreXmlFor(doc: OdtDocument, people: BridgeCoreProps): string | null {
  if (!people.creator && !people.lastModifiedBy) return null
  const meta = doc.metaXml ?? ''
  const title = metaField(meta, 'dc:title')
  const created = metaField(meta, 'meta:creation-date')
  const modified = metaField(meta, 'dc:date')
  // ODF timestamps may carry Z, an offset (+09:00), or neither. core.xml wants
  // true UTC (…Z). Do not slap Z onto the wall-clock digits — that turns
  // 10:00+09:00 into 10:00Z. Offset-less values keep their digits as UTC so the
  // host timezone cannot shift them.
  const iso = (v: string | null): string | null => {
    if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return null
    const trimmed = v.trim()
    const parseable = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)
      ? trimmed
      : `${trimmed.slice(0, 19)}Z`
    const ms = Date.parse(parseable)
    if (Number.isNaN(ms)) return null
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
  const c = iso(created)
  const m = iso(modified)
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (title ? `<dc:title>${escapeXmlText(title)}</dc:title>` : '') +
    `<dc:creator>${escapeXmlText(people.creator ?? '')}</dc:creator>` +
    `<cp:lastModifiedBy>${escapeXmlText(people.lastModifiedBy ?? '')}</cp:lastModifiedBy>` +
    (c ? `<dcterms:created xsi:type="dcterms:W3CDTF">${c}</dcterms:created>` : '') +
    (m ? `<dcterms:modified xsi:type="dcterms:W3CDTF">${m}</dcterms:modified>` : '') +
    '</cp:coreProperties>'
  )
}

/** Text of a core.xml element (by local name and prefix as the engine writes them). */
function coreField(coreXml: string | null, tag: string): string | null {
  if (!coreXml) return null
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`).exec(coreXml)
  if (!m) return null
  return decodeXmlEntities(m[1] ?? '')
}

/**
 * Whether the edited docx had personal information removed: its settings
 * ask for it, or a people field the bridge showed is now empty or gone.
 */
export function personalInfoRemoved(
  bridge: BridgeCoreProps | null,
  editedCoreXml: string | null,
  editedFlag: boolean,
): boolean {
  if (editedFlag) return true
  if (!bridge) return false
  const cleared = (was: string | null, now: string | null) => !!was && !now
  return (
    cleared(bridge.creator, coreField(editedCoreXml, 'dc:creator')) ||
    cleared(bridge.lastModifiedBy, coreField(editedCoreXml, 'cp:lastModifiedBy'))
  )
}

/** meta.xml without its people fields (the same string when it has none). */
export function scrubMetaXml(metaXml: string): string {
  const root = readRoot(metaXml)
  if (!root) return metaXml
  const cuts: Array<{ start: number; end: number }> = []
  walkElements(metaXml, root.prefixes, {
    open(el) {
      if (PEOPLE.includes(el.name)) {
        el.data = true
        return 'skip'
      }
    },
    close(el) {
      if (el.data) cuts.push({ start: el.start, end: el.end })
    },
  })
  let out = metaXml
  for (const c of cuts.sort((a, b) => b.start - a.start))
    out = out.slice(0, c.start) + out.slice(c.end)
  return out
}
