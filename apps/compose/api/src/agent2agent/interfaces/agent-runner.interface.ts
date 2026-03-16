import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { TaskRequestDto } from '../dto/task-request.dto';
import { TaskResponseDto } from '../dto/task-response.dto';

/**
 * Base interface for all agent runners.
 *
 * All agent types (Context, Tool, API, External, Function, Orchestrator) must implement
 * this interface. The execute method handles routing to appropriate mode handlers
 * (CONVERSE, PLAN, BUILD) based on the request.
 *
 * @example
 * ```typescript
 * class ContextAgentRunnerService implements IAgentRunner {
 *   async execute(definition, request, organizationSlug) {
 *     // Implementation
 *   }
 * }
 * ```
 */
export interface IAgentRunner {
  /**
   * Execute an agent task in any mode (CONVERSE, PLAN, BUILD).
   *
   * This method is the single entry point for all agent execution. It should:
   * 1. Validate the agent supports the requested mode
   * 2. Route to the appropriate mode handler
   * 3. Execute the agent's logic
   * 4. Return a standardized TaskResponseDto
   *
   * @param definition - The agent's runtime definition including transport config
   * @param request - The task request containing mode, user message, and payload
   * @param organizationSlug - The organization context (null for global agents)
   * @returns A promise resolving to a standardized task response
   *
   * @throws Should not throw - errors should be returned in TaskResponseDto.failure()
   */
  execute(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    organizationSlug: string | null,
  ): Promise<TaskResponseDto>;
}
