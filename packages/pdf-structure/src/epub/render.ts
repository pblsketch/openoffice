/**
 * One chapter of the tree → XHTML body (spec §5): headings, paragraphs,
 * nested lists, tables with merges, figures, MathML, page markers, and the
 * chapter's footnotes as `epub:type="footnote"` asides at the end, linked
 * both ways with their body markers.
 */
import { runsText } from '../tree/inline'
import type {
  FootnoteDef,
  FootnoteRefRun,
  ImageBlock,
  InlineRun,
  ListItemBlock,
  PageBreakBlock,
  PageImageBlock,
  TableBlock,
  TextRun,
  TreeBlock,
} from '../tree/types'
import { isPairedTranslation, withPrevious, type Chapter } from './chapters'
import { blockMath, inlineMath } from './math'
import { escapeAttr, escapeText, langAttrs, plainText } from './xml'

export interface NavHeading {
  level: number
  /** element id inside the chapter file */
  id: string
  text: string
}

export interface RenderEnv {
  /** href (from a chapter file) of the marker of original page N, if the book has it */
  pageHref(page: number): string | undefined
  /** element id of a page marker */
  pageMarkerId(block: PageBreakBlock): string
  /** registers image bytes and returns their href from a chapter file */
  imageHref(data: Uint8Array, mime: 'image/png' | 'image/jpeg'): string
  /** next book-wide unique heading id */
  nextHeadingId(): string
  footnotes: ReadonlyMap<string, FootnoteDef>
  pageImageAlt(page: number): string
}

export interface RenderedChapter {
  body: string
  /** headings for the nav (a bilingual heading's translation is left out) */
  headings: NavHeading[]
  hasMath: boolean
  /** text of the chapter's first heading */
  title?: string
}

/** link schemes kept in the book; anything else (javascript:, file:, …) loses its link */
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'ftp:'])

/** attributes of a block: language and the class of a translated block */
function blockAttrs(b: { lang?: string; translationOf?: string }, ...classes: string[]): string {
  const cls = b.translationOf ? [...classes, 'translation'] : classes
  return langAttrs(b.lang) + (cls.length > 0 ? ` class="${cls.join(' ')}"` : '')
}

/** a link target safe for the book, or undefined to drop the link */
function externalHref(href: string): string | undefined {
  try {
    const url = new URL(href)
    if (!LINK_SCHEMES.has(url.protocol)) return undefined
    // opaque paths (mailto:) keep characters a URL may not carry
    return url.href.replace(/[\s"<>`{}|\\^]/g, (c) => encodeURIComponent(c))
  } catch {
    return undefined
  }
}

interface NoteUse {
  index: number
  refIds: string[]
}

export function renderChapter(chapter: Chapter, env: RenderEnv): RenderedChapter {
  return new ChapterWriter(env).write(chapter)
}

class ChapterWriter {
  private readonly out: string[] = []
  private readonly lists: { ordered: boolean; level: number }[] = []
  private pendingMarkers: string[] = []
  /** footnotes referenced in this chapter, in first-reference order */
  private readonly notes = new Map<string, NoteUse>()
  private readonly headings: NavHeading[] = []
  private hasMath = false
  private title: string | undefined

  constructor(private readonly env: RenderEnv) {}

  write(chapter: Chapter): RenderedChapter {
    for (const [b, prev] of withPrevious(chapter.blocks)) this.block(b, prev)
    this.closeLists()
    this.flushMarkers()
    const body = `<section>\n${this.out.join('')}</section>\n${this.asides()}`
    const title = chapter.heading ? plainText(runsText(chapter.heading.runs)) : this.title
    return { body, headings: this.headings, hasMath: this.hasMath, title: title || undefined }
  }

  // ── blocks ──

  private block(b: TreeBlock, prev: TreeBlock | undefined): void {
    if (b.kind === 'pageBreak') {
      this.pendingMarkers.push(this.marker(b))
      return
    }
    if (b.kind === 'listItem') {
      this.listItem(b, prev)
      return
    }
    this.closeLists()
    this.flushMarkers()
    switch (b.kind) {
      case 'heading': {
        const id = this.env.nextHeadingId()
        const text = plainText(runsText(b.runs))
        if (text && !isPairedTranslation(b, prev)) {
          this.headings.push({ level: b.level, id, text })
        }
        this.title ??= text || undefined
        this.out.push(
          `<h${b.level} id="${id}"${blockAttrs(b)}>${this.inline(b.runs)}</h${b.level}>\n`,
        )
        return
      }
      case 'paragraph':
        // a drawing's label: the picture shows it
        if (b.figure) return
        this.out.push(`<p${blockAttrs(b)}>${this.inline(b.runs)}</p>\n`)
        return
      case 'table':
        this.out.push(this.table(b))
        return
      case 'image':
        this.out.push(this.image(b))
        return
      case 'math': {
        const m = blockMath(b.latex)
        if (m.mathml) this.hasMath = true
        this.out.push(m.xml)
        return
      }
      case 'pageImage':
        this.out.push(this.pageImage(b))
        return
    }
  }

  private marker(b: PageBreakBlock): string {
    const id = this.env.pageMarkerId(b)
    return `<span id="${id}" epub:type="pagebreak" role="doc-pagebreak" aria-label="${b.page}"></span>`
  }

  private takeMarkers(): string {
    const s = this.pendingMarkers.join('')
    this.pendingMarkers = []
    return s
  }

  private flushMarkers(): void {
    const s = this.takeMarkers()
    if (s) this.out.push(`${s}\n`)
  }

  /**
   * Nested lists by level. Page markers between items ride inside the next
   * item (a list may only hold items). A bilingual item's translation joins
   * its original item, so numbering is not doubled.
   */
  private listItem(b: ListItemBlock, prev: TreeBlock | undefined): void {
    const markers = this.takeMarkers()
    if (this.lists.length > 0 && prev?.kind === 'listItem' && isPairedTranslation(b, prev)) {
      this.out.push(`<p${blockAttrs(b)}>${markers}${this.inline(b.runs)}</p>`)
      return
    }
    const level = Math.max(0, b.level)
    for (let top = this.lists.at(-1); top; top = this.lists.at(-1)) {
      if (top.level < level || (top.level === level && top.ordered === b.ordered)) break
      this.out.push(`</li></${top.ordered ? 'ol' : 'ul'}>\n`)
      this.lists.pop()
    }
    const top = this.lists.at(-1)
    if (top && top.level === level) {
      this.out.push('</li>\n')
    } else {
      this.out.push(`<${b.ordered ? 'ol' : 'ul'}>\n`)
      this.lists.push({ ordered: b.ordered, level })
    }
    const printed = b.ordered ? /^\(?(\d{1,9})/.exec(b.marker?.trim() ?? '')?.[1] : undefined
    const value = printed ? ` value="${Number(printed)}"` : ''
    this.out.push(`<li${value}${blockAttrs(b)}>${markers}${this.inline(b.runs)}`)
  }

  private closeLists(): void {
    if (this.lists.length === 0) return
    for (let top = this.lists.pop(); top; top = this.lists.pop()) {
      this.out.push(`</li></${top.ordered ? 'ol' : 'ul'}>\n`)
    }
  }

  private table(b: TableBlock): string {
    const { rowCount, colCount, cells } = b.table
    const rows = Array.from({ length: Math.max(0, rowCount) }, () => [] as typeof cells)
    for (const c of cells) {
      if (c.row >= 0 && c.row < rowCount && c.col >= 0 && c.col < colCount) rows[c.row]!.push(c)
    }
    const cap = b.caption
    const classes = cap?.position === 'below' ? ['caption-below'] : []
    let s = `<table${blockAttrs(b, ...classes)}>\n`
    if (cap) s += `<caption${blockAttrs(cap)}>${this.inline(cap.runs)}</caption>\n`
    s += '<tbody>\n'
    for (const row of rows) {
      row.sort((x, y) => x.col - y.col)
      s += '<tr>'
      for (const c of row) {
        const tag = c.header ? 'th' : 'td'
        const rs = Math.min(Math.max(1, c.rowSpan), rowCount - c.row)
        const cs = Math.min(Math.max(1, c.colSpan), colCount - c.col)
        const span = (rs > 1 ? ` rowspan="${rs}"` : '') + (cs > 1 ? ` colspan="${cs}"` : '')
        const content =
          c.paragraphs.length === 1
            ? this.inline(c.paragraphs[0]!)
            : c.paragraphs.map((p) => `<p>${this.inline(p)}</p>`).join('')
        s += `<${tag}${span}>${content}</${tag}>`
      }
      s += '</tr>\n'
    }
    return `${s}</tbody>\n</table>\n`
  }

  /** figure + img + figcaption on the caption's side; a placeholder keeps only its caption */
  private image(b: ImageBlock): string {
    const captions = [b.caption, b.captionTranslation].filter((c) => c !== undefined)
    let figcaption = ''
    if (captions.length === 1) {
      const c = captions[0]!
      figcaption = `<figcaption${blockAttrs(c)}>${this.inline(c.runs)}</figcaption>`
    } else if (captions.length > 1) {
      const paras = captions.map((c) => `<p${blockAttrs(c)}>${this.inline(c.runs)}</p>`)
      figcaption = `<figcaption>${paras.join('')}</figcaption>`
    }
    const hasBytes = !b.placeholder && b.data.length > 0
    if (!hasBytes && !figcaption) return ''
    const alt = b.caption ? plainText(runsText(b.caption.runs)) : ''
    const img = hasBytes
      ? `<img src="${escapeAttr(this.env.imageHref(b.data, b.mime))}" alt="${escapeAttr(alt)}"/>`
      : ''
    const above = captions[0]?.position === 'above'
    return `<figure${blockAttrs(b)}>${above ? figcaption + img : img + figcaption}</figure>\n`
  }

  private pageImage(b: PageImageBlock): string {
    const src = escapeAttr(this.env.imageHref(b.data, b.mime))
    const alt = escapeAttr(this.env.pageImageAlt(b.page))
    return `<figure class="page-image"><img src="${src}" alt="${alt}"/></figure>\n`
  }

  // ── inline ──

  /** `linkNotes` is off inside footnote text: a note's own markers stay plain */
  private inline(runs: readonly InlineRun[], linkNotes = true): string {
    let s = ''
    for (const r of runs) {
      switch (r.kind) {
        case 'text':
          s += this.textRun(r)
          break
        case 'lineBreak':
          s += '<br/>'
          break
        case 'math': {
          const m = inlineMath(r.latex)
          if (m.mathml) this.hasMath = true
          s += m.xml
          break
        }
        case 'footnoteRef':
          s += linkNotes ? this.noteRef(r) : r.marker ? `<sup>${escapeText(r.marker)}</sup>` : ''
          break
      }
    }
    return s
  }

  private textRun(r: TextRun): string {
    let s = escapeText(r.text)
    if (!s) return ''
    if (r.italic) s = `<i>${s}</i>`
    if (r.bold) s = `<b>${s}</b>`
    const href = r.href ? this.linkTarget(r.href) : undefined
    return href ? `<a href="${escapeAttr(href)}">${s}</a>` : s
  }

  private linkTarget(href: string): string | undefined {
    const page = /^#page=(\d+)$/.exec(href)
    return page ? this.env.pageHref(Number(page[1])) : externalHref(href)
  }

  // ── footnotes ──

  private noteRef(r: FootnoteRefRun): string {
    const def = this.env.footnotes.get(r.id)
    if (!def) return r.marker ? `<sup>${escapeText(r.marker)}</sup>` : ''
    let use = this.notes.get(r.id)
    if (!use) {
      use = { index: this.notes.size + 1, refIds: [] }
      this.notes.set(r.id, use)
    }
    const n = use.refIds.length + 1
    const refId = n === 1 ? `fnref-${use.index}` : `fnref-${use.index}-${n}`
    use.refIds.push(refId)
    const label = escapeText(def.marker || r.marker || String(use.index))
    return (
      `<sup><a id="${refId}" href="#fn-${use.index}" epub:type="noteref" role="doc-noteref">` +
      `${label}</a></sup>`
    )
  }

  /** the chapter's footnotes, each with a back link to its first marker */
  private asides(): string {
    let s = ''
    for (const [id, use] of this.notes) {
      const def = this.env.footnotes.get(id)!
      const label = escapeText(def.marker || String(use.index))
      const back = `<a href="#${use.refIds[0]}" role="doc-backlink">${label}</a>`
      const paras = def.blocks.map(
        (p, i) =>
          `<p${blockAttrs(p)}>${i === 0 ? `${back} ` : ''}${this.inline(p.runs, false)}</p>`,
      )
      if (paras.length === 0) paras.push(`<p>${back}</p>`)
      s +=
        `<aside id="fn-${use.index}" epub:type="footnote" role="doc-footnote" class="footnote">\n` +
        `${paras.join('\n')}\n</aside>\n`
    }
    return s
  }
}
