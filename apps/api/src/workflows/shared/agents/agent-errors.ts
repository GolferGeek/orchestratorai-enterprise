import type { RoleCallResult } from '../models/workflow-llm.client';

/** The agent does not exist, or is disabled for the org. */
export class AgentUnavailableError extends Error {
  constructor(readonly agentSlug: string, reason: string) {
    super(`Agent "${agentSlug}" ${reason}`);
    this.name = 'AgentUnavailableError';
  }
}

/** The step gave the agent input its schema rejects. A workflow bug. */
export class AgentInputError extends Error {
  constructor(readonly agentSlug: string, readonly issues: string[]) {
    super(`Input to agent "${agentSlug}" does not match its schema: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'AgentInputError';
  }
}

/**
 * The model answered, but not with what the agent's contract requires. It
 * carries the raw answer and the call (model, llm_usage.run_id) so the
 * caller records them before rethrowing.
 */
export class AgentOutputError extends Error {
  constructor(
    readonly agentSlug: string,
    readonly issues: string[],
    readonly raw: string,
    readonly call: RoleCallResult,
    readonly definitionVersion: number,
    readonly modelRole: string,
  ) {
    super(`Agent "${agentSlug}" returned output that does not match its contract: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'AgentOutputError';
  }
}
