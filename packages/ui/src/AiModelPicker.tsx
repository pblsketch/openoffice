import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { AiSettings, AiSubscriptionStatuses } from '@genoffice/ai-provider/browser'
import {
  aiProviderPickerGroups,
  aiProviderPickerSelection,
  aiSubscriptionModelName,
  withAiProviderSelection,
  type AiProviderPickerGroup,
  type AiProviderPickerSelection,
} from './ai-model-picker-options'
import { AiMark } from './AiMark'
import { AiCodexNotice } from './AiSubscriptionNotices'
import { changeStoredAiSettings } from './ai-send-gate'
import { ProviderLogo } from './provider-logos'
import { useDismissablePopover } from './popover-dismiss'
import { AI_MODEL_PICKER_STRINGS } from './strings-ai-model-picker'
import { aiSubscriptionText } from './strings-ai-subscription'

/** Each app's preload exposes these under its own namespace; the panel adapts them. */
export interface AiModelPickerBridge {
  readonly getSettings: () => Promise<AiSettings>
  readonly setSettings: (settings: AiSettings) => Promise<void>
  /** fires after any renderer (this one, another tab, the shell settings page) saved ai-settings.json */
  readonly onSettingsChanged?: ((handler: () => void) => () => void) | undefined
  /** shell: switch to Home and open Settings › AI Model */
  readonly openModelSettings?: (() => Promise<void> | void) | undefined
}

/**
 * How often opening the picker asks the subscription connection to check its
 * CLIs again. A model released while the app stays open should appear without
 * a restart; checking more often than this only starts the CLIs again.
 */
export const AI_MODEL_PICKER_REFRESH_MS = 2 * 60_000

/**
 * Where the model popover goes for a chip at `rect`: above it in the composer
 * (the bottom of the panel), below it in a confirmation dialog near the top.
 * `maxHeight` keeps the list inside the side it opens to.
 */
export function aiModelPopoverStyle(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  width = 260,
  maxHeight = 420,
): React.CSSProperties {
  const left = Math.max(8, Math.min(rect.left, viewport.width - width - 8))
  const below = viewport.height - rect.bottom - 8
  const above = rect.top - 8
  const down = below >= 180 || below >= above
  const space = Math.max(120, down ? below : above)
  const height = Math.min(maxHeight, space)
  return down
    ? { left, top: rect.bottom + 6, maxHeight: height }
    : { left, bottom: viewport.height - rect.top + 6, maxHeight: height }
}

/** Subscription connections are named in text and carry the neutral AI mark, never a vendor logo */
function PickerMark({ group }: { readonly group: Pick<AiProviderPickerGroup, 'kind' | 'id'> }) {
  if (group.kind === 'key') return <ProviderLogo id={group.id} />
  return (
    <span className="gs-provider-logo" aria-hidden="true">
      <AiMark size={14} />
    </span>
  )
}

/**
 * Model chip showing the active provider + model; the popover lists every
 * usable provider's models for a one-click switch (saved globally, the same
 * ai-settings.json the settings page edits) and ends with a row that opens
 * that page for keys and new vendors. Used in the composer footer and, with
 * `showLabel`, in the document-job confirmation dialogs.
 *
 * The list follows the subscription contract: an automatic entry, the
 * connected subscriptions, then the key providers that are filled in. Without
 * `subscriptionStatuses` no subscription counts as connected.
 */
export function AiModelPicker({
  bridge,
  lang,
  subscriptionStatuses,
  showLabel = false,
  onRefreshSubscriptions,
}: {
  readonly bridge: AiModelPickerBridge
  readonly lang: Lang
  /** status of the subscription CLIs */
  readonly subscriptionStatuses?: AiSubscriptionStatuses | undefined
  /** a visible "Model" label before the chip (a confirmation dialog has no composer footer) */
  readonly showLabel?: boolean | undefined
  /**
   * Ask for a fresh subscription check, so a model released while the app has
   * been open appears in the list. Called when the popover opens, at most once
   * per `AI_MODEL_PICKER_REFRESH_MS`.
   */
  readonly onRefreshSubscriptions?: (() => void) | undefined
}): React.JSX.Element | null {
  const strings = AI_MODEL_PICKER_STRINGS[lang] ?? AI_MODEL_PICKER_STRINGS.en
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const refreshedAt = useRef(0)

  // tests render panels without a preload bridge: a throwing getter must not take the panel down
  const refresh = useCallback(() => {
    Promise.resolve()
      .then(() => bridge.getSettings())
      .then(setSettings, () => {})
  }, [bridge])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    let off: (() => void) | undefined
    try {
      off = bridge.onSettingsChanged?.(refresh)
    } catch {
      off = undefined
    }
    return () => {
      window.removeEventListener('focus', refresh)
      off?.()
    }
  }, [bridge, refresh])

  const close = useCallback(() => setOpen(false), [])
  useDismissablePopover(open, close, {
    inside: () => [chipRef.current, popRef.current],
  })

  const groups = useMemo<AiProviderPickerGroup[]>(() => {
    if (!settings) return []
    return aiProviderPickerGroups(settings, subscriptionStatuses ?? {})
  }, [settings, subscriptionStatuses])
  const picked = settings ? aiProviderPickerSelection(settings, subscriptionStatuses ?? {}) : null
  const current: AiProviderPickerSelection | null = picked
  const sameGroup = (g: { id: string; endpoint?: string | undefined }) =>
    g.id === current?.provider && (g.id !== 'custom' || g.endpoint === current?.endpoint)
  const currentUsable = groups.some(sameGroup)

  const toggle = () => {
    if (!open) {
      const rect = chipRef.current?.getBoundingClientRect()
      // the composer sits at the panel bottom, a dialog's chip near its top: fit the side with room
      if (rect)
        setPopStyle(
          aiModelPopoverStyle(rect, { width: window.innerWidth, height: window.innerHeight }),
        )
      // the list may be from an earlier check: a model released since then shows after this one
      if (
        onRefreshSubscriptions &&
        Date.now() - refreshedAt.current >= AI_MODEL_PICKER_REFRESH_MS
      ) {
        refreshedAt.current = Date.now()
        onRefreshSubscriptions()
      }
    }
    setOpen((v) => !v)
  }

  const pick = (sel: AiProviderPickerSelection) => {
    setOpen(false)
    if (!settings) return
    // shown at once on the copy at hand; written onto what is stored now, so a change another
    // window saved since this picker last read the settings is not written back
    setSettings(withAiProviderSelection(settings, sel))
    void changeStoredAiSettings(
      bridge,
      (latest) => withAiProviderSelection(latest, sel),
      settings,
    ).then((written) => {
      if (written) setSettings(written)
    })
  }

  const manage = () => {
    setOpen(false)
    void bridge.openModelSettings?.()
  }

  if (!settings) return null
  const currentGroup = groups.find(sameGroup)
  const paid = aiSubscriptionText(lang, 'pickerPaid')
  const paidTitle = aiSubscriptionText(lang, 'pickerPaidTitle')
  const usable = currentUsable && current
  // the concrete model a subscription runs on, when its CLI listed its models: under
  // "automatic" too, so the chip tells what will answer
  const running = usable ? picked?.resolved : undefined
  const modelName = aiSubscriptionModelName(settings, subscriptionStatuses ?? {}, running)
  const runningGroup = groups.find((g) => g.kind === 'subscription' && g.id === running)
  const modelId = runningGroup?.details?.get(picked?.model ?? '')?.concrete
  const fullText = !usable
    ? subscriptionStatuses
      ? aiSubscriptionText(lang, 'pickerNotConnected')
      : strings.choose
    : currentGroup?.kind === 'auto'
      ? modelName
        ? aiSubscriptionText(lang, 'pickerAutoUsingModel', {
            provider: currentGroup.label,
            model: modelName,
          })
        : aiSubscriptionText(lang, 'pickerAutoUsing', { provider: currentGroup.label })
      : modelName && currentGroup
        ? `${currentGroup.label} · ${modelName}`
        : current.model || (currentGroup?.label ?? '')
  // The composer footer is narrow: under automatic the chip names the model and leaves the
  // provider to the tooltip and the list, so the model is not the part that gets cut off.
  const chipText =
    usable && currentGroup?.kind === 'auto' && modelName
      ? aiSubscriptionText(lang, 'pickerAutoUsing', { provider: modelName })
      : fullText
  const chipTip = modelName
    ? `${strings.title}: ${fullText}${modelId ? ` (${modelId})` : ''}`
    : strings.title

  return (
    <div
      className="ai-model-picker"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
          chipRef.current?.focus()
        }
      }}
    >
      {showLabel && (
        <span className="ai-model-picker-label" aria-hidden="true">
          {strings.title}
        </span>
      )}
      <button
        ref={chipRef}
        type="button"
        className={`ai-model-chip${open ? ' open' : ''}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-tip={chipTip}
        aria-label={`${strings.title}: ${fullText}`}
      >
        {currentUsable && currentGroup && <PickerMark group={currentGroup} />}
        <span className="ai-model-chip-text">{chipText}</span>
        {currentUsable && picked?.metered && (
          <span className="ai-model-cost" title={paidTitle}>
            {paid}
          </span>
        )}
        <svg className="ai-model-chip-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 6.5 5 3.5l3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          className="ai-model-pop"
          role="listbox"
          aria-label={strings.title}
          style={popStyle}
        >
          <div className="ai-model-pop-list">
            {groups.map((g) => (
              <div key={g.endpoint ? `${g.id}:${g.endpoint}` : g.id} className="ai-model-group">
                {g.kind !== 'auto' && (
                  <div className="ai-model-group-head">
                    <PickerMark group={g} />
                    <span>{g.label}</span>
                    {g.metered ? (
                      <span className="ai-model-cost" title={paidTitle}>
                        {paid}
                      </span>
                    ) : (
                      g.kind === 'subscription' && (
                        <span className="ai-model-tag">
                          {aiSubscriptionText(lang, 'pickerSubscription')}
                        </span>
                      )
                    )}
                  </div>
                )}
                {/* said where Codex is chosen; a key provider of the same name is not this connection */}
                {g.kind === 'subscription' && g.id === 'codex' && (
                  <AiCodexNotice lang={lang} compact />
                )}
                {(g.models.length > 0 ? g.models : ['']).map((m) => {
                  const selected = sameGroup(g) && (g.kind === 'auto' || current?.model === m)
                  // what the CLI itself says about this model, when it listed its models
                  const detail = g.details?.get(m)
                  const autoModel =
                    g.kind === 'auto'
                      ? aiSubscriptionModelName(settings, subscriptionStatuses ?? {}, g.resolved)
                      : undefined
                  return (
                    <button
                      key={`${g.id}:${g.endpoint ?? ''}:${m}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`ai-model-item${g.kind === 'auto' ? ' ai-model-auto' : ''}${selected ? ' selected' : ''}`}
                      onClick={() => pick({ provider: g.id, endpoint: g.endpoint, model: m })}
                    >
                      {g.kind === 'auto' && <PickerMark group={g} />}
                      <span className="ai-model-item-text">
                        {g.kind === 'auto'
                          ? autoModel
                            ? aiSubscriptionText(lang, 'pickerAutoUsingModel', {
                                provider: g.label,
                                model: autoModel,
                              })
                            : aiSubscriptionText(lang, 'pickerAutoUsing', { provider: g.label })
                          : g.kind === 'subscription'
                            ? m
                              ? (detail?.name ?? m)
                              : detail
                                ? aiSubscriptionText(lang, 'pickerDefaultModelNamed', {
                                    model: detail.name,
                                  })
                                : aiSubscriptionText(lang, 'pickerDefaultModel')
                            : m || g.label}
                        {detail?.concrete && (
                          <>
                            {' '}
                            <span className="ai-model-item-id">{detail.concrete}</span>
                          </>
                        )}
                      </span>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                          <path
                            d="M2.5 6.5 5 9l4.5-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {bridge.openModelSettings && (
            <button type="button" className="ai-model-item ai-model-manage" onClick={manage}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
              <span className="ai-model-item-text">{strings.manage}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
