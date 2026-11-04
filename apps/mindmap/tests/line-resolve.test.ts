// @vitest-environment node
/**
 * What one branch line is drawn with: the order in which the values of the
 * topic the line goes into, of its parent and of the branches above, of the
 * map-wide colours and of the theme decide its colour, width, pattern and
 * shape. Pure: nothing here is drawn.
 */
import { describe, expect, it } from 'vitest'
import type { NodeObj } from 'mind-elixir'
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  themeLook,
  type ViewBranchLine,
} from '@genoffice/xmind-engine'
import {
  type BranchLineContext,
  lineChainOf,
  resolveBranchLine,
  resolveNodeLine,
} from '../src/renderer/map/line-resolve'

const look = themeLook(DEFAULT_THEME_ID)
const blockId = THEME_IDS.find((id) => id.startsWith('block/'))!
const block = themeLook(blockId)

const shape = (word: string): string => `org.xmind.branchConnection.${word}`

const context = (over: Partial<BranchLineContext> = {}): BranchLineContext => ({
  look,
  rainbow: true,
  branchIndex: 1,
  ...over,
})

type Line = ViewBranchLine | undefined
/** The chain of a line into a topic two levels below a main topic: X, P, the main topic, the centre. */
const deep = (x: Line, p: Line, main: Line, centre: Line): Line[] => [x, p, main, centre]

describe('the colour of a branch line', () => {
  it('nothing written: the rainbow colour of the main branch it is on', () => {
    const into = resolveBranchLine([undefined, undefined], context())
    expect(into.color).toBe(look.branches[1]!.color)
    expect(into.colorFrom).toBe('rainbow')
    const below = resolveBranchLine(deep(undefined, undefined, undefined, undefined), context())
    expect(below.color).toBe(look.branches[1]!.color)
  })

  it('the rainbow starts over after the last colour', () => {
    expect(resolveBranchLine([undefined, undefined], context({ branchIndex: 5 })).color).toBe(
      look.branches[5 % look.branches.length]!.color,
    )
  })

  it("the topic's own colour comes first", () => {
    const line = resolveBranchLine(
      deep({ color: '#FF0000' }, { color: '#00ff00' }, { color: '#0000ff' }, undefined),
      context(),
    )
    expect(line).toMatchObject({ color: '#ff0000', colorFrom: 'own' })
  })

  it('then the nearest ancestor with a colour written, skipping those without', () => {
    expect(
      resolveBranchLine(
        deep(undefined, { color: '#00ff00' }, { color: '#0000ff' }, undefined),
        context(),
      ),
    ).toMatchObject({ color: '#00ff00', colorFrom: 'inherited' })
    expect(
      resolveBranchLine(deep(undefined, {}, { color: '#0000ff' }, undefined), context()),
    ).toMatchObject({ color: '#0000ff', colorFrom: 'inherited' })
  })

  it('the rainbow goes before a colour written on the central topic', () => {
    const chain = deep(undefined, undefined, undefined, { color: '#123456' })
    expect(resolveBranchLine(chain, context())).toMatchObject({
      color: look.branches[1]!.color,
      colorFrom: 'rainbow',
    })
    // a main line too: its only ancestor is the central topic
    expect(resolveBranchLine([undefined, { color: '#123456' }], context())).toMatchObject({
      colorFrom: 'rainbow',
    })
    // with the rainbow off, the central topic's colour is the nearest
    expect(resolveBranchLine(chain, context({ rainbow: false }))).toMatchObject({
      color: '#123456',
      colorFrom: 'inherited',
    })
  })

  it('a colour on a branch goes before the rainbow', () => {
    expect(
      resolveBranchLine(deep(undefined, undefined, { color: '#0000ff' }, undefined), context()),
    ).toMatchObject({ color: '#0000ff', colorFrom: 'inherited' })
  })

  it("with the rainbow off and nothing written: the theme's line colour, the central topic's", () => {
    expect(resolveBranchLine([undefined, undefined], context({ rainbow: false }))).toMatchObject({
      color: look.strongText,
      colorFrom: 'theme',
    })
  })

  it('a value that is no colour is as if nothing were written', () => {
    expect(
      resolveBranchLine(
        deep({ color: 'red' }, { color: 'url(x)' }, { color: '#0000ff' }, undefined),
        context(),
      ),
    ).toMatchObject({ color: '#0000ff', colorFrom: 'inherited' })
  })
})

describe('the width and the pattern of a branch line', () => {
  it("nothing written: the theme's width at the parent's level, and a solid line", () => {
    expect(resolveBranchLine([undefined, undefined], context())).toMatchObject({
      width: look.lines.main.width,
      widthFrom: 'theme',
      pattern: 'solid',
      patternFrom: 'theme',
    })
    expect(resolveBranchLine([undefined, undefined, undefined], context())).toMatchObject({
      width: look.lines.sub.width,
      widthFrom: 'theme',
    })
  })

  it("the topic's own value, else the value its parent uses", () => {
    const own = resolveBranchLine(
      deep(
        { width: '3pt', pattern: 'dash' },
        { width: '5pt', pattern: 'dot' },
        undefined,
        undefined,
      ),
      context(),
    )
    expect(own).toMatchObject({ width: 3, widthFrom: 'own', pattern: 'dash', patternFrom: 'own' })
    const parent = resolveBranchLine(
      deep(undefined, { width: '5pt', pattern: 'dot' }, undefined, undefined),
      context(),
    )
    expect(parent).toMatchObject({
      width: 5,
      widthFrom: 'inherited',
      pattern: 'dot',
      patternFrom: 'inherited',
    })
  })

  it('the value the parent uses may come from further up, the central topic included', () => {
    const line = resolveBranchLine(
      deep(undefined, undefined, { width: '4pt' }, { width: '6pt', pattern: 'dash-dot' }),
      context(),
    )
    expect(line).toMatchObject({
      width: 4,
      widthFrom: 'inherited',
      pattern: 'dash-dot',
      patternFrom: 'inherited',
    })
  })

  it('reads widths in points, in pixels and as bare numbers, one point to one pixel', () => {
    expect(resolveBranchLine([{ width: '2pt' }, undefined], context()).width).toBe(2)
    expect(resolveBranchLine([{ width: '5px' }, undefined], context()).width).toBe(5)
    expect(resolveBranchLine([{ width: '6' }, undefined], context()).width).toBe(6)
    expect(resolveBranchLine([{ width: '1.5' }, undefined], context()).width).toBe(1.5)
  })

  it('a value that is no width or no known pattern is as if nothing were written', () => {
    for (const width of ['0', 'thick', '-1pt', '3em', '9999pt']) {
      expect(resolveBranchLine([{ width }, { width: '4pt' }], context()), width).toMatchObject({
        width: 4,
        widthFrom: 'inherited',
      })
    }
    expect(resolveBranchLine([{ pattern: 'wavy' }, undefined], context())).toMatchObject({
      pattern: 'solid',
      patternFrom: 'theme',
    })
  })

  it('knows every pattern of the format', () => {
    for (const pattern of ['solid', 'dash', 'dot', 'dash-dot', 'dash-dot-dot', 'round-dot']) {
      expect(resolveBranchLine([{ pattern }, undefined], context()).pattern).toBe(pattern)
    }
  })
})

describe('the shape of a branch line', () => {
  it("the topic's own shape, else its parent's own, else the theme's at the parent's level", () => {
    expect(
      resolveBranchLine(
        deep({ shape: shape('straight') }, { shape: shape('elbow') }, undefined, undefined),
        context(),
      ),
    ).toMatchObject({ shape: 'straight', shapeFrom: 'own', shapeOther: false })
    expect(
      resolveBranchLine(
        deep(undefined, { shape: shape('elbow') }, undefined, undefined),
        context(),
      ),
    ).toMatchObject({ shape: 'elbow', shapeFrom: 'parent' })
    expect(resolveBranchLine([undefined, undefined], context())).toMatchObject({
      shape: 'curve',
      shapeFrom: 'theme',
    })
  })

  it('is not handed down from further up than the parent', () => {
    const line = resolveBranchLine(
      deep(undefined, undefined, { shape: shape('elbow') }, { shape: shape('straight') }),
      context(),
    )
    expect(line).toMatchObject({ shape: 'curve', shapeFrom: 'theme' })
  })

  it("follows the theme's own shapes: the block skeleton's rounded elbows below the main level", () => {
    expect(resolveBranchLine([undefined, undefined], context({ look: block })).shape).toBe('curve')
    expect(
      resolveBranchLine([undefined, undefined, undefined], context({ look: block })).shape,
    ).toBe('roundedElbow')
  })

  it('every shape a user can pick is drawn as itself', () => {
    for (const word of ['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve', 'none']) {
      expect(resolveBranchLine([{ shape: shape(word) }, undefined], context()), word).toMatchObject(
        {
          shape: word,
          shapeOther: false,
        },
      )
    }
  })

  it('a shape only read is drawn as the nearest one, and shown as another shape', () => {
    const nearest: Record<string, string> = {
      fold: 'elbow',
      fold2: 'elbow',
      roundedfold: 'roundedElbow',
      bight: 'curve',
      'timeline.horizontal': 'straight',
    }
    for (const [word, drawn] of Object.entries(nearest)) {
      expect(resolveBranchLine([{ shape: shape(word) }, undefined], context()), word).toMatchObject(
        {
          shape: drawn,
          shapeFrom: 'own',
          shapeOther: true,
        },
      )
    }
  })

  it("any other value is drawn as the theme's shape, and does not fall back to the parent's", () => {
    for (const value of [shape('mystery'), 'straight', '', 'org.xmind.branchConnection.']) {
      expect(
        resolveBranchLine([{ shape: value }, { shape: shape('straight') }, undefined], context()),
        value,
      ).toMatchObject({ shape: 'curve', shapeFrom: 'own', shapeOther: true })
    }
  })
})

describe('the central topic and the library nodes', () => {
  it('the central topic has no line into it: the values its own lines start from', () => {
    expect(resolveBranchLine([undefined], context())).toMatchObject({
      color: look.strongText,
      width: look.lines.main.width,
      pattern: 'solid',
      shape: 'curve',
    })
    expect(
      resolveBranchLine([{ color: '#123456', width: '3pt', shape: shape('elbow') }], context()),
    ).toMatchObject({ color: '#123456', width: 3, shape: 'elbow' })
  })

  it('reads the chain of a node from the line values in its metadata, up to the central topic', () => {
    const root = { id: 'r', topic: 'R', metadata: { line: { color: '#123456' } } } as NodeObj
    const main = { id: 'm', topic: 'M', parent: root, metadata: {} } as NodeObj
    const other = { id: 'o', topic: 'O', parent: root, metadata: {} } as NodeObj
    const leaf = {
      id: 'l',
      topic: 'L',
      parent: main,
      metadata: { line: { width: '3pt', shape: 7 } },
    } as unknown as NodeObj
    root.children = [other, main]
    main.children = [leaf]
    expect(lineChainOf(leaf)).toEqual([{ width: '3pt' }, undefined, { color: '#123456' }])
    const resolved = resolveNodeLine(leaf, { look, rainbow: true })
    // the second main branch: the second colour, before the central topic's own
    expect(resolved).toMatchObject({ color: look.branches[1]!.color, width: 3, shape: 'curve' })
  })
})
