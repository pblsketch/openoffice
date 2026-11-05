import { describe, expect, it } from 'vitest'
import { unfinishedSteps, type RunStep } from '../src/renderer/ai/unfinished-steps'

const step = (
  name: string,
  input: Record<string, unknown>,
  isError = false,
  summary = name,
): RunStep => ({ name, input, isError, summary })

describe('the edits a run left undone', () => {
  it('are none when every edit went through', () => {
    expect(
      unfinishedSteps([
        step('replace_text', { find: '가', replace: '나' }),
        step('insert_paragraphs', { where: 'end', paragraphs: ['끝'] }),
      ]),
    ).toEqual([])
  })

  it('are the failed edits no later call made good', () => {
    const failed = step('replace_text', { find: '2. 목적', replace: '2. 목적' }, true, 'not done')
    expect(
      unfinishedSteps([failed, step('insert_paragraphs', { where: 'after', anchor: '2. 목적' })]),
    ).toEqual([failed])
  })

  it('leave out tools that only read, and the tools of other skills', () => {
    expect(
      unfinishedSteps([
        step('find_text', { text: '○' }, true),
        step('read_table', { table: 9 }, true),
        step('read_url', { url: 'https://example.com' }, true),
        step('read_skill_file', { path: 'x' }, true),
      ]),
    ).toEqual([])
  })

  it('count an ambiguous find answered with an occurrence as done', () => {
    expect(
      unfinishedSteps([
        step('delete_paragraph', { find: '○' }, true),
        step('delete_paragraph', { find: '○', occurrence: 2 }),
      ]),
    ).toEqual([])
  })

  it('count a refusal the model repeated on purpose as done', () => {
    expect(
      unfinishedSteps([
        step('delete_paragraph', { find: '○', occurrence: 3 }, true),
        step('delete_paragraph', { find: '○', occurrence: 3 }),
      ]),
    ).toEqual([])
  })

  it('are matched by tool and target: another tool or another target does not cover one', () => {
    const cells = step('fill_cells', { table: 2, cells: [] }, true)
    const anchor = step('insert_paragraphs', { where: 'after', anchor: '목적' }, true)
    expect(
      unfinishedSteps([
        cells,
        anchor,
        step('fill_cells', { table: 3, cells: [] }),
        step('insert_table', { where: 'after', anchor: '목적', rows: [['a']] }),
      ]),
    ).toEqual([cells, anchor])
    // the same table filled later, with overwrite, is the same edit done
    expect(unfinishedSteps([cells, step('fill_cells', { table: 2, overwrite: true })])).toEqual([])
  })

  it('list each target once, at its first failure, and again if it failed after a success', () => {
    const first = step('format_text', { find: '제목' }, true, 'first')
    const later = step('format_text', { find: '제목' }, true, 'later')
    expect(unfinishedSteps([first, later])).toEqual([first])
    expect(unfinishedSteps([first, step('format_text', { find: '제목' }), later])).toEqual([later])
  })
})
