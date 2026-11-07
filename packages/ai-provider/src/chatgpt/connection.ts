/**
 * The ChatGPT connection of this process (decision 0081): the sign-in, the
 * tokens it gave, keeping them fresh, and the sign-out. One instance lives in
 * the main process; the subscription IPC creates it over the app's data folder
 * and registers it, and the bridge and the status check read it from here.
 *
 * Refreshes are serialized: two runs that find the access token old share one
 * refresh, so a rotated refresh token is never sent twice.
 */
import { AiRunError } from '../run-error'
import type { FreeConnectPage } from '../free-connect'
import type { ChatGptConnectionRecord, ChatGptConnectionStore, ChatGptSession } from './credentials'
import {
  CHATGPT_PLAN_SCOPE,
  chatGptAttemptValues,
  chatGptAuthorizeUrl,
  chatGptPkcePair,
  exchangeChatGptCode,
  fetchChatGptSigningKeys,
  refreshChatGptTokens,
  revokeChatGptSession,
  verifyChatGptIdToken,
  waitForChatGptCallback,
  type ChatGptSignInFailed,
  type ChatGptTokenSet,
  type FetchLike,
} from './oauth'

/** an access token this close to its expiry is refreshed before it is used */
export const CHATGPT_REFRESH_MARGIN_MS = 60_000

export interface ChatGptConnectionDeps {
  store: ChatGptConnectionStore
  /** the name OpenAI shows for this app on a first registration */
  agentName: string
  fetch?: FetchLike | undefined
  now?: (() => number) | undefined
}

export interface ChatGptSignInOptions {
  openBrowser: (url: string) => Promise<boolean>
  pages: { done: FreeConnectPage; failed: FreeConnectPage }
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}

export type ChatGptSignInResult = { ok: true } | ChatGptSignInFailed

export interface ChatGptConnectionState {
  signedIn: boolean
  /** the signed-in account's e-mail, for display; known after a sign-in or a refresh this run */
  account?: string | undefined
}

export interface ChatGptConnection {
  /** whether a session is stored; reads nothing off the network */
  state(): Promise<ChatGptConnectionState>
  signIn(options: ChatGptSignInOptions): Promise<ChatGptSignInResult>
  /** revoke the session at OpenAI (as far as it can be reached) and forget it here */
  signOut(): Promise<void>
  /**
   * An access token fit for a request, refreshed first when it is old. Throws
   * `signed-out` when there is no session or it has ended.
   */
  accessToken(signal?: AbortSignal): Promise<string>
  /**
   * OpenAI refused the token (the user disconnected the app in ChatGPT's
   * settings): the session is dropped and listeners are told.
   */
  dropSession(): Promise<void>
  /** called whenever the session comes or goes */
  onChange(listener: () => void): () => void
}

function signedOutError(): AiRunError {
  return new AiRunError(
    'signed-out',
    'ChatGPT is not connected. Sign in again in the AI settings.',
    { provider: 'chatgpt' },
  )
}

function sessionOf(tokens: ChatGptTokenSet): ChatGptSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    ...(tokens.idToken ? { idToken: tokens.idToken } : {}),
  }
}

export function createChatGptConnection(deps: ChatGptConnectionDeps): ChatGptConnection {
  const now = deps.now ?? Date.now
  const listeners = new Set<() => void>()
  let account: string | undefined
  let refreshing: Promise<string> | null = null
  // writes of the record, one at a time
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }
  const announce = (): void => {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        /* one listener must not stop the others */
      }
    }
  }
  const forgetSession = (record: ChatGptConnectionRecord): ChatGptConnectionRecord => {
    const next = { ...record }
    delete next.session
    return next
  }

  /** read the e-mail off a new ID token, when it checks out; never stored */
  const learnAccount = async (idToken: string | undefined, clientId: string): Promise<void> => {
    if (!idToken) return
    try {
      const keys = await fetchChatGptSigningKeys(deps.fetch)
      const identity = verifyChatGptIdToken(idToken, { clientId }, keys, Math.floor(now() / 1000))
      if (identity?.email) account = identity.email
    } catch {
      /* the account stays as it was: it is for display only */
    }
  }

  const refresh = (): Promise<string> => {
    refreshing ??= serial(async () => {
      const record = await deps.store.read()
      const session = record.session
      if (!session || !record.clientId) throw signedOutError()
      // another run refreshed while this one waited its turn
      if (session.expiresAt - now() > CHATGPT_REFRESH_MARGIN_MS) return session.accessToken
      const result = await refreshChatGptTokens(
        { clientId: record.clientId, refreshToken: session.refreshToken },
        deps.fetch,
        undefined,
        now,
      )
      if (!result.ok) {
        if (result.reason === 'signed-out') {
          await deps.store.write(forgetSession(record))
          account = undefined
          announce()
          throw signedOutError()
        }
        // a passing failure: a token that has not run out yet still serves
        if (session.expiresAt > now()) return session.accessToken
        throw new Error('ChatGPT could not be reached to renew the sign-in (network)')
      }
      const kept = session.idToken
      const next: ChatGptSession = { ...sessionOf(result.tokens) }
      if (!next.idToken && kept) next.idToken = kept
      await deps.store.write({ ...record, session: next })
      void learnAccount(result.tokens.idToken, record.clientId)
      return next.accessToken
    }).finally(() => {
      refreshing = null
    })
    return refreshing
  }

  return {
    async state() {
      const record = await deps.store.read()
      return record.session
        ? { signedIn: true, ...(account ? { account } : {}) }
        : { signedIn: false }
    },

    async signIn(options) {
      const record = await deps.store.read()
      const { verifier, challenge } = chatGptPkcePair()
      const { state, nonce } = chatGptAttemptValues()
      const callback = await waitForChatGptCallback({
        authorizeUrl: (port) =>
          chatGptAuthorizeUrl({
            port,
            challenge,
            state,
            nonce,
            hostId: record.hostId,
            clientId: record.clientId,
            agentName: deps.agentName,
          }),
        state,
        openBrowser: options.openBrowser,
        pages: options.pages,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      })
      if (!callback.ok) return callback
      const exchanged = await exchangeChatGptCode(
        { code: callback.code, clientId: callback.clientId, verifier, port: callback.port },
        deps.fetch,
        options.signal,
        now,
      )
      if (!exchanged.ok) return exchanged
      const tokens = exchanged.tokens
      if (!tokens.idToken) return { ok: false, reason: 'denied', step: 'id-token-missing' }
      let identity
      try {
        const keys = await fetchChatGptSigningKeys(deps.fetch, options.signal)
        identity = verifyChatGptIdToken(
          tokens.idToken,
          { clientId: callback.clientId, nonce },
          keys,
          Math.floor(now() / 1000),
        )
      } catch {
        if (options.signal?.aborted) return { ok: false, reason: 'cancelled' }
        return { ok: false, reason: 'network', step: 'signing-keys' }
      }
      if (!identity) return { ok: false, reason: 'denied', step: 'id-token-invalid' }
      // signed in, but the use of the ChatGPT plan was not allowed: nothing to run on.
      // OpenAI documents `scope` as always in the answer and asks for the plan scope
      // in it; a valid ID token alone does not allow plan use, so a missing field is
      // no grant either. The step tells the two apart for whoever helps the user.
      if (!tokens.scopes.includes(CHATGPT_PLAN_SCOPE)) {
        return {
          ok: false,
          reason: 'no-plan',
          step: tokens.scopeMissing ? 'scope-missing' : 'plan-scope-missing',
        }
      }
      await serial(async () => {
        const current = await deps.store.read()
        await deps.store.write({
          hostId: current.hostId,
          clientId: callback.clientId,
          subject: identity.subject,
          session: sessionOf(tokens),
        })
      })
      account = identity.email
      announce()
      return { ok: true }
    },

    async signOut() {
      await serial(async () => {
        const record = await deps.store.read()
        if (record.session && record.clientId) {
          // the tokens here are forgotten whether or not OpenAI could be told
          await revokeChatGptSession(
            { clientId: record.clientId, refreshToken: record.session.refreshToken },
            deps.fetch,
          )
        }
        // a sign-out ends this account's registration here; the host stays the same
        await deps.store.write({ hostId: record.hostId })
      })
      account = undefined
      announce()
    },

    async accessToken(signal) {
      if (signal?.aborted) throw new Error('cancelled')
      const record = await deps.store.read()
      const session = record.session
      if (!session || !record.clientId) throw signedOutError()
      if (session.expiresAt - now() > CHATGPT_REFRESH_MARGIN_MS) return session.accessToken
      return refresh()
    },

    async dropSession() {
      const had = await serial(async () => {
        const record = await deps.store.read()
        if (!record.session) return false
        await deps.store.write(forgetSession(record))
        return true
      })
      if (!had) return
      account = undefined
      announce()
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

let current: ChatGptConnection | null = null

/** Register the process's connection (the main process does, once it knows its data folder) */
export function setChatGptConnection(connection: ChatGptConnection | null): void {
  current = connection
}

/** The process's connection; null where none was registered (the terminal command, tests) */
export function chatGptConnection(): ChatGptConnection | null {
  return current
}
