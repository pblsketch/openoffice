import React, { useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { DRIVE_ATTACH_STRINGS } from './strings-drive-attach'

/** The Drive calls an editor's preload exposes as window.aiOfficeDriveAi */
interface DriveAttachBridge {
  driveConnected(): Promise<boolean>
  onDriveConnectedChanged(listener: (connected: boolean) => void): () => void
  drivePickAttachments(): Promise<unknown>
}

function bridge(): DriveAttachBridge | null {
  const b = (globalThis as { aiOfficeDriveAi?: Partial<DriveAttachBridge> }).aiOfficeDriveAi
  return typeof b?.driveConnected === 'function' &&
    typeof b.onDriveConnectedChanged === 'function' &&
    typeof b.drivePickAttachments === 'function'
    ? (b as DriveAttachBridge)
    : null
}

/** Paths the person picked, and lines to show beside the attachments */
export interface DriveAttachPicked {
  paths: string[]
  notes: string[]
}

/** Read the shell's answer: downloaded paths, or why there are none */
export function drivePickedOf(raw: unknown, lang: Lang): DriveAttachPicked {
  const s = DRIVE_ATTACH_STRINGS[lang] ?? DRIVE_ATTACH_STRINGS.en
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.ok !== true) {
    if (r.reason === 'not-connected') return { paths: [], notes: [s.disconnected] }
    if (r.reason === 'busy') return { paths: [], notes: [s.busy] }
    if (r.reason === 'training') return { paths: [], notes: [s.training] }
    if (r.reason === 'free-ai') return { paths: [], notes: [s.freeAi] }
    if (r.reason === 'failed') return { paths: [], notes: [s.pickFailed] }
    return { paths: [], notes: [] }
  }
  const paths = Array.isArray(r.paths)
    ? r.paths.filter((p): p is string => typeof p === 'string')
    : []
  const count = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.floor(v) : 0)
  const notes: string[] = []
  if (count(r.skipped)) notes.push(s.skipped.replace('{n}', String(count(r.skipped))))
  if (count(r.failed)) notes.push(s.failed.replace('{n}', String(count(r.failed))))
  return { paths, notes }
}

/**
 * "Attach from Google Drive" beside an AI panel's attach button (decisions
 * 0033, 0085). Shown only while Drive is connected; the shell opens Google's
 * picker in the browser, downloads what the person chooses, and the editor
 * attaches the paths as it does files from this PC.
 */
export function DriveAttachButton({
  lang,
  onPicked,
  className = 'ai-attach-btn',
}: {
  lang: Lang
  onPicked: (picked: DriveAttachPicked) => void | Promise<void>
  className?: string
}) {
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const b = bridge()
    if (!b) return
    let live = true
    void b.driveConnected().then((v) => live && setConnected(v === true))
    const off = b.onDriveConnectedChanged((v) => setConnected(v))
    return () => {
      live = false
      off()
    }
  }, [])
  if (!connected) return null
  const label = (DRIVE_ATTACH_STRINGS[lang] ?? DRIVE_ATTACH_STRINGS.en).label
  const pick = async () => {
    const b = bridge()
    if (!b || busy) return
    setBusy(true)
    try {
      const picked = drivePickedOf(await b.drivePickAttachments(), lang)
      if (picked.paths.length > 0 || picked.notes.length > 0) await onPicked(picked)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className={`${className} ai-drive-attach-btn`}
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
        <path d="M5.6 2h4.8l3.9 6.7-2.4 4.3H4.1L1.7 8.7z M5.6 2l3.9 6.7h4.8 M10.4 2 4.1 13" />
      </svg>
    </button>
  )
}
