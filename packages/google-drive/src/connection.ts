/**
 * One Drive connection per app: the refresh token kept in a vault the caller
 * supplies (the shell encrypts it with the operating system), the access
 * token in memory only, refreshed shortly before it runs out. When Google
 * says the grant is gone, the connection forgets the token and reports
 * itself disconnected.
 */
import {
  refreshGoogleToken,
  revokeGoogleToken,
  signInWithGoogle,
  type FetchLike,
  type GoogleClient,
  type GoogleSignInFailure,
  type GoogleSignInOptions,
  type GoogleTokens,
} from './oauth'
import { DriveApi, type DriveAccount } from './drive-api'

/** Where the refresh token lives between runs. The shell's vault encrypts it. */
export interface TokenVault {
  load(): Promise<string | null>
  /** false when the token could not be kept (no encryption here): the connection lasts this run only */
  save(refreshToken: string): Promise<boolean>
  clear(): Promise<void>
}

/**
 * unavailable: this build has no Google client, so Drive is not offered;
 * disconnected: no connection; connected: a usable connection (the account
 * is filled once Drive has answered); expired: Google ended a connection the
 * app had (shown once, so the user knows why it is gone).
 */
export type DriveConnectionState =
  | { state: 'unavailable' }
  | { state: 'disconnected'; expired?: boolean }
  | { state: 'connected'; account: DriveAccount | null; persisted: boolean }

export interface DriveConnectionOptions {
  client: GoogleClient | null
  vault: TokenVault
  fetch: FetchLike
  now?: () => number
}

export class DriveConnection {
  private refreshToken: string | null = null
  private accessToken: string | null = null
  private expiresAt = 0
  private account: DriveAccount | null = null
  private persisted = false
  private expired = false
  private loaded = false
  private refreshing: Promise<string | null> | null = null
  private signIn: AbortController | null = null
  private readonly listeners = new Set<(state: DriveConnectionState) => void>()
  readonly api: DriveApi

  constructor(private readonly options: DriveConnectionOptions) {
    this.api = new DriveApi({
      token: (signal) => this.accessTokenFor(signal),
      fetch: options.fetch,
    })
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  onChange(listener: (state: DriveConnectionState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const state = this.state()
    for (const listener of this.listeners) listener(state)
  }

  state(): DriveConnectionState {
    if (!this.options.client) return { state: 'unavailable' }
    if (!this.refreshToken) {
      return this.expired ? { state: 'disconnected', expired: true } : { state: 'disconnected' }
    }
    return { state: 'connected', account: this.account, persisted: this.persisted }
  }

  connected(): boolean {
    return Boolean(this.options.client && this.refreshToken)
  }

  /** Read the kept token once; after that the connection lives in memory */
  async load(): Promise<DriveConnectionState> {
    if (this.loaded || !this.options.client) return this.state()
    this.loaded = true
    const token = await this.options.vault.load().catch(() => null)
    if (token && !this.refreshToken) {
      this.refreshToken = token
      this.persisted = true
      this.emit()
      void this.fetchAccount()
    }
    return this.state()
  }

  private async fetchAccount(): Promise<void> {
    const result = await this.api.account()
    if (result.ok && this.refreshToken) {
      this.account = result.account
      this.emit()
    }
  }

  /** The browser sign-in. A second call while one is waiting replaces it. */
  async connect(
    options: Pick<GoogleSignInOptions, 'openBrowser' | 'pages'>,
  ): Promise<{ ok: true } | { ok: false; reason: GoogleSignInFailure | 'unavailable' }> {
    const result = await this.signInOnce(options)
    return result.ok ? { ok: true } : result
  }

  /**
   * Google's file picker, through the same browser round trip as signing in
   * (decision 0085). It connects when there is no connection yet, and gives the
   * ids of the files the person chose, which the app may open from then on.
   */
  async pick(
    options: Pick<GoogleSignInOptions, 'openBrowser' | 'pages'>,
    multiple: boolean,
  ): Promise<
    { ok: true; picked: string[] } | { ok: false; reason: GoogleSignInFailure | 'unavailable' }
  > {
    return this.signInOnce({ ...options, pick: { multiple } })
  }

  private async signInOnce(
    options: Pick<GoogleSignInOptions, 'openBrowser' | 'pages' | 'pick'>,
  ): Promise<
    { ok: true; picked: string[] } | { ok: false; reason: GoogleSignInFailure | 'unavailable' }
  > {
    const client = this.options.client
    if (!client) return { ok: false, reason: 'unavailable' }
    this.signIn?.abort()
    const controller = new AbortController()
    this.signIn = controller
    const result = await signInWithGoogle({
      ...options,
      client,
      fetch: this.options.fetch,
      signal: controller.signal,
      now: this.options.now,
    })
    if (this.signIn === controller) this.signIn = null
    if (!result.ok) return result
    const account = this.refreshToken ? this.account : null
    await this.adopt(result.tokens)
    // the same account picking again keeps its name on screen; a new sign-in reads it afresh
    if (account) this.account = account
    this.emit()
    if (!account) await this.fetchAccount()
    return { ok: true, picked: result.picked }
  }

  /**
   * Keep the newest tokens. The previous refresh token is let go, not revoked:
   * revoking can end the app's whole grant for the account, and with it the
   * access to files picked before (decision 0085).
   */
  private async adopt(tokens: GoogleTokens): Promise<void> {
    this.refreshToken = tokens.refreshToken
    this.accessToken = tokens.accessToken
    this.expiresAt = tokens.expiresAt
    this.account = null
    this.expired = false
    this.persisted = await this.options.vault.save(tokens.refreshToken).catch(() => false)
    if (!this.persisted) await this.options.vault.clear().catch(() => {})
  }

  cancelConnect(): void {
    this.signIn?.abort()
    this.signIn = null
  }

  /** Forget the connection here and ask Google to drop the grant */
  async disconnect(): Promise<void> {
    const token = this.refreshToken
    this.forget(false)
    await this.options.vault.clear().catch(() => {})
    if (token) await revokeGoogleToken(token, this.options.fetch)
  }

  private forget(expired: boolean): void {
    this.refreshToken = null
    this.accessToken = null
    this.expiresAt = 0
    this.account = null
    this.persisted = false
    this.expired = expired
    this.emit()
  }

  private async accessTokenFor(signal?: AbortSignal): Promise<string | null> {
    const client = this.options.client
    if (!client || !this.refreshToken) return null
    if (this.accessToken && this.now() < this.expiresAt) return this.accessToken
    // concurrent callers share one refresh
    this.refreshing ??= (async () => {
      const refreshToken = this.refreshToken
      if (!refreshToken) return null
      const result = await refreshGoogleToken(
        client,
        refreshToken,
        this.options.fetch,
        signal,
        this.options.now,
      )
      // a disconnect or a new sign-in while this ran wins
      if (this.refreshToken !== refreshToken) return this.accessToken
      if (result.ok) {
        this.accessToken = result.accessToken
        this.expiresAt = result.expiresAt
        return result.accessToken
      }
      if (result.reason === 'revoked') {
        this.forget(true)
        await this.options.vault.clear().catch(() => {})
      }
      return null
    })().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }
}
