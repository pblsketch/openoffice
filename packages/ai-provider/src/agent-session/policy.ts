/**
 * What the app does with an action a program wants to take in agent mode,
 * before anyone is asked. Pure: the session runners call it for every
 * permission request, and the shell's tests pin it.
 *
 * The programs' own flags are not trusted to keep these rules (the same stance
 * as the zero-tool check of the brain-only bridges): a request that reaches the
 * app is judged here again.
 */
import { posix, win32 } from 'node:path'
import type {
  AgentAction,
  AgentPermissionMode,
  AgentPolicyVerdict,
  AgentSessionAllowances,
} from './types'

export interface AgentPolicyContext {
  mode: AgentPermissionMode
  projectRoot: string
  openDocuments: readonly string[]
  protectedPaths: readonly string[]
  /** the session's copy of the skills; its scripts may be read and run */
  skillBundleDir?: string | undefined
  /** what the person allowed for the rest of this session (web actions) */
  allowances?: AgentSessionAllowances | undefined
  platform?: NodeJS.Platform | undefined
}

function pathApi(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix
}

/** A comparable form: absolute, normalised, and case-folded where the file system ignores case */
export function comparablePath(
  path: string,
  base: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const api = pathApi(platform)
  const unified = platform === 'win32' ? path.replace(/\//g, '\\') : path
  const resolved = api.resolve(base, unified)
  return platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** `child` is `root` itself or somewhere below it */
export function isInsidePath(
  child: string,
  root: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const api = pathApi(platform)
  const rel = api.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !api.isAbsolute(rel))
}

/**
 * A command line names a protected path when it contains it, written with
 * either separator, single or doubled (Codex reports its commands quoted, with
 * every backslash doubled)
 */
function commandNamesPath(command: string, path: string, platform: NodeJS.Platform): boolean {
  const separators = (value: string): string => value.replace(/[\\/]+/g, '/')
  const text = separators(platform === 'win32' ? command.toLowerCase() : command)
  const form = separators(path)
  return form.length > 3 && text.includes(form)
}

/** The site of a web address: its lower-case host name, for http and https only */
export function webHostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.hostname.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

export function agentPolicyVerdict(
  action: AgentAction,
  ctx: AgentPolicyContext,
): AgentPolicyVerdict {
  const platform = ctx.platform ?? process.platform
  const root = comparablePath(ctx.projectRoot, ctx.projectRoot, platform)
  const base = action.cwd ? comparablePath(action.cwd, root, platform) : root
  const paths = action.paths.map((path) => comparablePath(path, base, platform))
  const protectedPaths = ctx.protectedPaths.map((path) => comparablePath(path, root, platform))
  const openDocuments = new Set(
    ctx.openDocuments.map((path) => comparablePath(path, root, platform)),
  )
  const skills = ctx.skillBundleDir ? comparablePath(ctx.skillBundleDir, root, platform) : undefined
  const inScope = (path: string): boolean =>
    isInsidePath(path, root, platform) ||
    (skills !== undefined && isInsidePath(path, skills, platform))

  if (paths.some((path) => protectedPaths.some((guard) => isInsidePath(path, guard, platform)))) {
    return { decision: 'deny', reason: 'protected-path' }
  }
  if (
    action.command &&
    protectedPaths.some((guard) => commandNamesPath(action.command ?? '', guard, platform))
  ) {
    return { decision: 'deny', reason: 'protected-path' }
  }

  switch (action.kind) {
    case 'skill':
    case 'app-tool':
      return { decision: 'allow' }
    case 'read':
      // outside the folder the person chose, someone looks first, whatever the mode
      return paths.every(inScope) ? { decision: 'allow' } : { decision: 'ask' }
    case 'write': {
      if (paths.some((path) => openDocuments.has(path))) {
        return { decision: 'deny', reason: 'open-document' }
      }
      if (!paths.every((path) => isInsidePath(path, root, platform))) {
        return { decision: 'deny', reason: 'outside-project' }
      }
      return ctx.mode === 'ask-writes' ? { decision: 'ask' } : { decision: 'allow' }
    }
    case 'command':
      return ctx.mode === 'trust-project' ? { decision: 'allow' } : { decision: 'ask' }
    // The web asks the first time, as the program's own app does; the person may allow every
    // search, or one site's pages, for the rest of the session. Trusting the project leaves the
    // decision to the program's own mode, so a request that still reaches the app asks.
    case 'web-search':
      return ctx.allowances?.webSearch ? { decision: 'allow' } : { decision: 'ask' }
    case 'web-fetch':
      return action.host && ctx.allowances?.webHosts.has(action.host.toLowerCase())
        ? { decision: 'allow' }
        : { decision: 'ask' }
    // the relay asks the person itself; a request of this kind that reaches the policy asks
    case 'mcp-tool':
    case 'other':
      return { decision: 'ask' }
  }
}
