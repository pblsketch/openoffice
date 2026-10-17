import React, { useEffect, useState } from 'react'
import { brandText, type Lang } from '@genoffice/i18n'
import { DOC_ATTACH_STRINGS } from './strings-doc-attach'

/** The document-picker calls an editor's preload exposes as window.aiOfficeDocs */
interface DocAttachBridge {
  available(): Promise<boolean>
  pick(): Promise<unknown>
}

function bridge(): DocAttachBridge | null {
  const b = (globalThis as { aiOfficeDocs?: Partial<DocAttachBridge> }).aiOfficeDocs
  return typeof b?.available === 'function' && typeof b.pick === 'function'
    ? (b as DocAttachBridge)
    : null
}

/** Paths the person picked, and lines to show beside the attachments */
export interface DocAttachPicked {
  paths: string[]
  notes: string[]
}

/** Read the shell's answer: picked paths, or why there are none */
export function docPickedOf(raw: unknown, lang: Lang): DocAttachPicked {
  const s = DOC_ATTACH_STRINGS[lang] ?? DOC_ATTACH_STRINGS.en
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.ok !== true) {
    if (r.reason === 'busy') return { paths: [], notes: [s.busy] }
    return { paths: [], notes: [] }
  }
  const paths = Array.isArray(r.paths)
    ? r.paths.filter((p): p is string => typeof p === 'string')
    : []
  return { paths, notes: [] }
}

/**
 * "Attach from documents" beside an AI panel's attach button. Drawn only while
 * the shell answers this editor's document-picker requests; the shell opens its
 * list window and the editor attaches the paths as it does files from this PC.
 */
export function DocAttachButton({
  lang,
  onPicked,
  className = 'ai-attach-btn',
}: {
  lang: Lang
  onPicked: (picked: DocAttachPicked) => void | Promise<void>
  className?: string
}) {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const b = bridge()
    if (!b) return
    let live = true
    void b.available().then((v) => live && setReady(v === true))
    return () => {
      live = false
    }
  }, [])
  if (!ready) return null
  const label = brandText((DOC_ATTACH_STRINGS[lang] ?? DOC_ATTACH_STRINGS.en).label, lang)
  const pick = async () => {
    const b = bridge()
    if (!b || busy) return
    setBusy(true)
    try {
      const picked = docPickedOf(await b.pick(), lang)
      if (picked.paths.length > 0 || picked.notes.length > 0) await onPicked(picked)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className={`${className} ai-doc-attach-btn`}
      onClick={() => void pick()}
      disabled={busy}
      data-tip={label}
      aria-label={label}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3 M8 8.5v4 M6 10.5h4" />
      </svg>
    </button>
  )
}
