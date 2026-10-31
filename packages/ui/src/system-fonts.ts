import { useEffect, useSyncExternalStore } from 'react'

import type { FontFamilyInfo, FontFamilyInfoMap } from './font-list'

/** The PC's installed families as the font pickers show them. */
export interface SystemFonts {
  readonly families: readonly string[]
  /** Korean name / Hangul coverage per family; empty until the main process answers */
  readonly info: FontFamilyInfoMap
}

/** What the loader needs from the page; the defaults are the real window and document. */
export interface SystemFontEnv {
  /** the Local Font Access enumeration, or undefined where the runtime has none */
  readonly queryLocalFonts?: (() => Promise<readonly { readonly family: string }[]>) | undefined
  readonly document?:
    Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined
  /** runs the start-up load once the page is idle, so it does not hold up the document's first paint */
  readonly whenIdle?: (run: () => void) => void
}

export interface SystemFontSource {
  get(): SystemFonts
  subscribe(listener: () => void): () => void
  /** Starts the enumeration unless it already succeeded or is running. */
  load(): void
  /** load() once the page is visible: the enumeration refuses a hidden page (a tab opened behind another). */
  preload(): void
}

const NONE: SystemFonts = { families: [], info: new Map() }

function defaultEnv(): SystemFontEnv {
  const w = globalThis as {
    queryLocalFonts?: () => Promise<readonly { readonly family: string }[]>
    requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number
    document?: Document
  }
  return {
    queryLocalFonts: w.queryLocalFonts?.bind(globalThis),
    document: w.document,
    whenIdle: (run) => {
      if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 })
      else setTimeout(run, 0)
    },
  }
}

/**
 * The PC's fonts for one editor page. The pickers used to start the enumeration only when
 * a font list was opened, and listed nothing from the PC until the main process had also
 * read every font file for the Korean names, so the first open showed the built-in list
 * alone. Now the page starts it when its first picker mounts, the families are listed as
 * soon as the enumeration answers, and the Korean names follow. A failed or empty
 * enumeration is not kept: the next open of a list tries again (with the click's user
 * activation, which a runtime that asks for permission wants).
 *
 * `familyInfo` asks the main process about the families; it is also asked when the
 * enumeration is empty, for families an app knows about besides the PC's (docs' bundled
 * template fonts).
 */
export function createSystemFontSource(
  familyInfo: (
    families: readonly string[],
  ) => Promise<ReadonlyArray<readonly [string, FontFamilyInfo]>>,
  env: SystemFontEnv = defaultEnv(),
): SystemFontSource {
  let fonts = NONE
  let running = false
  let loaded = false
  const listeners = new Set<() => void>()

  const publish = (next: SystemFonts) => {
    fonts = next
    for (const listener of listeners) listener()
  }

  async function queryFamilies(): Promise<readonly string[]> {
    if (!env.queryLocalFonts) return []
    try {
      const families = new Set<string>()
      for (const font of await env.queryLocalFonts()) if (font.family) families.add(font.family)
      return [...families].sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  async function run(): Promise<boolean> {
    const families = await queryFamilies()
    if (families.length > 0) publish({ families, info: fonts.info })
    let info: FontFamilyInfoMap = fonts.info
    try {
      info = new Map(await familyInfo(families))
    } catch {
      // without the Korean names the list still works
    }
    publish({ families: families.length > 0 ? families : fonts.families, info })
    return families.length > 0
  }

  const load = () => {
    if (loaded || running) return
    running = true
    void run()
      .then((ok) => {
        loaded = ok
      })
      .finally(() => {
        running = false
      })
  }

  let preloading = false
  const preload = () => {
    if (preloading) return
    preloading = true
    const doc = env.document
    const start = () => (env.whenIdle ? env.whenIdle(load) : load())
    if (!doc || doc.visibilityState === 'visible') return start()
    const onShow = () => {
      if (doc.visibilityState !== 'visible') return
      doc.removeEventListener('visibilitychange', onShow)
      start()
    }
    doc.addEventListener('visibilitychange', onShow)
  }

  return {
    get: () => fonts,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    preload,
  }
}

/**
 * The pickers' view of a source: every picker of the page shows the same list and is
 * redrawn when it grows. Mounting one starts the page's load; `load` stays for the
 * pickers' open clicks, which retry a load that failed.
 */
export function useSystemFontSource(
  source: SystemFontSource,
): SystemFonts & { readonly load: () => void } {
  const fonts = useSyncExternalStore(source.subscribe, source.get)
  useEffect(() => source.preload(), [source])
  return { families: fonts.families, info: fonts.info, load: source.load }
}
