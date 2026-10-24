/**
 * What the visible sign-in window says besides what the CLI prints (decision
 * 0059): its title, the numbered steps above the CLI's English, and the line
 * shown when the sign-in did not finish. The main process builds these when it
 * opens the window, so this file imports no React and no renderer code.
 */
import type { AiSubscriptionProviderId } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import { aiSubscriptionProviderName, aiSubscriptionVendorName } from './ai-subscription'
import { aiSubscriptionText, type AiSubscriptionStringKey } from './strings-ai-subscription'

export interface AiSubscriptionLoginWindowText {
  title: string
  guide: string
  closing: string
}

/**
 * A Windows console draws these scripts unjoined or left to right, so their
 * window shows the English guide; the card in the app stays in the language.
 */
const CONSOLE_UNREADABLE_LANGS: ReadonlySet<Lang> = new Set<Lang>(['ar', 'he', 'hi', 'th'])

/**
 * Only Claude's sign-in can hand back a code to paste. Codex takes the sign-in
 * back from the browser by itself, so its window needs no code steps.
 */
const STEPS: Record<AiSubscriptionProviderId, readonly AiSubscriptionStringKey[]> = {
  'claude-code': [
    'loginWindowStepBrowser',
    'loginWindowStepAddress',
    'loginWindowStepCode',
    'loginWindowStepInvalid',
  ],
  codex: ['loginWindowStepBrowser', 'loginWindowStepAddress'],
}

/** The visible sign-in window's words for `provider`, in `lang` where a console can show it */
export function aiSubscriptionLoginWindowText(
  lang: Lang,
  provider: AiSubscriptionProviderId,
): AiSubscriptionLoginWindowText {
  const shown: Lang = CONSOLE_UNREADABLE_LANGS.has(lang) ? 'en' : lang
  const params = {
    provider: aiSubscriptionProviderName(provider),
    vendor: aiSubscriptionVendorName(provider),
  }
  const text = (key: AiSubscriptionStringKey): string => aiSubscriptionText(shown, key, params)
  const steps = STEPS[provider].map((key, index) => `${index + 1}. ${text(key)}`)
  return {
    title: text('loginWindowTitle'),
    guide: [text('loginWindowIntro'), '', ...steps].join('\n'),
    closing: text('loginWindowClosing'),
  }
}
