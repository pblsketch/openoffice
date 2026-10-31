/**
 * Hangul's 표 자동 채우기 (A in a cell block): the cells of the block are filled from the cells
 * the user typed first. These are the rules Hancom Hangul 2024 follows, read from what its own
 * auto fill wrote into tables made through its automation interface (2026-10-31):
 *
 * - The block is read as lines: columns when it is taller than wide, rows otherwise.
 * - A line's seeds are its leading non-empty cells; every cell after them is overwritten, an
 *   existing value included. A line with no seed carries on the previous line's series.
 * - One seed is copied. Two or more numbers go on by their step, or by their ratio when the step
 *   is not constant; a number inside text ("1번", "제2과") goes on the same way when the text
 *   around it is the same. Seeds that are consecutive items of a list (가나다, 갑을병정, the earthly branches,
 *   weekdays, months, letters) go on through the list and wrap round at its end, though seeds
 *   across the end (계, 갑) are no series. Hanja numerals and 첫째·둘째 count on past ten. Anything else
 *   repeats the seeds in turn.
 * - Numbers are written plainly: no thousands commas, no leading zeros, no trailing zeros.
 *
 * Pure functions; hancom-keys.mjs reads and writes the cells.
 */

const chars = (s) => [...s]
const range = (from, to) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + i),
  )
const startingAt = (items, first) => [
  ...items.slice(items.indexOf(first)),
  ...items.slice(0, items.indexOf(first)),
]

const WEEK_KO = chars('일월화수목금토')
const WEEK_KO_LONG = WEEK_KO.map((d) => `${d}요일`)
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_EN_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_EN_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The lists a series may follow. A week is listed from Sunday and from Monday, so 토·일 and
 * 일·월 are both series, as they are in Hangul.
 */
export const FILL_LISTS = [
  WEEK_KO,
  startingAt(WEEK_KO, '월'),
  WEEK_KO_LONG,
  startingAt(WEEK_KO_LONG, '월요일'),
  WEEK_EN,
  startingAt(WEEK_EN, 'Mon'),
  WEEK_EN_LONG,
  startingAt(WEEK_EN_LONG, 'Monday'),
  MONTHS_EN_LONG,
  MONTHS_EN_LONG.map((m) => m.slice(0, 3)),
  chars('갑을병정무기경신임계'),
  chars('子丑寅卯辰巳午未申酉戌亥'),
  chars('자축인묘진사오미신유술해'),
  chars('가나다라마바사아자차카타파하'),
  chars('ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'),
  range('A', 'Z'),
  range('a', 'z'),
]

const PLAIN_NUMBER = /^\s*[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*$/
const NUMBER_IN_TEXT = /[-+]?\d+(?:\.\d+)?/g

/** A cell's text as a number when it is one (thousands commas allowed), else null. */
export function plainNumber(text) {
  if (!PLAIN_NUMBER.test(text)) return null
  const value = Number(text.trim().replaceAll(',', ''))
  return Number.isFinite(value) ? value : null
}

/** A number as Hangul writes it in a filled cell: shortest form, no float noise. */
export function formatNumber(value) {
  const clean = Number(value.toPrecision(12))
  return Object.is(clean, -0) ? '0' : String(clean)
}

const same = (a, b) => Number(a.toPrecision(12)) === Number(b.toPrecision(12))

/** The value at place k of a run of numbers: by step, by ratio (three or more), or null. */
function numberSeries(values) {
  if (values.length < 2) return null
  const step = values[1] - values[0]
  if (values.every((v, i) => i === 0 || same(v - values[i - 1], step))) {
    return (k) => values[0] + step * k
  }
  if (values.length >= 3 && values.every((v) => v !== 0)) {
    const ratio = values[1] / values[0]
    if (values.every((v, i) => i === 0 || same(v / values[i - 1], ratio))) {
      return (k) => values[0] * ratio ** k
    }
  }
  return null
}

const HANJA_DIGITS = chars('一二三四五六七八九')
const HANJA_UNITS = [
  ['千', 1000],
  ['百', 100],
  ['十', 10],
]

/** A Hanja numeral from one to 9999 as a number, else null. */
export function hanjaNumber(text) {
  let rest = text
  let total = 0
  for (const [unit, size] of HANJA_UNITS) {
    const at = rest.indexOf(unit)
    if (at === -1) continue
    const head = rest.slice(0, at)
    let digit = 1
    if (head !== '') {
      if (head.length !== 1 || !HANJA_DIGITS.includes(head)) return null
      digit = HANJA_DIGITS.indexOf(head) + 1
    }
    total += digit * size
    rest = rest.slice(at + 1)
  }
  if (rest !== '') {
    if (rest.length !== 1 || !HANJA_DIGITS.includes(rest)) return null
    total += HANJA_DIGITS.indexOf(rest) + 1
  }
  return total > 0 && text !== '' ? total : null
}

/** A number from 1 to 9999 in Hanja numerals; a one before ten, hundred or thousand is left out. */
export function hanjaNumeral(n) {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null
  let out = ''
  let rest = n
  for (const [unit, size] of HANJA_UNITS) {
    const digit = Math.floor(rest / size)
    if (digit > 0) out += (digit > 1 ? HANJA_DIGITS[digit - 1] : '') + unit
    rest %= size
  }
  if (rest > 0) out += HANJA_DIGITS[rest - 1]
  return out
}

const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉']
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']

/** 첫째, 둘째 … 아흔아홉째; past ten Hangul counts 열하나째, 열둘째. */
export function nativeOrdinal(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99) return null
  if (n === 1) return '첫째'
  return `${NATIVE_TENS[Math.floor(n / 10)]}${NATIVE_ONES[n % 10]}째`
}

const ORDINALS = new Map(Array.from({ length: 99 }, (_, i) => [nativeOrdinal(i + 1), i + 1]))

/** Seeds that count by one in a numbering that is generated rather than listed. */
function countedSeries(seeds, read, write) {
  const values = seeds.map(read)
  if (values.some((v) => v === null)) return null
  if (!values.every((v, i) => i === 0 || v === values[i - 1] + 1)) return null
  return (k) => write(values[0] + k) ?? ''
}

function listSeries(seeds) {
  for (const items of FILL_LISTS) {
    const start = items.indexOf(seeds[0])
    if (start === -1) continue
    if (seeds.every((s, i) => items[start + i] === s)) {
      return (k) => items[(start + k) % items.length]
    }
  }
  return null
}

/** One number in each seed with the same text around it: "1번", "제2과", "v1.9". */
function numberInTextSeries(seeds) {
  const parts = []
  for (const seed of seeds) {
    const found = [...seed.matchAll(NUMBER_IN_TEXT)]
    if (found.length !== 1) return null
    const [match] = found
    parts.push({
      before: seed.slice(0, match.index),
      after: seed.slice(match.index + match[0].length),
      value: Number(match[0]),
    })
  }
  const { before, after } = parts[0]
  if (!parts.every((p) => p.before === before && p.after === after)) return null
  const series = numberSeries(parts.map((p) => p.value))
  return series && ((k) => `${before}${formatNumber(series(k))}${after}`)
}

/**
 * The series a line's seeds start: a function from a place in the series (0 is the first seed)
 * to the text that goes there.
 */
export function fillSeries(seeds) {
  if (seeds.length === 1) return () => seeds[0]
  const numbers = seeds.map(plainNumber)
  if (numbers.every((n) => n !== null)) {
    const series = numberSeries(numbers)
    if (series) return (k) => formatNumber(series(k))
  } else {
    const series =
      listSeries(seeds) ??
      countedSeries(seeds, hanjaNumber, hanjaNumeral) ??
      countedSeries(seeds, (s) => ORDINALS.get(s) ?? null, nativeOrdinal) ??
      numberInTextSeries(seeds)
    if (series) return series
  }
  return (k) => seeds[k % seeds.length]
}

const filled = (text) => typeof text === 'string' && text.trim() !== ''

/**
 * What auto fill writes into a block, given its cells' texts row by row: the same shape, with the
 * new text of each cell or null where it stays as it is.
 */
export function autoFillBlock(grid) {
  const rows = grid.length
  const cols = rows > 0 ? grid[0].length : 0
  const out = grid.map((row) => row.map(() => null))
  if (rows === 0 || cols === 0) return out
  const vertical = rows > cols
  const lineCount = vertical ? cols : rows
  const lineLength = vertical ? rows : cols
  const at = (line, i) => (vertical ? [i, line] : [line, i])
  let carried = null
  for (let line = 0; line < lineCount; line += 1) {
    const texts = Array.from({ length: lineLength }, (_, i) => {
      const [r, c] = at(line, i)
      return grid[r][c]
    })
    let seedCount = 0
    while (seedCount < lineLength && filled(texts[seedCount])) seedCount += 1
    let series
    let offset
    if (seedCount > 0) {
      series = fillSeries(texts.slice(0, seedCount))
      offset = 0
      carried = { series, next: lineLength }
    } else if (carried) {
      series = carried.series
      offset = carried.next
      carried.next += lineLength
    } else {
      continue
    }
    for (let i = seedCount; i < lineLength; i += 1) {
      const [r, c] = at(line, i)
      const value = series(offset + i)
      if (value !== grid[r][c]) out[r][c] = value
    }
  }
  return out
}
