import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEALED_PREFIX } from '@genoffice/ai-provider'
import { cliSecretCodec, revealedSecretsOf } from '../src/secrets'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const A = `${SEALED_PREFIX}AAA`
const B = `${SEALED_PREFIX}BBB`

function setup(stdout: string) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-secrets-'))
  dirs.push(dir)
  writeFileSync(
    join(dir, 'ai-settings.json'),
    JSON.stringify({
      provider: 'auto',
      providers: { openai: { apiKey: A, model: '' } },
      search: { provider: 'serper', providers: { serper: { apiKey: B } } },
    }),
  )
  const spawn = vi.fn(() => ({ stdout, status: 0 }))
  const env = { GENOFFICE_USER_DATA: dir, GENOFFICE_APP_BIN: join(dir, 'app.exe') }
  return { dir, spawn, codec: cliSecretCodec(env, { spawn }) }
}

describe('cliSecretCodec', () => {
  it('starts the app once for every sealed value of the file and keeps the answers', () => {
    const { dir, spawn, codec } = setup(
      `noise\n${JSON.stringify({ status: 'ok', secrets: { [A]: 'sk-a', [B]: 'sk-b' } })}\n`,
    )
    expect(codec.open(A)).toBe('sk-a')
    expect(codec.open(B)).toBe('sk-b')
    expect(spawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { input: string; env: NodeJS.ProcessEnv },
    ]
    expect(command).toBe(join(dir, 'app.exe'))
    expect(args).toEqual(['--reveal-ai-secrets'])
    expect(JSON.parse(options.input).sort()).toEqual([A, B])
    expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(options.env.GENOFFICE_USER_DATA).toBe(dir)
    expect(codec.seal('sk')).toBeNull()
  })

  it('reads a value the app could not open as unopened, without asking again', () => {
    const { spawn, codec } = setup('{"status":"error"}')
    expect(codec.open(A)).toBeNull()
    expect(codec.open(A)).toBeNull()
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})

describe('revealedSecretsOf', () => {
  it('takes only sealed keys with string values from an ok answer', () => {
    expect(
      revealedSecretsOf(
        JSON.stringify({ status: 'ok', secrets: { [A]: 'x', plain: 'y', [B]: 3 } }),
      ),
    ).toEqual({ [A]: 'x' })
    expect(revealedSecretsOf('garbage')).toEqual({})
  })
})
