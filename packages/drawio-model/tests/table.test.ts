import { describe, expect, it } from 'vitest'
import {
  diagramStateFromPages,
  formatDiagramRead,
  formatDiagramText,
  htmlLabelToText,
  readDiagramTable,
} from '../src/index'
import { edge, model, mxfile, open, page, vertex } from './helpers'

const CELLS = [
  vertex(
    'a',
    '&lt;b&gt;Start&lt;/b&gt;&lt;br&gt;here &amp;amp; now',
    'rounded=1;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    '40,40,120,60',
  ),
  vertex('b', 'plain &lt;b&gt;', 'rhombus;', '240,30,140,80'),
  vertex('g', '', 'group;', '400,0,200,100'),
  vertex('g1', 'in group', 'ellipse;html=1;', '10,10,50,50', 'g'),
  vertex('c', 'Lane', 'swimlane;html=1;', '0,200,300,200'),
  vertex('k', 'Box', 'rounded=0;container=1;', '0,500,100,100'),
  vertex('cl', 'cloud', 'ellipse;shape=cloud;html=1;', '0,0,10,10'),
  vertex('cy', 'db', 'shape=cylinder3;html=1;', '0,0,10,10'),
  vertex('ac', 'user', 'shape=umlActor;html=1;', '0,0,10,10'),
  vertex('no', '', '', '1,2,3,4'),
  edge('e', 'a', 'b', 'yes'),
  edge('e2', 'b', 'g1'),
  `<mxCell id="lbl" value="&lt;i&gt;tag&lt;/i&gt;" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e2"><mxGeometry x="-0.2" relative="1" as="geometry"/></mxCell>`,
  `<UserObject label="Linked &lt;u&gt;x&lt;/u&gt;" link="https://example.com" id="u"><mxCell style="html=1;" vertex="1" parent="1"><mxGeometry x="5" y="6" width="7" height="8" as="geometry"/></mxCell></UserObject>`,
].join('')

const FILE = open(mxfile(page('p1', 'First', model(CELLS)), page('p2', 'Second', model())))

describe('htmlLabelToText', () => {
  it.each([
    ['a<br>b', 'a\nb'],
    ['a<br/>b<BR />c', 'a\nb\nc'],
    ['<div>x</div><div>y</div>', 'x\ny'],
    ['x<div>y</div>', 'x\ny'],
    ['<div>x</div><div><br></div><div>y</div>', 'x\n\ny'],
    ['<span style="color:red">r&amp;d &lt;3&nbsp;&#65;&#x42;</span>', 'r&d <3 AB'],
    ['<p>one</p><p>two</p>', 'one\ntwo'],
    [
      '<table><tr><td>Q1</td><td>100</td></tr><tr><td>Q2</td><td>200</td></tr></table>',
      'Q1\t100\nQ2\t200',
    ],
    ['<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>', 'A\tB\n1\t2'],
  ])('%s', (html, text) => {
    expect(htmlLabelToText(html)).toBe(text)
  })
})

describe('readDiagramTable', () => {
  const read = readDiagramTable(FILE.state)
  if ('code' in read) throw new Error(read.message)

  it('lists the pages and reads the first page by default', () => {
    expect(read.pages).toEqual([
      { id: 'p1', name: 'First' },
      { id: 'p2', name: 'Second' },
    ])
    expect(read.page.id).toBe('p1')
    expect(read.page.name).toBe('First')
    expect(read.page.selected).toBeUndefined()
  })

  it('strips HTML labels and keeps plain ones', () => {
    const byId = new Map(read.page.shapes.map((shape) => [shape.id, shape]))
    expect(byId.get('a')!.label).toBe('Start\nhere & now')
    expect(byId.get('b')!.label).toBe('plain <b>')
    expect(byId.get('u')!.label).toBe('Linked x')
  })

  it('reports shape names, geometry, colours and parents', () => {
    const rows = Object.fromEntries(read.page.shapes.map((shape) => [shape.id, shape]))
    expect(rows['a']).toEqual({
      id: 'a',
      label: 'Start\nhere & now',
      shape: 'rounded',
      x: 40,
      y: 40,
      width: 120,
      height: 60,
      fill: '#dae8fc',
      stroke: '#6c8ebf',
    })
    expect(rows['b']!.shape).toBe('rhombus')
    expect(rows['g']!.shape).toBe('group')
    expect(rows['g1']).toMatchObject({ shape: 'ellipse', parent: 'g', x: 10, y: 10 })
    expect(rows['c']!.shape).toBe('container')
    expect(rows['k']!.shape).toBe('container')
    expect(rows['cl']!.shape).toBe('cloud')
    expect(rows['cy']!.shape).toBe('cylinder')
    expect(rows['ac']!.shape).toBe('actor')
    expect(rows['no']).toMatchObject({ shape: 'rectangle', x: 1, y: 2, width: 3, height: 4 })
    expect(rows['b']!.parent).toBeUndefined()
    expect(Object.keys(rows)).not.toContain('lbl')
  })

  it('lists edges with their ends, folding edge-label cells into the label', () => {
    expect(read.page.edges).toEqual([
      { id: 'e', label: 'yes', source: 'a', target: 'b' },
      { id: 'e2', label: 'tag', source: 'b', target: 'g1' },
    ])
  })

  it('reads another page by id or name and flags the current page and selection', () => {
    const second = readDiagramTable(FILE.state, {
      page: 'Second',
      currentPage: 'p1',
      selected: ['a'],
    })
    if ('code' in second) throw new Error(second.message)
    expect(second.page).toEqual({ id: 'p2', name: 'Second', shapes: [], edges: [] })
    expect(second.pages[0]).toEqual({ id: 'p1', name: 'First', current: true })
    const current = readDiagramTable(FILE.state, { currentPage: 'p1', selected: ['a'] })
    if ('code' in current) throw new Error(current.message)
    expect(current.page.id).toBe('p1')
    expect(current.page.selected).toEqual(['a'])
  })

  it('refuses an unknown page', () => {
    expect(readDiagramTable(FILE.state, { page: 'nope' })).toMatchObject({
      code: 'target_not_found',
    })
  })
})

describe('plain-text table', () => {
  it('writes one row per element', () => {
    const read = readDiagramTable(FILE.state)
    if ('code' in read) throw new Error(read.message)
    const text = formatDiagramRead(read)
    const lines = text.split('\n')
    expect(lines.filter((line) => line.startsWith('a | '))).toEqual([
      'a | Start\\nhere & now | rounded | 40 | 40 | 120 | 60 |  | #dae8fc | #6c8ebf',
    ])
    expect(lines).toContain('g1 | in group | ellipse | 10 | 10 | 50 | 50 | g |  | ')
    expect(lines).toContain('e | yes | a | b | ')
    expect(text).toContain('Pages: First (p1), Second (p2)')
  })

  it('escapes the column separator and shortens long labels', () => {
    const state = diagramStateFromPages([
      { id: 'p', name: 'P', xml: model(vertex('v', 'a|b ' + 'x'.repeat(200), '')) },
    ])
    const text = formatDiagramText(state)
    const row = text.split('\n').find((line) => line.startsWith('v | '))!
    expect(row).toContain('a\\|b')
    expect(row.length).toBeLessThan(160)
    expect(row).toContain('…')
  })

  it('renders every page for formatDiagramText', () => {
    const text = formatDiagramText(FILE.state)
    expect(text).toContain('Page: First (p1)')
    expect(text).toContain('Page: Second (p2)')
  })
})
