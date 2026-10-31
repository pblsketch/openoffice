// @vitest-environment node
/**
 * The look of a map as data: what a theme hands the stylesheet and the
 * drawing library, the geometry of the branch lines, and the rule that the
 * map's colours are document content, cut off from the colours of the app.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  themeLook,
  writeSheetTheme,
  type ThemeId,
} from '@genoffice/xmind-engine'
import {
  type BranchBoxes,
  mainBranchPath,
  subBranchPath,
  timelineStepPath,
  TREE_INDENT,
  TREE_TRUNK,
  treeBranchPath,
} from '../src/renderer/map/branches'
import {
  branchCount,
  branchGeometry,
  branchVars,
  containerVars,
  libraryTheme,
  lookOfSheet,
  readableOn,
} from '../src/renderer/map/look'
import { plainSheet, richSheet } from './helpers/fixtures'

const HERE = dirname(fileURLToPath(import.meta.url))
const RENDERER = resolve(HERE, '../src/renderer')
const TOKENS_CSS = resolve(HERE, '../../../packages/ui/src/tokens.css')

/** Every custom property the app's chrome defines: the shared tokens, and this editor's accent. */
function chromeTokens(): Set<string> {
  const names = new Set<string>()
  for (const file of [TOKENS_CSS, join(RENDERER, 'styles.css')]) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
      names.add(match[1]!)
    }
  }
  return names
}

const COLOR_VALUE = /^(?:#[0-9a-f]{6}|transparent)$/

describe('what a theme hands the stylesheet', () => {
  it('every one of the 96 themes gives the same properties, each a value of the theme data', () => {
    const names = Object.keys(containerVars(themeLook(DEFAULT_THEME_ID))).sort()
    const branchNames = Object.keys(branchVars(themeLook(DEFAULT_THEME_ID), 0)).sort()
    expect(THEME_IDS).toHaveLength(96)
    for (const id of THEME_IDS) {
      const look = themeLook(id)
      const vars = containerVars(look)
      expect(Object.keys(vars).sort(), id).toEqual(names)
      for (const [name, value] of Object.entries(vars)) {
        expect(name, id).toMatch(/^--mm-/)
        expect(value, `${id} ${name}`).not.toMatch(/var\(|url\(|;|\{|\}/)
      }
      expect(vars['--mm-ground']).toBe(look.ground)
      for (const name of ['--mm-ground', '--mm-text', '--mm-strong', '--mm-central-fill']) {
        expect(vars[name], `${id} ${name}`).toMatch(COLOR_VALUE)
      }
      for (let branch = 0; branch < branchCount(look); branch++) {
        const colours = branchVars(look, branch)
        expect(Object.keys(colours).sort(), id).toEqual(branchNames)
        expect(colours['--mm-branch']).toBe(look.branches[branch]!.color)
        for (const [name, value] of Object.entries(colours)) {
          if (name === '--mm-main-shadow') continue
          expect(value, `${id} ${name}`).toMatch(COLOR_VALUE)
        }
      }
    }
  })

  it('a main branch past the last colour of the band starts over with the first', () => {
    const look = themeLook(DEFAULT_THEME_ID)
    expect(branchCount(look)).toBe(4)
    expect(branchVars(look, 4)).toEqual(branchVars(look, 0))
    expect(branchVars(look, 6)).toEqual(branchVars(look, 2))
  })

  it('the levels below the third get their own size and line height, each smaller and never under the floor', () => {
    const look = themeLook(DEFAULT_THEME_ID)
    const vars = containerVars(look)
    expect(look.deepSizes).toEqual([13, 12.5, 12])
    expect([
      vars['--mm-level-4-size'],
      vars['--mm-level-5-size'],
      vars['--mm-level-6-size'],
    ]).toEqual(['13px', '12.5px', '12px'])
    expect([vars['--mm-level-4-lh'], vars['--mm-level-5-lh'], vars['--mm-level-6-lh']]).toEqual([
      '18px',
      '18px',
      '17px',
    ])
    // the third level itself keeps the size of the theme
    expect(vars['--mm-sub-size']).toBe('13.5px')
  })

  it('the library theme carries the same properties, the ground and the two line functions', () => {
    for (const id of ['pill/paper/light', 'line/slate/dark', 'block/poppy/tint'] as ThemeId[]) {
      const look = themeLook(id)
      const theme = libraryTheme(look)
      const vars = theme.cssVar as Record<string, string>
      expect(theme.name).toBe(id)
      expect(theme.type).toBe(look.variant === 'dark' ? 'dark' : 'light')
      expect(vars['--bgcolor']).toBe(look.ground)
      expect(vars).toMatchObject(containerVars(look))
      expect(typeof theme.generateMainBranch).toBe('function')
      expect(typeof theme.generateSubBranch).toBe('function')
    }
  })

  it('text on a fill is the end of the band that reads on it', () => {
    const look = themeLook(DEFAULT_THEME_ID)
    expect(readableOn(look, '#101010')).toBe(look.bandColors[0])
    expect(readableOn(look, '#fff8e0')).toBe(look.bandColors[5])
  })
})

describe('which look a sheet is drawn with', () => {
  it('its own theme when this app wrote it', () => {
    const sheet = plainSheet()
    writeSheetTheme(sheet, 'capsule/moss/dark')
    expect(lookOfSheet(sheet).id).toBe('capsule/moss/dark')
  })

  it('the default look for no theme and for a theme this app did not write, which stays as it is', () => {
    expect(lookOfSheet(plainSheet()).id).toBe(DEFAULT_THEME_ID)
    const foreign = richSheet()
    const before = JSON.stringify(foreign.theme)
    expect(lookOfSheet(foreign).id).toBe(DEFAULT_THEME_ID)
    expect(JSON.stringify(foreign.theme)).toBe(before)
  })
})

describe('the branch lines', () => {
  const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const line = branchGeometry(themeLook('line/paper/light'))
  const pill = branchGeometry(themeLook('pill/paper/light'))
  const block = branchGeometry(themeLook('block/paper/light'))
  const main: BranchBoxes = {
    pT: 100,
    pL: 300,
    pW: 200,
    pH: 60,
    cT: 40,
    cL: 560,
    cW: 90,
    cH: 32,
    direction: 'rhs',
  }

  it('line skeleton: a main branch runs on under its topic as one path, on the bottom of its box', () => {
    const d = mainBranchPath(line, main)
    expect(d).toMatch(/^M [\d. -]+ C [\d. -]+ H [\d.-]+$/)
    const [, , , , , , nearX, y, farX] = numbers(d)
    // 2.25 wide, so its middle is 1.125 above the bottom edge
    expect(y).toBeCloseTo(main.cT + main.cH - 1.13, 1)
    expect([nearX, farX]).toEqual([main.cL, main.cL + main.cW])
  })

  it('line skeleton: the lines below a main topic start at the far end of its underline, at its height', () => {
    // the same main topic as the lower lines see it: it fills its box
    const sub: BranchBoxes = {
      pT: 40,
      pL: 560,
      pW: 90,
      pH: 32,
      cT: 10,
      cL: 660,
      cW: 140,
      cH: 36,
      direction: 'rhs',
      isFirst: true,
    }
    const [, , , , , , , underlineY, underlineEnd] = numbers(mainBranchPath(line, main))
    const d = subBranchPath(line, sub)
    const [startX, startY] = numbers(d)
    expect(startX).toBe(underlineEnd)
    expect(startY).toBe(underlineY)
    // and the line runs on under the topic it reaches, inside the room around that topic
    expect(d).toMatch(/ H [\d.]+$/)
    const [, , , , , , nearX, , farX] = numbers(d)
    expect([nearX, farX]).toEqual([sub.cL + line.subPadX, sub.cL + sub.cW - line.subPadX])
  })

  it('line skeleton: a topic below starts its own lines where its underline ends', () => {
    const parent = { T: 10, L: 660, W: 140, H: 36 }
    const arriving = subBranchPath(line, {
      pT: 40,
      pL: 560,
      pW: 90,
      pH: 32,
      cT: parent.T,
      cL: parent.L,
      cW: parent.W,
      cH: parent.H,
      direction: 'rhs',
      isFirst: true,
    })
    const leaving = subBranchPath(line, {
      pT: parent.T,
      pL: parent.L,
      pW: parent.W,
      pH: parent.H,
      cT: 0,
      cL: 800,
      cW: 120,
      cH: 36,
      direction: 'rhs',
      isFirst: false,
    })
    const [, , , , , , , y, farX] = numbers(arriving)
    expect(numbers(leaving).slice(0, 2)).toEqual([farX, y])
  })

  it('mirrors on the left side', () => {
    const left: BranchBoxes = { ...main, cL: 150, direction: 'lhs' }
    const [sx, , , , , , nearX, , farX] = numbers(mainBranchPath(line, left))
    expect(sx).toBeLessThan(left.pL + 10)
    expect([nearX, farX]).toEqual([left.cL + left.cW, left.cL])
  })

  it('a boxed skeleton ends its lines level, in the middle of the topic', () => {
    const d = mainBranchPath(pill, main)
    expect(d).not.toContain('H')
    const [sx, sy, , , , , ex, ey] = numbers(d)
    expect(sx).toBe(main.pL + main.pW - pill.centralInset)
    expect(sy).toBe(main.pT + main.pH / 2)
    expect([ex, ey]).toEqual([main.cL, main.cT + main.cH / 2])
  })

  it('the block skeleton draws elbows with both corners rounded, and a straight line when there is no step', () => {
    const boxes: BranchBoxes = {
      pT: 0,
      pL: 0,
      pW: 100,
      pH: 30,
      cT: 60,
      cL: 100,
      cW: 120,
      cH: 30,
      direction: 'rhs',
      isFirst: true,
    }
    const d = subBranchPath(block, boxes)
    expect(d.match(/Q/g)).toHaveLength(2)
    expect(d).toMatch(/^M 100 15 H /)
    expect(subBranchPath(block, { ...boxes, cT: 0 })).toBe(`M 100 15 H ${100 + block.subPadX}`)
  })

  it('in the downward layout a line leaves the bottom and arrives at the top, with the underline on its own', () => {
    const down: BranchBoxes = { ...main, cT: 220, cL: 100, direction: 'down' }
    const [sx, sy, , , , , ex, ey] = numbers(mainBranchPath(pill, down))
    expect([sx, ex, ey]).toEqual([main.pL + main.pW / 2, down.cL + down.cW / 2, down.cT])
    expect(sy).toBeLessThanOrEqual(main.pT + main.pH)
    expect(mainBranchPath(line, down)).toMatch(/ M [\d.]+ [\d.]+ H [\d.]+$/)
  })

  // a parent at the top left, a topic below it and to the right
  const tree: BranchBoxes = {
    pT: 0,
    pL: 0,
    pW: 160,
    pH: 40,
    cT: 80,
    cL: TREE_INDENT,
    cW: 120,
    cH: 30,
    direction: 'rhs',
  }

  it('a tree runs down a trunk near the left edge of the central topic, then across to the main topic', () => {
    const d = treeBranchPath(pill, tree, 'central')
    const [sx, sy] = numbers(d)
    expect(sx).toBe(TREE_TRUNK)
    expect(sy).toBe(tree.pH - pill.centralInset)
    expect(d).toMatch(new RegExp(` H ${TREE_INDENT}$`))
    // the corner turns at the middle of the topic
    expect(numbers(d).slice(-3, -1)).toEqual([TREE_TRUNK + 8, tree.cT + tree.cH / 2])
  })

  it('all topics below one parent share its trunk', () => {
    const first = numbers(treeBranchPath(block, { ...tree, isFirst: true }, 'main'))
    const second = numbers(treeBranchPath(block, { ...tree, cT: 140, isFirst: true }, 'main'))
    expect(first.slice(0, 2)).toEqual(second.slice(0, 2))
    expect(first.slice(0, 2)).toEqual([TREE_TRUNK, tree.pH])
  })

  it('below the main level the trunk and the topic sit inside the room around each topic', () => {
    const d = treeBranchPath(pill, tree, 'sub')
    const [sx, sy] = numbers(d)
    expect(sx).toBe(pill.subPadX + TREE_TRUNK)
    expect(sy).toBe(tree.pH - pill.subPadY)
    expect(d).toMatch(new RegExp(` H ${tree.cL + pill.subPadX}$`))
  })

  it('in the line skeleton a branch of a tree runs on under the topic it reaches', () => {
    const d = treeBranchPath(line, tree, 'sub')
    expect(d).toMatch(new RegExp(` H ${tree.cL + tree.cW - line.subPadX}$`))
  })

  it('a step of a timeline goes from the topic before to this one and ends in an arrowhead', () => {
    const step: BranchBoxes = {
      ...tree,
      pT: 0,
      pL: 0,
      pW: 100,
      pH: 30,
      cT: 0,
      cL: 150,
      cW: 90,
      cH: 30,
    }
    const d = timelineStepPath(pill, step, false)
    const values = numbers(d)
    expect(values.slice(0, 2)).toEqual([100, 15])
    // the arrowhead's point is just before the main topic, at its middle
    expect(d).toMatch(/ L 148 15 L /)
    expect(values.slice(-2)).toEqual([142, 15 + 6 * 0.7])
    // from the central topic the line starts hidden under its edge
    expect(numbers(timelineStepPath(pill, step, true))[0]).toBe(100 - pill.centralInset)
    // in the line skeleton the main topic sits on its line
    expect(timelineStepPath(line, step, false)).toMatch(/ M 150 [\d.]+ H 240$/)
  })
})

describe('the colours of a map are document content', () => {
  const tokens = chromeTokens()
  const mapCss = readFileSync(join(RENDERER, 'map.css'), 'utf8')
  const mapCode = readdirSync(join(RENDERER, 'map'))
    .filter((name) => name !== 'controller.ts' && name !== 'text-guard.ts')
    .map((name) => [name, readFileSync(join(RENDERER, 'map', name), 'utf8')] as const)

  it('the list of chrome tokens was read', () => {
    for (const name of [
      '--surface',
      '--text',
      '--border',
      '--hover',
      '--accent',
      '--accent-soft',
    ]) {
      expect(tokens.has(name), name).toBe(true)
    }
  })

  it('no rule of the map stylesheet refers to a chrome token', () => {
    const used = [...mapCss.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]!)
    expect(used.length).toBeGreaterThan(20)
    for (const name of used) expect(tokens.has(name), name).toBe(false)
    // what it does refer to: the theme's own properties, the library's spacing, and the app's font
    for (const name of new Set(used)) {
      expect(name, name).toMatch(/^--(?:mm-[\w-]+|(?:node|main)-gap-[xy]|font-ui)$/)
    }
  })

  it('the map stylesheet holds no colour of its own: every colour arrives as a property of the theme', () => {
    const rules = mapCss.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const text of rules.split('\n')) {
      // a custom property may hold a drawing (the chip icons); nothing else may hold a raw colour
      if (/^\s*--[\w-]+:/.test(text)) continue
      expect(text, text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/)
    }
    expect(rules).not.toMatch(/prefers-color-scheme|data-theme/)
  })

  it('the code that draws the look names no chrome token and reads no app theme', () => {
    expect(mapCode.map(([name]) => name).sort()).toEqual([
      'branches.ts',
      'decorate.ts',
      'images.ts',
      'look.ts',
      'markers.ts',
      'picture-drop.ts',
      'style-values.ts',
      'timeline-keys.ts',
      'use-picture-drop.ts',
    ])
    for (const [name, code] of mapCode) {
      const source = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const used of source.matchAll(/--[a-z][\w-]*/g)) {
        expect(tokens.has(used[0]), `${name} ${used[0]}`).toBe(false)
      }
      expect(source, name).not.toMatch(
        /data-theme|prefers-color-scheme|matchMedia|getComputedStyle/,
      )
    }
  })

  it('steps exactly the levels the theme gives a size, one rule for each', () => {
    const levels = [...mapCss.matchAll(/\[data-mm-level=["'](\d+)["']\]/g)].map((match) =>
      Number(match[1]),
    )
    expect(levels).toEqual(themeLook(DEFAULT_THEME_ID).deepSizes.map((_size, at) => at + 4))
  })

  it('every property the map stylesheet reads is one the look sets', () => {
    const look = themeLook(DEFAULT_THEME_ID)
    const set = new Set([
      ...Object.keys(containerVars(look)),
      ...Object.keys(branchVars(look, 0)),
      ...[...mapCss.matchAll(/^\s*(--mm-[\w-]+)\s*:/gm)].map((match) => match[1]!),
    ])
    for (const match of mapCss.matchAll(/var\(\s*(--mm-[\w-]+)/g)) {
      expect(set.has(match[1]!), match[1]).toBe(true)
    }
  })
})
