/**
 * The product website's connect help: every click of connecting an AI, shown
 * on a redrawn window. The connect guide links to it; the address is fixed
 * here and a renderer names only the path the user is on. Browser-safe.
 */
import { PRODUCT_WEBSITE } from '@genoffice/i18n'
import type { AiSubscriptionProviderId } from './types'

/** A way to connect the guide offers: one of the two subscriptions, or the free connections */
export type SubscriptionConnectHelpPath = AiSubscriptionProviderId | 'free'

/** The page's section for each path; the site keeps these anchors */
const CONNECT_HELP_SECTIONS: Record<SubscriptionConnectHelpPath, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  free: 'free',
}

/** The connect help page, at the section of `path` when it names a known path */
export function subscriptionConnectHelpUrl(path?: unknown): string {
  const base = `${PRODUCT_WEBSITE}/connect`
  return typeof path === 'string' && Object.hasOwn(CONNECT_HELP_SECTIONS, path)
    ? `${base}#${CONNECT_HELP_SECTIONS[path as SubscriptionConnectHelpPath]}`
    : base
}
