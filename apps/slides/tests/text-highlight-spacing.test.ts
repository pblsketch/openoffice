import { describe, expect, it } from 'vitest'
import { layoutText, makeViewport, HeuristicMetrics } from '@genoffice/pptx-render'
import type { Paragraph } from '@genoffice/pptx-engine'
import { extractParagraphs, populateEditorDom } from '../src/renderer/TextEditOverlay'

const vp = makeViewport({ cx: 12192000, cy: 6858000 }, 1280)
const metrics = new HeuristicMetrics()

function editor(paragraphs: Paragraph[]) {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const { lines } = layoutText({
    body: { paragraphs, insets: { l: 0, t: 0, r: 0, b: 0 } },
    boxWidthPx: 800,
    boxHeightPx: 400,
    metrics,
    vp,
  })
  populateEditorDom(div, lines)
  return div
}

describe('editor highlight and character spacing round trip', () => {
  it('reads an untouched highlight back as the same color and no spacing change', () => {
    const div = editor([{ runs: [{ text: 'mark', highlight: '#FFFF00', letterSpacing: 2 }] }])
    const run = extractParagraphs(div, 1)[0]!.runs[0]!
    expect(run.highlight?.toUpperCase()).toBe('#FFFF00')
    // fragment letter-spacing is display-only: the source run keeps its spc
    expect(run.letterSpacing).toBeUndefined()
    div.remove()
  })

  it('reads a cleared highlight as null and a spacing mark as points', () => {
    const div = editor([{ runs: [{ text: 'mark', highlight: '#FFFF00' }] }])
    const container = div.querySelector<HTMLElement>('[data-run-container]')!
    container.style.backgroundColor = 'transparent'
    const span = document.createElement('span')
    span.dataset.letterSpacing = '-1.5'
    span.append(...Array.from(container.childNodes))
    container.appendChild(span)
    const run = extractParagraphs(div, 1)[0]!.runs[0]!
    expect(run.highlight).toBeNull()
    expect(run.letterSpacing).toBe(-1.5)
    div.remove()
  })

  it('keeps differently highlighted spans as separate runs', () => {
    const div = editor([{ runs: [{ text: 'ab' }] }])
    const container = div.querySelector<HTMLElement>('[data-run-container]')!
    const marked = document.createElement('span')
    marked.style.backgroundColor = '#00FF00'
    marked.textContent = 'c'
    container.appendChild(marked)
    const runs = extractParagraphs(div, 1)[0]!.runs
    expect(runs.map((r) => r.text)).toEqual(['ab', 'c'])
    div.remove()
  })
})
