/**
 * What went wrong with an agent session's program when `AiRunError` has no
 * kind for it. The agent window names each problem; the message can hold
 * program output, so only `problem` is shown or recorded.
 */
export type AgentProgramProblem =
  | { type: 'unsupported-path' }
  | { type: 'exited'; exitCode?: number | undefined }
  | { type: 'no-answer'; step: string }
  | { type: 'refused'; step: string; code?: number | undefined }
  | { type: 'no-model' }

export class AgentProgramError extends Error {
  readonly problem: AgentProgramProblem

  constructor(problem: AgentProgramProblem, message: string) {
    super(message)
    this.name = 'AgentProgramError'
    this.problem = problem
  }
}
