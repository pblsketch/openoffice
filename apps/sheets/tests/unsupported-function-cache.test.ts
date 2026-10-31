import { afterEach, describe, expect, it } from 'vitest'

import { recalculableDefinedNames } from '../src/renderer/formula-closure'
import { canonicalFunctionName, extractFunctionNames } from '../src/renderer/formula-functions'
import { installSupportedFunctionProbe } from '../src/renderer/function-registry-probe'
import {
  engineResultKeepsCache,
  formulaKeepsCache,
  hasUsableCachedValue,
  recalcResultKeepsCache,
  setRecalculableNames,
  setSupportedFunctionProbe,
} from '../src/renderer/univer-sync'
import type { UniverRuntime } from '../src/renderer/univer-state'

// A stand-in for the live Univer registry: the functions the engine ships.
const ENGINE_FUNCTIONS = new Set([
  'SUM',
  'IF',
  'IFERROR',
  'ISERROR',
  'IFNA',
  'IFS',
  'CHOOSE',
  'LOG10',
  'CONCAT',
  'FILTER',
  'INDEX',
  'MATCH',
  'TRUE',
])

afterEach(() => {
  setSupportedFunctionProbe(null)
  setRecalculableNames(new Map())
})

describe('extractFunctionNames', () => {
  it('lists every called function, canonical and deduplicated', () => {
    expect(extractFunctionNames('IFERROR(FOOBARFN(A1),0)')).toEqual(['IFERROR', 'FOOBARFN'])
    expect(extractFunctionNames('IF(ISERROR(X(A1)),"",X(A1))')).toEqual(['IF', 'ISERROR', 'X'])
    expect(extractFunctionNames('=sum(a1:a2)+Sum(B1)')).toEqual(['SUM'])
  })

  it('strips Excel storage markers before lookup', () => {
    expect(extractFunctionNames('_xlfn.CONCAT(A1,_xlfn._xlws.FILTER(B:B,C:C))')).toEqual([
      'CONCAT',
      'FILTER',
    ])
    expect(canonicalFunctionName('_xlfn._xlws.sort')).toBe('SORT')
    expect(canonicalFunctionName('__xludf.DUMMYFUNCTION')).toBe('__XLUDF.DUMMYFUNCTION')
  })

  it('ignores names inside string literals and quoted sheet names', () => {
    expect(extractFunctionNames('CONCAT("SUM(",A1,")")')).toEqual(['CONCAT'])
    expect(extractFunctionNames('CONCAT("say ""FOO(""",A1)')).toEqual(['CONCAT'])
    expect(extractFunctionNames("SUM('Data (2024)'!A1:A3)")).toEqual(['SUM'])
    expect(extractFunctionNames("SUM('It''s (raw)'!A1)")).toEqual(['SUM'])
  })

  it('does not mistake references and names for calls', () => {
    expect(extractFunctionNames('Sheet1!A1+LOG10(A1)')).toEqual(['LOG10'])
    expect(extractFunctionNames('$A$1*Rate+TaxTable')).toEqual([])
    expect(extractFunctionNames('SUM(Table1[[#Headers],[Total (net)]])')).toEqual(['SUM'])
    expect(extractFunctionNames("[1]Sheet1!A1+'[2]Other'!B2")).toEqual([])
    expect(extractFunctionNames('1E5+2.5E-3*SUM(A1)')).toEqual(['SUM'])
    expect(extractFunctionNames('IF(B18>0,B18*الافتراضات!$B$30,0)')).toEqual(['IF'])
  })

  it('accepts blanks between the name and its parenthesis', () => {
    expect(extractFunctionNames('SUM (A1) + FOO\t(B1)')).toEqual(['SUM', 'FOO'])
  })
})

describe('formulaKeepsCache with the engine registry probe', () => {
  const install = (): void => {
    setSupportedFunctionProbe({ ready: () => true, supports: (name) => ENGINE_FUNCTIONS.has(name) })
  }

  it('keeps the cache for a bare unsupported call', () => {
    install()
    expect(formulaKeepsCache('FOOBARFN(A1)')).toBe(true)
  })

  it('keeps the cache when the unsupported call is wrapped in an error guard', () => {
    install()
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(true)
    expect(formulaKeepsCache('IF(ISERROR(FOOBARFN(A1)),"n/a",FOOBARFN(A1))')).toBe(true)
    expect(formulaKeepsCache('IFNA(FOOBARFN(A1),"")')).toBe(true)
    expect(formulaKeepsCache('IFS(ISERROR(FOOBARFN(A1)),0,TRUE(),FOOBARFN(A1))')).toBe(true)
    expect(formulaKeepsCache('CHOOSE(1,FOOBARFN(A1),0)')).toBe(true)
  })

  it('looks the function up by its plain name behind the _xlfn. marker', () => {
    install()
    expect(formulaKeepsCache('IFERROR(_xlfn.FOOBARFN(A1),0)')).toBe(true)
    expect(formulaKeepsCache('_xlfn.CONCAT(A1,_xlfn._xlws.FILTER(B:B,C:C))')).toBe(false)
  })

  it('does not count function names inside string literals', () => {
    install()
    expect(formulaKeepsCache('CONCAT("FOOBARFN(",A1,")")')).toBe(false)
    expect(formulaKeepsCache('IF(A1="FOOBARFN(x)",1,0)')).toBe(false)
  })

  it('recalculates formulas built only of supported functions', () => {
    install()
    expect(formulaKeepsCache('IFERROR(SUM(A1:A2),0)')).toBe(false)
    expect(formulaKeepsCache('IF(ISERROR(INDEX(A:A,MATCH(B1,C:C,0))),"",1)')).toBe(false)
    expect(formulaKeepsCache('sum(A1:A5)')).toBe(false)
  })

  it('treats sheet and cell references as references, not calls', () => {
    install()
    expect(formulaKeepsCache('Sheet1!A1+LOG10(A1)')).toBe(false)
    expect(formulaKeepsCache("SUM('Data (2024)'!A1:A3)")).toBe(false)
  })

  it('has nothing to keep without a cached value, so the engine gets the formula', () => {
    install()
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)', false)).toBe(false)
    expect(formulaKeepsCache('FOOBARFN(A1)', false)).toBe(false)
    // The pre-existing classes keep the cell cache-only regardless.
    expect(formulaKeepsCache('IFERROR(__xludf.DUMMYFUNCTION("X"),0)', false)).toBe(true)
    expect(formulaKeepsCache('DOLLAR(A1)', false)).toBe(true)
    expect(formulaKeepsCache('A1*TaxRate', false)).toBe(true)
  })

  it('assumes every function is supported until a probe is installed', () => {
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(false)
  })

  it('drops memoised verdicts when the probe changes', () => {
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(false)
    install()
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(true)
    setSupportedFunctionProbe({ ready: () => true, supports: () => true })
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(false)
  })

  it('keeps the pre-existing keep-cache classes', () => {
    install()
    expect(formulaKeepsCache('IFERROR(__xludf.DUMMYFUNCTION("""X"""),46235.0)')).toBe(true)
    expect(formulaKeepsCache('NUMBERSTRING(B2,1)')).toBe(true)
    expect(formulaKeepsCache('SUM(Revenue)')).toBe(true)
    expect(formulaKeepsCache('[1]Sheet1!A1*2')).toBe(true)
  })
})

describe('formulaKeepsCache through defined names', () => {
  const open = (definedNames: { name: string; formula: string }[]): void => {
    setSupportedFunctionProbe({ ready: () => true, supports: (name) => ENGINE_FUNCTIONS.has(name) })
    setRecalculableNames(recalculableDefinedNames(definedNames, new Set()))
  }

  it('keeps the cache when a name calls a function the engine lacks', () => {
    open([
      { name: '계산', formula: 'EVALUATE(Data!$A$1)' },
      { name: '색', formula: 'GET.CELL(63,Data!$A$1)' },
    ])
    // Without the name body check IFERROR swallows #NAME? into 0.
    expect(formulaKeepsCache('IFERROR(계산,0)')).toBe(true)
    expect(formulaKeepsCache('색')).toBe(true)
    // Like a cell formula, nothing cached means the engine gets it.
    expect(formulaKeepsCache('IFERROR(계산,0)', false)).toBe(false)
  })

  it('keeps the cache for a name that calls INDIRECT, cached or not', () => {
    open([{ name: '계산', formula: 'EVALUATE(INDIRECT("rc[-1]",FALSE))' }])
    expect(formulaKeepsCache('IFERROR(계산,0)')).toBe(true)
    expect(formulaKeepsCache('IFERROR(계산,0)', false)).toBe(true)
  })

  it('applies the locale and Google export checks to name bodies', () => {
    open([
      { name: '한글금액', formula: 'NUMBERSTRING(Data!$B$1,1)' },
      { name: 'Google', formula: 'IFERROR(__xludf.DUMMYFUNCTION("X"),0)' },
    ])
    expect(formulaKeepsCache('한글금액', false)).toBe(true)
    expect(formulaKeepsCache('Google+1', false)).toBe(true)
  })

  it('follows names through other names', () => {
    open([
      { name: '한글금액', formula: 'NUMBERSTRING(Data!$B$1,1)' },
      { name: '금액표시', formula: '한글금액&"원"' },
      { name: '계산', formula: 'EVALUATE(Data!$A$1)' },
      { name: '두배', formula: '계산*2' },
    ])
    expect(formulaKeepsCache('금액표시', false)).toBe(true)
    expect(formulaKeepsCache('IFERROR(두배,0)')).toBe(true)
  })

  it('recalculates names built only of supported functions', () => {
    open([
      { name: 'Rate', formula: 'Data!$B$1' },
      { name: 'Total', formula: 'SUM(Data!$B$2:$B$9)*Rate' },
    ])
    expect(formulaKeepsCache('IFERROR(B2*Rate,0)')).toBe(false)
    expect(formulaKeepsCache('Total')).toBe(false)
  })
})

describe('installSupportedFunctionProbe', () => {
  // A stand-in IFunctionService over a mutable executor set.
  const runtimeOver = (executors: Set<string>): UniverRuntime => {
    const functionService = {
      hasExecutor: (name: string) => executors.has(name),
      getExecutors: () => new Map([...executors].map((name) => [name, {}])),
    }
    return {
      univer: { __getInjector: () => ({ get: () => functionService }) },
    } as unknown as UniverRuntime
  }

  it('answers from the live registry', () => {
    const disposable = installSupportedFunctionProbe(
      runtimeOver(new Set(['SUM', 'IFERROR', 'CELL'])),
    )
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(true)
    expect(formulaKeepsCache('IFERROR(SUM(A1:A2),0)')).toBe(false)
    expect(formulaKeepsCache('CELL("filename",A1)')).toBe(false)
    disposable.dispose()
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(false)
  })

  it('assumes support until the builtin batch lands, without memoising', () => {
    // Before the engine plugin's onReady only the app's own executors exist:
    // a non-empty registry that still knows nothing about SUM or IFERROR.
    const executors = new Set(['CELL', 'RATE', 'MINIFS'])
    const disposable = installSupportedFunctionProbe(runtimeOver(executors))
    expect(formulaKeepsCache('IFERROR(SUM(A1:A2),0)')).toBe(false)
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(false)
    for (const name of ['SUM', 'IFERROR', 'IF']) executors.add(name)
    // The same formulas, asked again once the batch has landed: a verdict
    // memoised in the blind window would still say "recompute".
    expect(formulaKeepsCache('IFERROR(FOOBARFN(A1),0)')).toBe(true)
    expect(formulaKeepsCache('IFERROR(SUM(A1:A2),0)')).toBe(false)
    disposable.dispose()
  })
})

describe('hasUsableCachedValue', () => {
  it('accepts numbers, text and booleans, rejects blanks and error literals', () => {
    expect(hasUsableCachedValue(42)).toBe(true)
    expect(hasUsableCachedValue(0)).toBe(true)
    expect(hasUsableCachedValue('hello')).toBe(true)
    expect(hasUsableCachedValue('')).toBe(true)
    expect(hasUsableCachedValue(false)).toBe(true)
    expect(hasUsableCachedValue(null)).toBe(false)
    expect(hasUsableCachedValue(undefined)).toBe(false)
    expect(hasUsableCachedValue('#NAME?')).toBe(false)
    expect(hasUsableCachedValue('#N/A')).toBe(false)
  })

  it("rejects IronCalc's #ERROR! left behind by an earlier save", () => {
    expect(hasUsableCachedValue('#ERROR!')).toBe(false)
  })
})

describe('engineResultKeepsCache', () => {
  it('keeps the cache for engine failures rather than Excel error values', () => {
    expect(engineResultKeepsCache('#NAME?', 'FOO(A1)')).toBe(true)
    // external-workbook references never parse; the cascade must stop here
    expect(engineResultKeepsCache('#ERROR!', '[1]Sheet1!A1*2')).toBe(true)
    expect(engineResultKeepsCache('#ERROR!', undefined)).toBe(true)
    expect(engineResultKeepsCache('#DIV/0!', 'A1/0')).toBe(false)
    expect(engineResultKeepsCache('#N/A', 'VLOOKUP(A1,B:C,2,0)')).toBe(false)
  })

  it('keeps the cache for locale-minted results', () => {
    expect(engineResultKeepsCache('$1.00', 'DOLLAR(A1)')).toBe(true)
    expect(engineResultKeepsCache('42', 'SUM(A1:A3)')).toBe(false)
    expect(engineResultKeepsCache('42', undefined)).toBe(false)
  })
})

describe('recalcResultKeepsCache', () => {
  const aggregate = 'IFERROR(INDEX(A:R,AGGREGATE(15,6,ROW(B2:B40)/(B2:B40=$A$3),1),2),"")'

  it('keeps a usable cache over a blank or error result before any edit', () => {
    expect(recalcResultKeepsCache('', aggregate, 700, false)).toBe(true)
    expect(recalcResultKeepsCache('#DIV/0!', 'D5/B5', 3.43, false)).toBe(true)
    expect(recalcResultKeepsCache('#N/A', 'VLOOKUP(A1,B:C,2,0)', 'found', false)).toBe(true)
    expect(recalcResultKeepsCache('#DIV/0!', 'D5/B5', '', false)).toBe(true)
  })

  it('overlays when the cache has nothing better', () => {
    expect(recalcResultKeepsCache('', aggregate, undefined, false)).toBe(false)
    expect(recalcResultKeepsCache('', aggregate, null, false)).toBe(false)
    expect(recalcResultKeepsCache('#DIV/0!', 'D5/B5', '#N/A', false)).toBe(false)
    expect(recalcResultKeepsCache('42', 'SUM(A1:A3)', 7, false)).toBe(false)
  })

  it('lets edited workbooks show blank and error results', () => {
    expect(recalcResultKeepsCache('', aggregate, 700, true)).toBe(false)
    expect(recalcResultKeepsCache('#DIV/0!', 'D5/B5', 3.43, true)).toBe(false)
    // Engine failures still keep the cache regardless of edits.
    expect(recalcResultKeepsCache('#NAME?', 'FOO(A1)', 1, true)).toBe(true)
    expect(recalcResultKeepsCache('#ERROR!', undefined, 1, true)).toBe(true)
  })
})
