import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { IsValidExecutionContext } from '../../shared/common/validators/execution-context.validator';

/** What this workflow identifies itself as in the capsule. */
export const DECISION_RISK_AGENT_SLUG = 'decision-risk';

/**
 * Workflows use `agentType: 'workflow'`, which is what the frontend's
 * ExecutionContext store is initialised with for marketing-swarm. (The
 * customer-service landing endpoint uses 'langgraph' — that inconsistency
 * predates this workflow and is not resolved here.)
 */
export const DECISION_RISK_AGENT_TYPE = 'workflow';

/**
 * Body of POST /workflows/decision-risk/assess.
 *
 * This is a CLASS, not an interface, and that is load-bearing. The global
 * ValidationPipe (`whitelist`, `forbidNonWhitelisted`, `transform` — see
 * app-bootstrap.ts) only validates when the body's metatype carries
 * class-validator metadata. A plain interface erases to Object, the pipe skips
 * it, and `@IsValidExecutionContext()` never runs — which is exactly how this
 * endpoint shipped with no validation at all.
 */
export class DecisionRiskAssessDto {
  /**
   * The capsule, originated by the frontend's executionContextStore and passed
   * through whole. Never rebuilt here, never mutated.
   */
  @IsValidExecutionContext()
  context!: ExecutionContext;

  @IsString()
  @MinLength(10, {
    message:
      'proposition must describe what is being considered; a few words cannot be assessed',
  })
  @MaxLength(4000)
  proposition!: string;

  @IsString()
  @IsOptional()
  @MaxLength(8000)
  background?: string;
}
