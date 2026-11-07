import {
  agentStartFailureCode,
  type AgentRunErrorKind,
  type AgentStartFailure,
} from '../../../shared/agent-api'
import type { AgentProgramProblem } from '@genoffice/ai-provider/agent-session'
import type { AgentStringKey } from '../i18n/strings-agent'

export const RUN_ERROR: Record<AgentRunErrorKind, AgentStringKey> = {
  'unsafe-tools': 'errUnsafeTools',
  'sandbox-unavailable': 'errSandboxUnavailable',
  'rate-limit': 'errRateLimit',
  'signed-out': 'errSignedOut',
  'metered-not-accepted': 'errMetered',
  'needs-update': 'errNeedsUpdate',
  'not-installed': 'errNotInstalled',
}

export function runErrorKey(kind: string | undefined): AgentStringKey {
  return (kind && RUN_ERROR[kind as AgentRunErrorKind]) || 'errGeneric'
}

type StartErrorView = { key: AgentStringKey; code?: string | undefined }

function problemView(problem: AgentProgramProblem, code: string): StartErrorView {
  switch (problem.type) {
    case 'unsupported-path':
      return { key: 'errUnsupportedPath' }
    case 'exited':
      return { key: 'errProgramExited', code }
    case 'no-answer':
      return { key: 'errProgramNoAnswer', code }
    case 'refused':
      return { key: 'errProgramRefused', code }
    case 'no-model':
      return { key: 'errNoModel' }
  }
}

export function agentStartErrorView(failure: AgentStartFailure): StartErrorView {
  const code = agentStartFailureCode(failure)
  switch (failure.reason) {
    case 'bad-folder':
      return { key: 'errBadFolder' }
    case 'not-connected':
      return { key: 'errNotConnected' }
    case 'not-accepted':
      return { key: 'errNotAccepted' }
    case 'provider-blocked':
      return { key: 'providerBlocked' }
    case 'run-error':
      return { key: RUN_ERROR[failure.kind] }
    case 'program-problem':
      return problemView(failure.problem, code)
    case 'prepare-failed':
      return { key: 'errPrepareFailed', code }
    case 'invalid-request':
    case 'unknown':
      return { key: 'errGeneric', code }
  }
}
