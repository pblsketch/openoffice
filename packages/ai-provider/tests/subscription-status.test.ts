/**
 * Connection status of the two subscription CLIs, judged from fake program
 * output. No test here starts a real CLI.
 */
import { describe, expect, it } from 'vitest'
import {
  SUBSCRIPTION_MIN_VERSIONS,
  SUBSCRIPTION_STATUS_TIMEOUT_MS,
  codexAccountInfo,
  detectSubscriptionLogin,
  detectSubscriptionLogins,
  parseClaudeAuthStatus,
  parseCodexLoginStatus,
  setCodexAccountSource,
  subscriptionStatusErrorKind,
  type SubscriptionCommandResult,
  type SubscriptionDetection,
  type SubscriptionProgram,
  type SubscriptionRunner,
} from '../src/subscription'
import type { AiSubscriptionProviderId } from '../src/types'

const EMAIL = 'someone@example.com'
const ORG_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const ORG_NAME = 'Example Research Org'

function program(provider: AiSubscriptionProviderId): SubscriptionProgram {
  return {
    provider,
    command: provider === 'codex' ? '/fake/codex' : '/fake/claude',
    prefixArgs: [],
    env: {},
    entry: provider === 'codex' ? '/fake/codex' : '/fake/claude',
    source: 'path',
  }
}

const found = async (provider: AiSubscriptionProviderId) => program(provider)
const missing = async () => null

function ok(stdout: string, stderr = ''): SubscriptionCommandResult {
  return { code: 0, stdout, stderr }
}

function claudeStatus(fields: Record<string, unknown>): string {
  return JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: 'C:\\Users\\someone\\.claude\\projects',
    configDirectory: 'C:\\Users\\someone\\.claude',
    email: EMAIL,
    orgId: ORG_ID,
    orgName: ORG_NAME,
    subscriptionType: 'max',
    ...fields,
  })
}

/** A fake CLI: answers `--version` and the status command, records what was asked */
function fakeCli(answers: {
  version?: SubscriptionCommandResult | Error
  status?: SubscriptionCommandResult | Error
}): { run: SubscriptionRunner; calls: string[][] } {
  const calls: string[][] = []
  const run: SubscriptionRunner = async (_program, args) => {
    calls.push(args)
    const answer = args[0] === '--version' ? answers.version : answers.status
    if (!answer) throw new Error(`unexpected command: ${args.join(' ')}`)
    if (answer instanceof Error) throw answer
    return answer
  }
  return { run, calls }
}

const CLAUDE_VERSION = ok('2.1.287 (Claude Code)\n')
const CODEX_VERSION = ok('codex-cli 0.159.2\n')

async function claude(
  status: SubscriptionCommandResult | Error,
  version: SubscriptionCommandResult | Error = CLAUDE_VERSION,
): Promise<SubscriptionDetection> {
  return detectSubscriptionLogin('claude-code', {
    locate: found,
    run: fakeCli({ version, status }).run,
  })
}

async function codex(
  status: SubscriptionCommandResult | Error,
  version: SubscriptionCommandResult | Error = CODEX_VERSION,
): Promise<SubscriptionDetection> {
  return detectSubscriptionLogin('codex', { locate: found, run: fakeCli({ version, status }).run })
}

describe('the six states (spec 4.1)', () => {
  it('not-installed: the program was not found', async () => {
    const detection = await detectSubscriptionLogin('claude-code', {
      locate: missing,
      run: fakeCli({}).run,
    })
    expect(detection).toEqual({ provider: 'claude-code', state: 'not-installed' })
  })

  it('signed-out: installed, no login', async () => {
    expect(
      await claude({
        code: 1,
        stdout: JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }),
        stderr: '',
      }),
    ).toEqual({ provider: 'claude-code', state: 'signed-out', version: '2.1.287' })
    expect(await codex({ code: 1, stdout: '', stderr: 'Not logged in\n' })).toEqual({
      provider: 'codex',
      state: 'signed-out',
      version: '0.159.2',
    })
  })

  it('ready: a subscription login, with the plan name when the CLI gives one', async () => {
    expect(await claude(ok(claudeStatus({})))).toEqual({
      provider: 'claude-code',
      state: 'ready',
      version: '2.1.287',
      loginMethod: 'subscription',
      planName: 'max',
      loginKind: 'claude.ai/firstParty',
      account: EMAIL,
    })
    expect(await codex(ok('', 'Logged in using ChatGPT\n'))).toEqual({
      provider: 'codex',
      state: 'ready',
      version: '0.159.2',
      loginMethod: 'subscription',
      loginKind: 'chatgpt',
    })
  })

  it('metered: an API key or another pay-as-you-go route', async () => {
    for (const fields of [
      { authMethod: 'api_key', subscriptionType: undefined },
      { authMethod: 'api_key_helper', subscriptionType: undefined },
      { authMethod: 'third_party', apiProvider: 'bedrock', subscriptionType: undefined },
      { authMethod: 'claude.ai', apiProvider: 'vertex' },
    ]) {
      const detection = await claude(ok(claudeStatus(fields)))
      expect(detection).toMatchObject({ state: 'metered', loginMethod: 'metered' })
      expect(detection.planName).toBeUndefined()
    }
    for (const line of [
      'Logged in using an API key - sk-proj-***ABCD',
      'Logged in using Amazon Bedrock API key',
      'Logged in using Amazon Bedrock AWS access keys',
      'Logged in using workload identity',
    ]) {
      expect(await codex(ok('', `${line}\n`))).toMatchObject({
        state: 'metered',
        loginMethod: 'metered',
      })
    }
  })

  it('error: the check itself failed', async () => {
    const spawnFailure = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })
    const broken = await claude(ok('{}'), spawnFailure)
    expect(broken.state).toBe('error')
    expect(broken.error).toContain('EACCES')
    expect(subscriptionStatusErrorKind(broken)).toBe('failed')

    const garbage = await codex(ok('', 'thread main panicked\n'))
    expect(garbage).toMatchObject({ provider: 'codex', state: 'error', version: '0.159.2' })
    expect(subscriptionStatusErrorKind(garbage)).toBe('failed')
  })

  it('checking is not a detection result: it is what the service reports before one exists', async () => {
    const detection = await claude(ok(claudeStatus({})))
    expect(detection.state).not.toBe('checking')
  })
})

describe('the two invariants (spec 5.2)', () => {
  it('a login method the CLI does not name as a subscription is never ready', async () => {
    const unknowns = [
      claudeStatus({ authMethod: 'oauth_token', subscriptionType: undefined }),
      claudeStatus({ authMethod: 'something-new' }),
      // a Console sign-in that older CLIs reported as claude.ai carries no plan
      claudeStatus({ subscriptionType: null }),
      claudeStatus({ subscriptionType: '' }),
      claudeStatus({ apiProvider: undefined }),
    ]
    for (const stdout of unknowns) {
      expect(await claude(ok(stdout))).toMatchObject({ state: 'metered', loginMethod: 'unknown' })
    }
    for (const line of ['Logged in using access token', 'Logged in using personal access token']) {
      expect(await codex(ok('', line))).toMatchObject({ state: 'metered', loginMethod: 'unknown' })
    }
  })

  it('ready appears only together with the subscription login method', async () => {
    const outputs = [
      claudeStatus({}),
      claudeStatus({ authMethod: 'api_key' }),
      claudeStatus({ authMethod: 'oauth_token' }),
      claudeStatus({ apiProvider: 'foundry' }),
      claudeStatus({ loggedIn: false }),
      claudeStatus({ subscriptionType: 42 }),
      '{"loggedIn":"yes"}',
      'not json',
    ]
    for (const stdout of outputs) {
      const detection = await claude(ok(stdout))
      expect(detection.state === 'ready').toBe(detection.loginMethod === 'subscription')
      if (detection.loginMethod === 'unknown') expect(detection.state).toBe('metered')
    }
  })
})

describe('account identity is read and dropped, but for the e-mail address shown on the card', () => {
  it('only the address reaches the detection of a signed-in Claude', async () => {
    const detection = await claude(ok(claudeStatus({})))
    expect(detection.account).toBe(EMAIL)
    const text = JSON.stringify({ ...detection, account: undefined })
    for (const secret of [EMAIL, ORG_ID, ORG_NAME, 'someone']) expect(text).not.toContain(secret)
    expect(Object.keys(detection).sort()).toEqual(
      ['account', 'loginKind', 'loginMethod', 'planName', 'provider', 'state', 'version'].sort(),
    )
  })

  it('never reaches an error text either', async () => {
    const failed = await claude({
      code: 1,
      stdout: '',
      stderr: `Error: could not refresh the session of ${EMAIL} in organization ${ORG_ID}\n`,
    })
    expect(failed.state).toBe('error')
    expect(failed.error).not.toContain(EMAIL)
    expect(failed.error).not.toContain(ORG_ID)

    const key = await codex({
      code: 1,
      stdout: '',
      stderr: 'Unexpected error retrieving API key: sk-proj-abcdefghijklmnopqrstuvwxyz0123456789\n',
    })
    expect(key.state).toBe('error')
    expect(key.error).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz0123456789')
  })

  it('the Codex API-key line keeps nothing of the masked key', async () => {
    const detection = await codex(ok('', 'Logged in using an API key - sk-proj-***ABCD\n'))
    expect(JSON.stringify(detection)).not.toContain('ABCD')
    expect(detection.loginKind).toBe('api-key')
  })

  it('parsers return only the fields the status needs', () => {
    expect(parseClaudeAuthStatus(claudeStatus({}))).toEqual({
      signedIn: true,
      loginMethod: 'subscription',
      planName: 'max',
      loginKind: 'claude.ai/firstParty',
      account: EMAIL,
    })
    expect(
      parseClaudeAuthStatus('warning: something\n' + claudeStatus({ loggedIn: false })),
    ).toEqual({
      signedIn: false,
    })
    expect(parseClaudeAuthStatus('Not JSON at all')).toBeNull()
    expect(parseCodexLoginStatus('Logged in using ChatGPT')).toEqual({
      signedIn: true,
      loginMethod: 'subscription',
      loginKind: 'chatgpt',
    })
    expect(parseCodexLoginStatus('Not logged in')).toEqual({ signedIn: false })
    expect(parseCodexLoginStatus('')).toBeNull()
  })
})

describe('a check that does not answer', () => {
  it('gives up after 20 seconds by default', () => {
    expect(SUBSCRIPTION_STATUS_TIMEOUT_MS).toBe(20_000)
  })

  it('becomes an error, and the program it was waiting on is stopped', async () => {
    let aborted = false
    const run: SubscriptionRunner = (_program, _args, options) =>
      new Promise(() => {
        options.signal.addEventListener('abort', () => {
          aborted = true
        })
      })
    const started = Date.now()
    const detection = await detectSubscriptionLogin('codex', { locate: found, run, timeoutMs: 40 })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(detection).toMatchObject({ provider: 'codex', state: 'error' })
    expect(subscriptionStatusErrorKind(detection)).toBe('timeout')
    expect(aborted).toBe(true)
  })

  it('a lookup that hangs is covered by the same deadline', async () => {
    const detection = await detectSubscriptionLogin('claude-code', {
      locate: () => new Promise(() => {}),
      run: fakeCli({}).run,
      timeoutMs: 40,
    })
    expect(subscriptionStatusErrorKind(detection)).toBe('timeout')
  })
})

describe('a CLI too old to answer (spec 7)', () => {
  it('Claude below the minimum version is an error that says to update, and is not asked anything else', async () => {
    const cli = fakeCli({ version: ok('1.0.44 (Claude Code)\n'), status: ok(claudeStatus({})) })
    const detection = await detectSubscriptionLogin('claude-code', { locate: found, run: cli.run })
    expect(detection).toMatchObject({ provider: 'claude-code', state: 'error', version: '1.0.44' })
    expect(subscriptionStatusErrorKind(detection)).toBe('needs-update')
    expect(detection.error).toContain(SUBSCRIPTION_MIN_VERSIONS['claude-code'])
    // an old CLI without `auth` would take "auth status" as a prompt and spend quota
    expect(cli.calls).toEqual([['--version']])
  })

  it('names the file it ran on a CLI too old, and on no other result', async () => {
    const old = fakeCli({ version: ok('1.0.44 (Claude Code)\n'), status: ok(claudeStatus({})) })
    const outdated = await detectSubscriptionLogin('claude-code', { locate: found, run: old.run })
    expect(outdated.programPath).toBe('/fake/claude')
    const unknownOption = await codex({
      code: 2,
      stdout: '',
      stderr: "error: unrecognized subcommand 'status'\n",
    })
    expect(unknownOption.programPath).toBe('/fake/codex')
    const current = fakeCli({ version: CLAUDE_VERSION, status: ok(claudeStatus({})) })
    const ready = await detectSubscriptionLogin('claude-code', { locate: found, run: current.run })
    expect(ready.programPath).toBeUndefined()
  })

  it('Claude whose version cannot be read is not asked for its status either', async () => {
    const cli = fakeCli({
      version: ok('claude: development build\n'),
      status: ok(claudeStatus({})),
    })
    const detection = await detectSubscriptionLogin('claude-code', { locate: found, run: cli.run })
    expect(detection.state).toBe('error')
    expect(cli.calls).toEqual([['--version']])
  })

  it('a status command the CLI does not know is an error that says to update', async () => {
    const claudeOld = await claude({
      code: 1,
      stdout: '',
      stderr: "error: unknown option '--json'\n",
    })
    expect(subscriptionStatusErrorKind(claudeOld)).toBe('needs-update')
    const codexOld = await codex({
      code: 2,
      stdout: '',
      stderr: "error: unrecognized subcommand 'status'\n\nUsage: codex login [OPTIONS]\n",
    })
    expect(codexOld).toMatchObject({ state: 'error', version: '0.159.2' })
    expect(subscriptionStatusErrorKind(codexOld)).toBe('needs-update')
  })

  it('a program that gives no version is a plain failure, not a Codex too old', async () => {
    // a Codex helper (codex-code-mode-host.exe) answers the same way as an old
    // CLI but never names a version; an update would change nothing
    const detection = await codex(
      {
        code: 2,
        stdout: '',
        stderr:
          "error: unexpected argument 'login' found\n\nUsage: codex-code-mode-host.exe [OPTIONS]\n",
      },
      ok(''),
    )
    expect(detection.state).toBe('error')
    expect(detection.version).toBeUndefined()
    expect(subscriptionStatusErrorKind(detection)).toBe('failed')
  })

  it('compares versions numerically', async () => {
    const newer = fakeCli({ version: ok('2.10.3 (Claude Code)'), status: ok(claudeStatus({})) })
    const detection = await detectSubscriptionLogin('claude-code', {
      locate: found,
      run: newer.run,
    })
    expect(detection.state).toBe('ready')
  })
})

describe('what the commands look like', () => {
  it('asks Claude for its version, then its auth status as JSON', async () => {
    const cli = fakeCli({ version: CLAUDE_VERSION, status: ok(claudeStatus({})) })
    await detectSubscriptionLogin('claude-code', { locate: found, run: cli.run })
    expect(cli.calls).toEqual([['--version'], ['auth', 'status', '--json']])
  })

  it('asks Codex for its version and its login status', async () => {
    const cli = fakeCli({ version: CODEX_VERSION, status: ok('', 'Logged in using ChatGPT') })
    await detectSubscriptionLogin('codex', { locate: found, run: cli.run })
    expect(cli.calls.map((args) => args.join(' ')).sort()).toEqual(['--version', 'login status'])
  })

  it('hands the configured path to the lookup', async () => {
    const seen: Array<string | undefined> = []
    await detectSubscriptionLogin('codex', {
      configuredPath: 'D:\\tools\\codex.exe',
      locate: async (_provider, options) => {
        seen.push(options?.configuredPath)
        return null
      },
      run: fakeCli({}).run,
    })
    expect(seen).toEqual(['D:\\tools\\codex.exe'])
  })
})

describe('both providers at once', () => {
  it('starts the second check before the first has answered', async () => {
    const started: string[] = []
    const release: Array<() => void> = []
    const run: SubscriptionRunner = (prog, args) =>
      new Promise((resolve) => {
        started.push(`${prog.provider}:${args.join(' ')}`)
        release.push(() =>
          resolve(
            args[0] === '--version'
              ? prog.provider === 'codex'
                ? CODEX_VERSION
                : CLAUDE_VERSION
              : prog.provider === 'codex'
                ? ok('', 'Logged in using ChatGPT')
                : ok(claudeStatus({})),
          ),
        )
      })
    const pending = detectSubscriptionLogins({ locate: found, run })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started.some((entry) => entry.startsWith('claude-code:'))).toBe(true)
    expect(started.some((entry) => entry.startsWith('codex:'))).toBe(true)
    // nothing has answered yet
    expect(release.length).toBe(started.length)
    while (true) {
      const next = release.shift()
      if (next) next()
      else if (started.length >= 4) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const detections = await pending
    expect(detections['claude-code'].state).toBe('ready')
    expect(detections.codex.state).toBe('ready')
  })

  it('one provider failing does not take the other with it', async () => {
    const run: SubscriptionRunner = async (prog, args) => {
      if (prog.provider === 'claude-code') throw new Error('spawn UNKNOWN')
      return args[0] === '--version' ? CODEX_VERSION : ok('', 'Logged in using ChatGPT')
    }
    const detections = await detectSubscriptionLogins({ locate: found, run })
    expect(detections['claude-code'].state).toBe('error')
    expect(detections.codex.state).toBe('ready')
  })
})

describe('the Codex account type from the app-server', () => {
  it('reads account/read: the kind of login, the plan and the address for the card', () => {
    expect(
      codexAccountInfo({
        account: { type: 'chatgpt', email: EMAIL, planType: 'plus' },
        requiresOpenaiAuth: true,
      }),
    ).toEqual({
      signedIn: true,
      loginMethod: 'subscription',
      planName: 'plus',
      loginKind: 'chatgpt',
      account: EMAIL,
    })
    expect(codexAccountInfo({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })).toEqual({
      signedIn: true,
      loginMethod: 'metered',
      loginKind: 'api-key',
    })
    expect(codexAccountInfo({ account: null, requiresOpenaiAuth: true })).toEqual({
      signedIn: false,
    })
    // no account and none required: a custom model provider, not a subscription
    expect(codexAccountInfo({ account: null, requiresOpenaiAuth: false })).toMatchObject({
      signedIn: true,
      loginMethod: 'unknown',
    })
    expect(codexAccountInfo({ account: { type: 'somethingNew' } })).toMatchObject({
      loginMethod: 'unknown',
    })
    expect(codexAccountInfo('nonsense')).toBeNull()
  })

  it('adds the plan name and the address to a ChatGPT login', async () => {
    const cli = fakeCli({ version: CODEX_VERSION, status: ok('', 'Logged in using ChatGPT') })
    const detection = await detectSubscriptionLogin('codex', {
      locate: found,
      run: cli.run,
      codexAccount: async () => ({
        account: { type: 'chatgpt', email: EMAIL, planType: 'pro' },
        requiresOpenaiAuth: true,
      }),
    })
    expect(detection).toMatchObject({
      state: 'ready',
      loginMethod: 'subscription',
      planName: 'pro',
      account: EMAIL,
    })
  })

  it('never upgrades a login either side calls metered', async () => {
    const chatgptCli = fakeCli({
      version: CODEX_VERSION,
      status: ok('', 'Logged in using ChatGPT'),
    })
    const keyAccount = await detectSubscriptionLogin('codex', {
      locate: found,
      run: chatgptCli.run,
      codexAccount: async () => ({ account: { type: 'apiKey' }, requiresOpenaiAuth: true }),
    })
    expect(keyAccount).toMatchObject({ state: 'metered', loginMethod: 'metered' })
    expect(keyAccount.planName).toBeUndefined()

    const keyCli = fakeCli({
      version: CODEX_VERSION,
      status: ok('', 'Logged in using an API key - sk-***'),
    })
    const chatgptAccount = await detectSubscriptionLogin('codex', {
      locate: found,
      run: keyCli.run,
      codexAccount: async () => ({
        account: { type: 'chatgpt', email: EMAIL, planType: 'pro' },
        requiresOpenaiAuth: true,
      }),
    })
    expect(chatgptAccount).toMatchObject({ state: 'metered', loginMethod: 'metered' })
    // the reading that lost says nothing about who is signed in
    expect(JSON.stringify(chatgptAccount)).not.toContain(EMAIL)
  })

  it('a failing account source leaves the CLI answer standing', async () => {
    const cli = fakeCli({ version: CODEX_VERSION, status: ok('', 'Logged in using ChatGPT') })
    const detection = await detectSubscriptionLogin('codex', {
      locate: found,
      run: cli.run,
      codexAccount: async () => {
        throw new Error('app-server did not start')
      },
    })
    expect(detection).toMatchObject({ state: 'ready', loginMethod: 'subscription' })
  })

  it('setCodexAccountSource is how the Codex bridge plugs it in for every check', async () => {
    const asked: Array<string | undefined> = []
    setCodexAccountSource(async ({ configuredPath }) => {
      asked.push(configuredPath)
      return { account: { type: 'chatgpt', email: EMAIL, planType: 'team' } }
    })
    try {
      const cli = fakeCli({ version: CODEX_VERSION, status: ok('', 'Logged in using ChatGPT') })
      const withSource = await detectSubscriptionLogin('codex', {
        locate: found,
        run: cli.run,
        configuredPath: 'D:\\codex.exe',
      })
      expect(withSource.planName).toBe('team')
      expect(asked).toEqual(['D:\\codex.exe'])
      // null turns it off for one check; Claude never asks it
      const off = await detectSubscriptionLogin('codex', {
        locate: found,
        run: cli.run,
        codexAccount: null,
      })
      expect(off.planName).toBeUndefined()
      await claude(ok(claudeStatus({})))
      expect(asked).toHaveLength(1)
    } finally {
      setCodexAccountSource(null)
    }
  })
})
