/**
 * Univer UI locale wiring. createUniver boots with en-US (the packs
 * are needed synchronously); once the runtime exists, the app language picks
 * the matching Univer language packs — every preset ships all 19 — and
 * switches LocaleService, which re-renders the whole Univer React tree
 * (rule-management panels, dialogs, menus). Languages Univer has no pack for
 * (th/nl/ms/he/hi/cs) stay English there; cell number formats follow the app
 * language separately (applyNumfmtLocale below).
 */
import { LocaleService, LocaleType, mergeLocales, type ILocales } from '@univerjs/core'
import { SheetsNumfmtCellContentController } from '@univerjs/preset-sheets-core'

import { numfmtLocaleFor } from './i18n/numfmt-locale'
import type { UniverRuntime } from './univer-state'

type LocalePack = Record<string, unknown>

const UNIVER_LOCALES: Record<
  string,
  { type: LocaleType; load(): Promise<{ default: LocalePack }[]> }
> = {
  zh: {
    type: LocaleType.ZH_CN,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/zh-CN'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/zh-CN'),
        import('@univerjs/preset-sheets-data-validation/locales/zh-CN'),
        import('@univerjs/preset-sheets-drawing/locales/zh-CN'),
        import('@univerjs/preset-sheets-filter/locales/zh-CN'),
        import('@univerjs/preset-sheets-find-replace/locales/zh-CN'),
        import('@univerjs/preset-sheets-note/locales/zh-CN'),
        import('@univerjs/preset-sheets-sort/locales/zh-CN'),
        import('@univerjs/preset-sheets-table/locales/zh-CN'),
      ]),
  },
  ja: {
    type: LocaleType.JA_JP,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/ja-JP'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/ja-JP'),
        import('@univerjs/preset-sheets-data-validation/locales/ja-JP'),
        import('@univerjs/preset-sheets-drawing/locales/ja-JP'),
        import('@univerjs/preset-sheets-filter/locales/ja-JP'),
        import('@univerjs/preset-sheets-find-replace/locales/ja-JP'),
        import('@univerjs/preset-sheets-note/locales/ja-JP'),
        import('@univerjs/preset-sheets-sort/locales/ja-JP'),
        import('@univerjs/preset-sheets-table/locales/ja-JP'),
      ]),
  },
  ko: {
    type: LocaleType.KO_KR,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/ko-KR'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/ko-KR'),
        import('@univerjs/preset-sheets-data-validation/locales/ko-KR'),
        import('@univerjs/preset-sheets-drawing/locales/ko-KR'),
        import('@univerjs/preset-sheets-filter/locales/ko-KR'),
        import('@univerjs/preset-sheets-find-replace/locales/ko-KR'),
        import('@univerjs/preset-sheets-note/locales/ko-KR'),
        import('@univerjs/preset-sheets-sort/locales/ko-KR'),
        import('@univerjs/preset-sheets-table/locales/ko-KR'),
      ]),
  },
  fr: {
    type: LocaleType.FR_FR,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/fr-FR'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/fr-FR'),
        import('@univerjs/preset-sheets-data-validation/locales/fr-FR'),
        import('@univerjs/preset-sheets-drawing/locales/fr-FR'),
        import('@univerjs/preset-sheets-filter/locales/fr-FR'),
        import('@univerjs/preset-sheets-find-replace/locales/fr-FR'),
        import('@univerjs/preset-sheets-note/locales/fr-FR'),
        import('@univerjs/preset-sheets-sort/locales/fr-FR'),
        import('@univerjs/preset-sheets-table/locales/fr-FR'),
      ]),
  },
  de: {
    type: LocaleType.DE_DE,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/de-DE'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/de-DE'),
        import('@univerjs/preset-sheets-data-validation/locales/de-DE'),
        import('@univerjs/preset-sheets-drawing/locales/de-DE'),
        import('@univerjs/preset-sheets-filter/locales/de-DE'),
        import('@univerjs/preset-sheets-find-replace/locales/de-DE'),
        import('@univerjs/preset-sheets-note/locales/de-DE'),
        import('@univerjs/preset-sheets-sort/locales/de-DE'),
        import('@univerjs/preset-sheets-table/locales/de-DE'),
      ]),
  },
  es: {
    type: LocaleType.ES_ES,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/es-ES'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/es-ES'),
        import('@univerjs/preset-sheets-data-validation/locales/es-ES'),
        import('@univerjs/preset-sheets-drawing/locales/es-ES'),
        import('@univerjs/preset-sheets-filter/locales/es-ES'),
        import('@univerjs/preset-sheets-find-replace/locales/es-ES'),
        import('@univerjs/preset-sheets-note/locales/es-ES'),
        import('@univerjs/preset-sheets-sort/locales/es-ES'),
        import('@univerjs/preset-sheets-table/locales/es-ES'),
      ]),
  },
  id: {
    type: LocaleType.ID_ID,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/id-ID'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/id-ID'),
        import('@univerjs/preset-sheets-data-validation/locales/id-ID'),
        import('@univerjs/preset-sheets-drawing/locales/id-ID'),
        import('@univerjs/preset-sheets-filter/locales/id-ID'),
        import('@univerjs/preset-sheets-find-replace/locales/id-ID'),
        import('@univerjs/preset-sheets-note/locales/id-ID'),
        import('@univerjs/preset-sheets-sort/locales/id-ID'),
        import('@univerjs/preset-sheets-table/locales/id-ID'),
      ]),
  },
  ru: {
    type: LocaleType.RU_RU,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/ru-RU'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/ru-RU'),
        import('@univerjs/preset-sheets-data-validation/locales/ru-RU'),
        import('@univerjs/preset-sheets-drawing/locales/ru-RU'),
        import('@univerjs/preset-sheets-filter/locales/ru-RU'),
        import('@univerjs/preset-sheets-find-replace/locales/ru-RU'),
        import('@univerjs/preset-sheets-note/locales/ru-RU'),
        import('@univerjs/preset-sheets-sort/locales/ru-RU'),
        import('@univerjs/preset-sheets-table/locales/ru-RU'),
      ]),
  },
  ar: {
    type: LocaleType.AR_SA,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/ar-SA'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/ar-SA'),
        import('@univerjs/preset-sheets-data-validation/locales/ar-SA'),
        import('@univerjs/preset-sheets-drawing/locales/ar-SA'),
        import('@univerjs/preset-sheets-filter/locales/ar-SA'),
        import('@univerjs/preset-sheets-find-replace/locales/ar-SA'),
        import('@univerjs/preset-sheets-note/locales/ar-SA'),
        import('@univerjs/preset-sheets-sort/locales/ar-SA'),
        import('@univerjs/preset-sheets-table/locales/ar-SA'),
      ]),
  },
  pt: {
    type: LocaleType.PT_BR,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/pt-BR'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/pt-BR'),
        import('@univerjs/preset-sheets-data-validation/locales/pt-BR'),
        import('@univerjs/preset-sheets-drawing/locales/pt-BR'),
        import('@univerjs/preset-sheets-filter/locales/pt-BR'),
        import('@univerjs/preset-sheets-find-replace/locales/pt-BR'),
        import('@univerjs/preset-sheets-note/locales/pt-BR'),
        import('@univerjs/preset-sheets-sort/locales/pt-BR'),
        import('@univerjs/preset-sheets-table/locales/pt-BR'),
      ]),
  },
  it: {
    type: LocaleType.IT_IT,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/it-IT'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/it-IT'),
        import('@univerjs/preset-sheets-data-validation/locales/it-IT'),
        import('@univerjs/preset-sheets-drawing/locales/it-IT'),
        import('@univerjs/preset-sheets-filter/locales/it-IT'),
        import('@univerjs/preset-sheets-find-replace/locales/it-IT'),
        import('@univerjs/preset-sheets-note/locales/it-IT'),
        import('@univerjs/preset-sheets-sort/locales/it-IT'),
        import('@univerjs/preset-sheets-table/locales/it-IT'),
      ]),
  },
  pl: {
    type: LocaleType.PL_PL,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/pl-PL'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/pl-PL'),
        import('@univerjs/preset-sheets-data-validation/locales/pl-PL'),
        import('@univerjs/preset-sheets-drawing/locales/pl-PL'),
        import('@univerjs/preset-sheets-filter/locales/pl-PL'),
        import('@univerjs/preset-sheets-find-replace/locales/pl-PL'),
        import('@univerjs/preset-sheets-note/locales/pl-PL'),
        import('@univerjs/preset-sheets-sort/locales/pl-PL'),
        import('@univerjs/preset-sheets-table/locales/pl-PL'),
      ]),
  },
  vi: {
    type: LocaleType.VI_VN,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/vi-VN'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/vi-VN'),
        import('@univerjs/preset-sheets-data-validation/locales/vi-VN'),
        import('@univerjs/preset-sheets-drawing/locales/vi-VN'),
        import('@univerjs/preset-sheets-filter/locales/vi-VN'),
        import('@univerjs/preset-sheets-find-replace/locales/vi-VN'),
        import('@univerjs/preset-sheets-note/locales/vi-VN'),
        import('@univerjs/preset-sheets-sort/locales/vi-VN'),
        import('@univerjs/preset-sheets-table/locales/vi-VN'),
      ]),
  },
  'zh-TW': {
    type: LocaleType.ZH_TW,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/zh-TW'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/zh-TW'),
        import('@univerjs/preset-sheets-data-validation/locales/zh-TW'),
        import('@univerjs/preset-sheets-drawing/locales/zh-TW'),
        import('@univerjs/preset-sheets-filter/locales/zh-TW'),
        import('@univerjs/preset-sheets-find-replace/locales/zh-TW'),
        import('@univerjs/preset-sheets-note/locales/zh-TW'),
        import('@univerjs/preset-sheets-sort/locales/zh-TW'),
        import('@univerjs/preset-sheets-table/locales/zh-TW'),
      ]),
  },
}

const NUMBER_AS_TEXT_MESSAGE =
  'The value in this cell is stored as text — it will not be treated as a number in formulas.'

/**
 * Both "number stored as text" alerts title themselves "Error" (and sheets-ui
 * 0.25.1 references info keys no pack ships). Title with the numfmt pack's
 * localized "Number stored as text"; spread the namespaces because mergeLocales
 * merges shallowly.
 */
export function numberAsTextAlertLocale(pack: LocalePack): LocalePack {
  const ns = (name: string) => (pack[name] ?? {}) as Record<string, unknown>
  const info = (name: string) => (ns(name).info ?? {}) as Record<string, string>
  const title = info('sheets-numfmt-ui').forceStringInfo ?? 'Number stored as text'
  const patched = (name: string) => ({
    ...ns(name),
    info: { ...info(name), error: title, forceStringInfo: NUMBER_AS_TEXT_MESSAGE },
  })
  return { 'sheets-ui': patched('sheets-ui'), 'sheets-numfmt-ui': patched('sheets-numfmt-ui') }
}

/**
 * Excel wording for the insert-rows context entries: the upstream en pack
 * pairs "Insert N rows above" with "Insert N rows AFTER" (feedback #302 —
 * "it should be below, not after"; the insert itself lands directly under
 * the selection, only the label misleads). Non-English packs already say
 * below (the zh pack reads "insert below"), so the guard keys the patch to
 * the English text.
 */
export function insertRowsBelowLocale(pack: LocalePack): LocalePack {
  const sheetsUi = (pack['sheets-ui'] ?? {}) as Record<string, unknown>
  const rightClick = (sheetsUi.rightClick ?? {}) as Record<string, string>
  if (rightClick.insertRowsAfterSuffix !== 'rows after') return { 'sheets-ui': sheetsUi }
  return {
    'sheets-ui': {
      ...sheetsUi,
      rightClick: { ...rightClick, insertRowsAfterSuffix: 'rows below' },
    },
  }
}

export function univerLocaleFor(lang: string): LocaleType | null {
  return UNIVER_LOCALES[lang]?.type ?? null
}

/// A language switch can finish loading after a newer one started; only the
/// latest load may call setLocale.
const localeLoadGeneration = new WeakMap<UniverRuntime, number>()

/**
 * Number formats render through Univer's `numfmt` controller, whose locale
 * starts at English and never falls back to LocaleService. Without this call a
 * Korean `aaa`/`dddd` (or `mmm`, AM/PM) stays English while the rest of the UI
 * is Korean. The controller is the DI token the preset's numfmt plugin
 * registers.
 */
export function applyNumfmtLocale(runtime: UniverRuntime, lang: string): void {
  const controller = runtime.univer.__getInjector().get(SheetsNumfmtCellContentController) as {
    setNumfmtLocal(locale: string): void
  }
  controller.setNumfmtLocal(numfmtLocaleFor(lang))
}

export async function applyUniverLocale(runtime: UniverRuntime, lang: string): Promise<void> {
  // Number formats have their own locale map and cover languages Univer has
  // no UI pack for (th/nl/cs/he/hi), so set it before the pack lookup returns.
  try {
    applyNumfmtLocale(runtime, lang)
  } catch (error) {
    // Display-only: losing localized weekday names must not stop the UI packs.
    console.warn('[sheets] number-format locale', error)
  }
  const entry = UNIVER_LOCALES[lang]
  if (!entry) return
  const generation = (localeLoadGeneration.get(runtime) ?? 0) + 1
  localeLoadGeneration.set(runtime, generation)
  const packs = (await entry.load()).map((mod) => mod.default)
  if (localeLoadGeneration.get(runtime) !== generation) return
  const merged = mergeLocales(...packs) as LocalePack
  Object.assign(merged, numberAsTextAlertLocale(merged))
  Object.assign(merged, insertRowsBelowLocale(merged))
  const localeService = runtime.univer.__getInjector().get(LocaleService)
  localeService.load({ [entry.type]: merged } as unknown as ILocales)
  localeService.setLocale(entry.type)
}
