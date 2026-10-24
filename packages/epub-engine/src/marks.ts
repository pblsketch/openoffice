/**
 * Bold and italic toggling on a block's notation tree.
 *
 * The tree is flattened into atoms (characters, line breaks, empty
 * placeholders), each carrying the marks it sits in and the placeholders
 * around it. The toggle changes the marks of the atoms in range, then the tree
 * is rebuilt: placeholders keep their structure, and each mark is written at
 * the outermost level where it covers whole units, but never further out than
 * the original element was. Untouched marks keep pointing at their original
 * element, so their markup is written back unchanged.
 */
import type { NotationNode } from './notation'

type MarkName = 'b' | 'i'

interface Mark {
  /** Index into the context's original marks, or null for a new mark. */
  orig: number | null
  /** Number of placeholders around the mark element. */
  depth: number
}

interface Atom {
  kind: 'char' | 'br' | 'xempty' | 'xhollow'
  ch: string
  /** Placeholder number for `xempty`/`xhollow`, original index for `br`. */
  n: number | null
  /** Placeholder numbers from the outside in. */
  path: number[]
  marks: Record<MarkName, Mark | null>
  /** Mark nesting, outside first. */
  order: MarkName[]
}

function flatten(
  tree: readonly NotationNode[],
  path: number[],
  marks: Record<MarkName, Mark | null>,
  order: MarkName[],
  out: Atom[],
): Atom[] {
  for (const node of tree) {
    if (node.t === 'text') {
      for (const ch of node.v.split('')) out.push({ kind: 'char', ch, n: null, path, marks, order })
    } else if (node.t === 'br') {
      out.push({ kind: 'br', ch: '', n: node.orig, path, marks, order })
    } else if (node.t !== 'x') {
      const inner = { ...marks, [node.t]: marks[node.t] ?? { orig: node.orig, depth: path.length } }
      flatten(node.c, path, inner, order.includes(node.t) ? order : [...order, node.t], out)
    } else if (node.c === null) {
      out.push({ kind: 'xempty', ch: '', n: node.n, path, marks, order })
    } else {
      const before = out.length
      flatten(node.c, [...path, node.n], marks, order, out)
      if (out.length === before)
        out.push({ kind: 'xhollow', ch: '', n: node.n, path, marks, order })
    }
  }
  return out
}

type Unit = { kind: 'leaf'; atom: Atom } | { kind: 'group'; n: number; atoms: Atom[] }

function unitAtoms(unit: Unit): Atom[] {
  return unit.kind === 'leaf' ? [unit.atom] : unit.atoms
}

function markKey(mark: Mark | null): string {
  if (!mark) return 'none'
  return mark.orig === null ? 'new' : `o${mark.orig}`
}

/** The mark key shared by all atoms of a unit that can be written at `depth`, or `mixed`. */
function unitKey(unit: Unit, mark: MarkName, depth: number): string {
  const atoms = unitAtoms(unit)
  const key = markKey(atoms[0]!.marks[mark])
  for (const atom of atoms) {
    const m = atom.marks[mark]
    if (markKey(m) !== key) return 'mixed'
    if (m && m.depth > depth) return 'mixed'
  }
  return key
}

/** Lets new marks join an adjacent original mark element instead of starting their own. */
function unifyKeys(keys: string[]): string[] {
  const out = [...keys]
  let i = 0
  while (i < out.length) {
    if (out[i] === 'none' || out[i] === 'mixed') {
      i++
      continue
    }
    let j = i
    while (j < out.length && out[j] !== 'none' && out[j] !== 'mixed') j++
    const origs = new Set(out.slice(i, j).filter((k) => k !== 'new'))
    if (origs.size === 1) {
      const [only] = origs
      for (let k = i; k < j; k++) out[k] = only!
    }
    i = j
  }
  return out
}

function markOrder(atoms: readonly Atom[]): MarkName[] {
  const both = atoms.find((a) => a.order.length === 2)
  return both ? both.order : ['b', 'i']
}

function render(
  units: readonly Unit[],
  depth: number,
  applied: ReadonlySet<MarkName>,
): NotationNode[] {
  const out: NotationNode[] = []
  for (const unit of units) {
    if (unit.kind === 'group') {
      out.push({ t: 'x', n: unit.n, c: rebuild(unit.atoms, depth + 1, applied) })
      continue
    }
    const { atom } = unit
    if (atom.kind === 'char') {
      const last = out[out.length - 1]
      if (last && last.t === 'text') last.v += atom.ch
      else out.push({ t: 'text', v: atom.ch })
    } else if (atom.kind === 'br') out.push({ t: 'br', orig: atom.n })
    else out.push({ t: 'x', n: atom.n!, c: atom.kind === 'xempty' ? null : [] })
  }
  return out
}

function wrap(
  units: readonly Unit[],
  marks: readonly MarkName[],
  depth: number,
  applied: ReadonlySet<MarkName>,
): NotationNode[] {
  if (marks.length === 0) return render(units, depth, applied)
  const [mark, ...rest] = marks as [MarkName, ...MarkName[]]
  const keys = unifyKeys(units.map((u) => unitKey(u, mark, depth)))
  const out: NotationNode[] = []
  let i = 0
  while (i < units.length) {
    let j = i + 1
    while (j < units.length && keys[j] === keys[i]) j++
    const run = units.slice(i, j)
    const key = keys[i]!
    if (key === 'none' || key === 'mixed') {
      out.push(...wrap(run, rest, depth, applied))
    } else {
      const inner = new Set(applied).add(mark)
      out.push({
        t: mark,
        orig: key === 'new' ? null : Number(key.slice(1)),
        c: wrap(run, rest, depth, inner),
      })
    }
    i = j
  }
  return out
}

function rebuild(
  atoms: readonly Atom[],
  depth: number,
  applied: ReadonlySet<MarkName>,
): NotationNode[] {
  const units: Unit[] = []
  for (const atom of atoms) {
    if (atom.path.length === depth) {
      units.push({ kind: 'leaf', atom })
      continue
    }
    const n = atom.path[depth]!
    const last = units[units.length - 1]
    if (last && last.kind === 'group' && last.n === n) last.atoms.push(atom)
    else units.push({ kind: 'group', n, atoms: [atom] })
  }
  const marks = markOrder(atoms).filter((m) => !applied.has(m))
  return wrap(units, marks, depth, applied)
}

/**
 * Toggles bold (`b`) or italic (`i`) on the plain-text range `[start, end)`.
 * If every character in range already has the mark it is removed there,
 * otherwise it is added. Returns null when the range holds no character.
 */
export function toggleMarkInTree(
  tree: readonly NotationNode[],
  mark: MarkName,
  start: number,
  end: number,
): NotationNode[] | null {
  const atoms = flatten(tree, [], { b: null, i: null }, [], [])
  const chars = atoms.map((a, index) => ({ a, index })).filter(({ a }) => a.kind === 'char')
  const text = chars.map(({ a }) => a.ch).join('')
  // Never cut a surrogate pair.
  const isLow = (k: number) =>
    /[\uDC00-\uDFFF]/.test(text[k] ?? '') && /[\uD800-\uDBFF]/.test(text[k - 1] ?? '')
  if (isLow(start)) start -= 1
  if (isLow(end)) end += 1
  const inRange = chars.slice(start, end)
  if (inRange.length === 0) return null
  const first = inRange[0]!.index
  const last = inRange[inRange.length - 1]!.index
  const turnOff = inRange.every(({ a }) => a.marks[mark] !== null)
  const span = atoms.slice(first, last + 1)
  let common = span[0]!.path.length
  for (const atom of span) {
    let k = 0
    while (k < common && k < atom.path.length && atom.path[k] === span[0]!.path[k]) k++
    common = k
  }
  for (let k = first; k <= last; k++) {
    const atom = atoms[k]!
    if (turnOff) {
      atoms[k] = { ...atom, marks: { ...atom.marks, [mark]: null } }
    } else if (!atom.marks[mark]) {
      atoms[k] = {
        ...atom,
        marks: { ...atom.marks, [mark]: { orig: null, depth: common } },
        order: atom.order.includes(mark) ? atom.order : [...atom.order, mark],
      }
    }
  }
  return rebuild(atoms, 0, new Set())
}
