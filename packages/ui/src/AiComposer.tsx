import React, { useEffect, useRef } from 'react'
import { IconEnter, IconSend, IconStop } from './icons'
import { useAiPanelPrefs } from './ai-panel-prefs-store'
import type { AiComposerSkills } from './use-composer-skills'
import { useComposerPickers, type AiComposerDocs } from './use-doc-mention'

// Keep in sync with the CSS `max-height` on `.ai-input-box textarea` (7 lines à 24px)
const MAX_TEXTAREA_HEIGHT = 168

/**
 * The AI panel input box shared by docs and sheets: auto-growing textarea
 * (Enter sends, Shift+Enter newline, Esc stops) plus a footer with optional
 * app-specific controls, a shortcut hint, and the send/stop button.
 * Renders the `.ai-input-box` class family; each app themes it in its own CSS.
 * While busy, Enter queues the draft instead (see useChatRunQueue).
 * With `skills`, a `/` or `$` opens the skill list; while it is open it takes
 * ↑/↓/Enter/Tab/Esc first (that Esc never stops a run) and picks become chips.
 * With `docs`, an `@` opens the document list the same way; a pick attaches
 * the document and puts `@<name>` in the text. Only one of the two lists opens.
 */
export function AiComposer({
  value,
  busy,
  placeholder,
  hintIdle,
  hintBusy,
  hintIdleTitle,
  sendLabel,
  stopLabel,
  ariaLabel,
  header,
  queueStrip,
  footerStart,
  footerBelow,
  iconOnly = false,
  sendIconEnabled,
  sendIconDisabled,
  stopIcon,
  textareaRef,
  onChange,
  onSend,
  onQueue,
  queuePlaceholder,
  onStop,
  onPasteFiles,
  onPasteText,
  skills,
  docs,
}: {
  readonly value: string
  readonly busy: boolean
  readonly placeholder: string
  readonly hintIdle: string
  readonly hintBusy: string
  readonly hintIdleTitle?: string | undefined
  readonly sendLabel: string
  readonly stopLabel: string
  readonly ariaLabel?: string | undefined
  /** content inside the box above the textarea (attachment chips, …) */
  readonly header?: React.ReactNode
  /** queued-messages strip, rendered above the header while replies run */
  readonly queueStrip?: React.ReactNode
  /** extra controls at the left of the footer (attach button, toggles, …) */
  readonly footerStart?: React.ReactNode
  /**
   * a row outside and below the input box (the project chip); rendered as
   * `.ai-input-below` after `.ai-input-box`, nothing at all when absent
   */
  readonly footerBelow?: React.ReactNode
  /** compact variant: no hint text, icon-only enter/stop button */
  readonly iconOnly?: boolean | undefined
  /** custom art for the icon-only send button (e.g. brand-supplied PNGs); falls back to IconEnter */
  readonly sendIconEnabled?: React.ReactNode
  readonly sendIconDisabled?: React.ReactNode
  /** custom art for the icon-only stop button while busy; falls back to IconStop */
  readonly stopIcon?: React.ReactNode
  /** pass a ref to focus the textarea from outside */
  readonly textareaRef?: React.RefObject<HTMLTextAreaElement | null> | undefined
  readonly onChange: (next: string) => void
  readonly onSend: () => void
  /** while busy, Enter queues the draft instead of sending (MiniMax-style queue) */
  readonly onQueue?: (() => void) | undefined
  /** placeholder shown while busy and queueing is available, naming the Enter/Esc swap */
  readonly queuePlaceholder?: string | undefined
  readonly onStop: () => void
  /** clipboard files pasted into the textarea (screenshots, copied files); text paste stays native */
  readonly onPasteFiles?: ((files: File[]) => void) | undefined
  /** first look at pasted text; return true to consume it (e.g. a base64 image turned into an attachment) */
  readonly onPasteText?: ((text: string) => boolean) | undefined
  /** the skill list on `/`·`$` and the skill chips (useComposerSkills().composer) */
  readonly skills?: AiComposerSkills | undefined
  /** the `@` document list: how this editor attaches, and its current attachments */
  readonly docs?: AiComposerDocs | undefined
}): React.JSX.Element {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const ref = textareaRef ?? innerRef
  const canSend = value.trim().length > 0 && !busy
  const { spellcheck } = useAiPanelPrefs()
  const picker = useComposerPickers({ skills, docs, value, onChange, textareaRef: ref })

  // auto-grow up to ~6 lines; empty clears the inline height outright so the
  // CSS min-height governs (a hidden-at-measure pass can leave a stale value).
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    if (value === '') {
      ta.style.height = ''
      return
    }
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value, ref])

  const box = (
    <div className="ai-input-box">
      {queueStrip}
      {header}
      {picker.chipRow}
      {picker.popup}
      <textarea
        ref={ref}
        value={value}
        placeholder={busy && onQueue && queuePlaceholder ? queuePlaceholder : placeholder}
        aria-label={ariaLabel}
        rows={1}
        dir="auto"
        spellCheck={spellcheck}
        {...picker.inputProps}
        onChange={(e) => {
          onChange(e.target.value)
          picker.track(e.target)
        }}
        onSelect={(e) => picker.track(e.currentTarget)}
        onCompositionStart={picker.onCompositionStart}
        onCompositionEnd={picker.onCompositionEnd}
        onBlur={picker.onBlur}
        onKeyDown={(e) => {
          // an open skill or document list takes ↑/↓/Enter/Tab/Esc first; its Esc never stops a run
          if (picker.onKeyDown(e)) return
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (canSend) onSend()
            else if (busy && onQueue) onQueue()
          } else if (e.key === 'Escape' && busy) {
            e.preventDefault()
            onStop()
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.length > 0) {
            if (!onPasteFiles) return
            e.preventDefault()
            onPasteFiles(files)
            return
          }
          const text = e.clipboardData.getData('text/plain')
          if (text && onPasteText?.(text)) e.preventDefault()
        }}
      />
      <div className="ai-input-footer">
        {footerStart}
        {!iconOnly && (
          <span className="ai-input-hint" title={busy ? undefined : hintIdleTitle}>
            {busy ? hintBusy : hintIdle}
          </span>
        )}
        {busy ? (
          <button
            className="ai-send-btn ai-stop-btn"
            onClick={onStop}
            title={stopLabel}
            aria-label={stopLabel}
          >
            {iconOnly ? (stopIcon ?? <IconStop size={16} />) : <IconStop size={16} />}
            {!iconOnly && stopLabel}
          </button>
        ) : (
          <button
            className="ai-send-btn"
            onClick={onSend}
            disabled={!canSend}
            title={sendLabel}
            aria-label={sendLabel}
          >
            {iconOnly ? (
              ((canSend ? sendIconEnabled : (sendIconDisabled ?? sendIconEnabled)) ?? (
                <IconEnter size={16} />
              ))
            ) : (
              <IconSend size={16} />
            )}
            {!iconOnly && sendLabel}
          </button>
        )}
      </div>
    </div>
  )
  // without a row below, the composer renders exactly the box, as before
  if (footerBelow == null || footerBelow === false) return box
  return (
    <>
      {box}
      <div className="ai-input-below">{footerBelow}</div>
    </>
  )
}
