/** Browser-safe settings surface. Keep Node-backed transports out of renderer bundles. */
export type {
  AiCustomEndpoint,
  AiLocalModelProfile,
  AiLocalValueSource,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  CodexModelCatalog,
  AiAnalysisProviderSelection,
  AiImageProviderSelection,
  AiMediaKeyProviderId,
  AiProviderSelection,
  AiReadUrlSettings,
  AiRunErrorKind,
  AiSubscriptionLoginMethod,
  AiSubscriptionSigningIn,
  AiSubscriptionModel,
  AiSubscriptionProviderId,
  AiSubscriptionState,
  AiSubscriptionStatus,
  AiSubscriptionStatuses,
  AiSubscriptionUsage,
  AiUsageWindow,
  AiVideoAnalysisProviderSelection,
} from './types'
export {
  AI_SUBSCRIPTION_PROVIDERS,
  isKeyProviderConfigured,
  isSubscriptionProvider,
  providerSelectionOf,
  selectAiProvider,
  subscriptionConnection,
  subscriptionStateOf,
} from './provider-selection'
export type { AiNotConnectedReason, AiProviderChoice } from './provider-selection'
export {
  DEFAULT_AI_ANALYSIS_PROVIDER,
  DEFAULT_AI_IMAGE_PROVIDER,
  DEFAULT_AI_PROVIDER_SELECTION,
  DEFAULT_AI_SEARCH_PROVIDER,
  DEFAULT_AI_VIDEO_ANALYSIS_PROVIDER,
  normalizeAiSettings,
} from './legacy-settings'
export {
  codexImageGenerationAvailable,
  configuredImageKeyProviders,
  imageProviderSelection,
  resolveImageBackend,
  setCodexImageGenerationAvailable,
} from './image-backend'
export type { AiImageBackend, AiImageBackendContext } from './image-backend'
export { subscriptionConnectHelpUrl } from './connect-help'
export type { SubscriptionConnectHelpPath } from './connect-help'
export {
  SUBSCRIPTION_CHATGPT_USAGE_URL,
  SUBSCRIPTION_INSTALL_COMMANDS,
  SUBSCRIPTION_INSTALL_URLS,
  SUBSCRIPTION_IPC_CHANNELS,
  SUBSCRIPTION_MIN_VERSIONS,
  SUBSCRIPTION_UPDATE_COMMANDS,
  checkingSubscriptionStatus,
  checkingSubscriptionStatuses,
  isSubscriptionProviderId,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionNeedsUpdate,
  subscriptionStatusErrorKind,
  subscriptionStatusMapOf,
} from './subscription/contract'
export type {
  SubscriptionIpcChannel,
  SubscriptionIpcContract,
  SubscriptionLaunchFailure,
  SubscriptionLaunchResult,
  SubscriptionLoginMode,
  SubscriptionLoginRequest,
  SubscriptionMeteredRequest,
  SubscriptionMeteredResult,
  SubscriptionProviderRequest,
  SubscriptionRecheckRequest,
  SubscriptionStatusErrorKind,
  SubscriptionStatusMap,
} from './subscription/contract'
export {
  AI_PROVIDERS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  AI_SUBSCRIPTION_NOTICE_VERSION,
  HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
  LEGACY_NOTICE_VERSION_FOR_MIGRATION,
  MAX_MAX_OUTPUT_TOKENS,
  MIN_MAX_OUTPUT_TOKENS,
  clampMaxOutputTokens,
  headlessSubscriptionOn,
  withMigratedSubscriptionNoticeVersion,
} from './providers'
export {
  activeCustomEndpoint,
  customEndpointLabel,
  newCustomEndpointId,
  removeCustomEndpoint,
  resolveCustomEndpoints,
  selectCustomEndpoint,
  upsertCustomEndpoint,
} from './custom-endpoints'
export type { RemoveCustomEndpointOptions } from './custom-endpoints'
export {
  DEFAULT_LOCAL_CONTEXT_TOKENS,
  DEFAULT_LOCAL_TIMEOUT_MS,
  MAX_LOCAL_CONTEXT_TOKENS,
  MAX_LOCAL_MODEL_ID_LENGTH,
  MAX_LOCAL_MODEL_PROFILES,
  MAX_LOCAL_NOTES_LENGTH,
  MAX_LOCAL_TIMEOUT_MS,
  MIN_LOCAL_TIMEOUT_MS,
  localContextLimit,
  localContextTokensOf,
  localEndpointFieldsOf,
  localEndpointTimeoutMs,
  localModelCapabilities,
  localModelProfileOf,
  localModelProfilesOf,
  localTimeoutMsOf,
  localValueSourceOf,
  mergeLocalModelProfile,
} from './local-profile'
export type {
  AiLocalContextLimit,
  AiLocalEndpointFields,
  AiLocalModelCapabilities,
} from './local-profile'
export type {
  AiLocalDiscoveryErrorCode,
  AiLocalDiscoveryRequest,
  AiLocalDiscoveryResult,
  AiLocalInspection,
  AiLocalInspectionRequest,
  AiLocalInspectionResult,
  AiLocalModelSummary,
  AiLocalServerKind,
} from './local-models'
export type {
  AiLocalCheck,
  AiLocalCheckCode,
  AiLocalCheckStatus,
  AiLocalTestInput,
  AiLocalTestResult,
} from './local-test'
export { getProviderAdapter, modelLacksVision } from './registry'
export {
  FREE_AI_IPC_CHANNELS,
  FREE_AI_KEY_PAGES,
  FREE_AI_PROVIDERS,
  GEMINI_FREE_MODEL,
  OPENROUTER_FREE_MODELS,
  freeAiConnectResultOf,
  freeAiConnected,
  freeAiQuotaOf,
  isFreeAiProvider,
  isOpenRouterFreeModel,
  keyProviderModels,
  withFreeAiConnection,
  withoutFreeAiConnection,
} from './free-ai'
export type {
  FreeAiConnectFailure,
  FreeAiConnectResult,
  FreeAiProviderId,
  FreeAiQuota,
} from './free-ai'
export { AI_MEDIA_PROVIDERS } from './media'
export { AI_SEARCH_PROVIDERS } from './search-settings'
