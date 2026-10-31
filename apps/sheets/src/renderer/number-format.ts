import { getSystemShortDate } from '@genoffice/xlsx-gateway/shared/short-date'
import {
  defaultNumfmtOptions,
  longDatePattern,
  numfmtPattern,
  type NumfmtOptions,
} from './numfmt-dialog'
import { getLang } from './i18n/locale'
import { numberFormatLabel } from './selection-format'
import type { StringKey } from './i18n/locale'

// display only — option values keep the English label as the command identity
export const NUMBER_FORMAT_LABEL: Record<string, StringKey> = {
  General: 'dlgFcNumGeneral',
  Number: 'dlgFcNumNumber',
  Currency: 'dlgFcNumCurrency',
  Accounting: 'appNumFmtAccounting',
  'Short Date': 'appNumFmtShortDate',
  'Long Date': 'appNumFmtLongDate',
  Time: 'dlgFcNumTime',
  Percentage: 'dlgFcNumPercent',
  Fraction: 'appNumFmtFraction',
  Scientific: 'dlgFcNumScientific',
  Text: 'dlgFcNumText',
}

const pattern = (overrides: Partial<NumfmtOptions>, lang: string): string =>
  numfmtPattern({ ...defaultNumfmtOptions(lang), ...overrides })

/// Excel's Number-group category dropdown: label → representative pattern,
/// built by the same builders as the Format Cells dialog (numfmt-dialog.ts).
/// A function because Short Date follows the workbook's system pattern and
/// currency/long-date follow the UI language.
export function numberFormatCategories(lang: string = getLang()): ReadonlyArray<{
  readonly label: string
  readonly pattern: string
}> {
  return [
    { label: 'General', pattern: pattern({ category: 'general' }, lang) },
    { label: 'Number', pattern: pattern({ category: 'number' }, lang) },
    { label: 'Currency', pattern: pattern({ category: 'currency' }, lang) },
    { label: 'Accounting', pattern: pattern({ category: 'accounting' }, lang) },
    {
      label: 'Short Date',
      pattern: pattern({ category: 'date', datePattern: getSystemShortDate() }, lang),
    },
    {
      label: 'Long Date',
      pattern: pattern({ category: 'date', datePattern: longDatePattern(lang) }, lang),
    },
    { label: 'Time', pattern: pattern({ category: 'time', timePattern: 'h:mm:ss AM/PM' }, lang) },
    { label: 'Percentage', pattern: pattern({ category: 'percentage' }, lang) },
    { label: 'Fraction', pattern: pattern({ category: 'fraction' }, lang) },
    { label: 'Scientific', pattern: pattern({ category: 'scientific' }, lang) },
    { label: 'Text', pattern: pattern({ category: 'text' }, lang) },
  ]
}

/// The dropdown echo for the current selection. The generic 'Date' category
/// splits into Short/Long by whether the pattern spells out day or month names
/// (Korean date tokens are aaaa/aaa rather than dddd/mmm).
export function categoryOptionForPattern(pattern: string): string {
  const label = numberFormatLabel(pattern)
  if (label !== 'Date') return label
  return /dddd|mmmm|aaaa/i.test(pattern) ? 'Long Date' : 'Short Date'
}
