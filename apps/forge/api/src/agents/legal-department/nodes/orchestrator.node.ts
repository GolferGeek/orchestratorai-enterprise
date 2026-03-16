import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';

// Import all specialist node creators
import { createContractAgentNode } from './contract-agent.node';
import { createComplianceAgentNode } from './compliance-agent.node';
import { createIpAgentNode } from './ip-agent.node';
import { createPrivacyAgentNode } from './privacy-agent.node';
import { createEmploymentAgentNode } from './employment-agent.node';
import { createCorporateAgentNode } from './corporate-agent.node';
import { createLitigationAgentNode } from './litigation-agent.node';
import { createRealEstateAgentNode } from './real-estate-agent.node';

/**
 * Multi-Agent Orchestrator Node - M11
 *
 * Purpose: Invoke multiple specialists in parallel for complex documents.
 *
 * This node:
 * 1. Checks if multi-agent mode is enabled
 * 2. Invokes all required specialists in parallel using Promise.all()
 * 3. Merges all outputs into specialistOutputs
 * 4. Returns control to graph for synthesis
 *
 * Performance:
 * - Parallel execution: max(30s, 30s, 30s) = 30s instead of 30s + 30s + 30s = 90s
 * - Each specialist runs independently
 * - Results are merged after all specialists complete
 */
export function createOrchestratorNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  // Create specialist node functions
  const specialists = {
    contract: createContractAgentNode(llmClient, observability),
    compliance: createComplianceAgentNode(llmClient, observability),
    ip: createIpAgentNode(llmClient, observability),
    privacy: createPrivacyAgentNode(llmClient, observability),
    employment: createEmploymentAgentNode(llmClient, observability),
    corporate: createCorporateAgentNode(llmClient, observability),
    litigation: createLitigationAgentNode(llmClient, observability),
    realEstate: createRealEstateAgentNode(llmClient, observability),
  };

  return async function orchestratorNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    // Check if multi-agent mode is enabled
    const multiAgent = state.routingDecision?.multiAgent;
    const specialistsList = state.routingDecision?.specialists || [];

    if (!multiAgent || specialistsList.length === 0) {
      // Single agent mode - should not reach here, but handle gracefully
      return {};
    }

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      `Orchestrator: Invoking ${specialistsList.length} specialists`,
      {
        step: 'orchestrator_start',
        progress: 55,
        specialists: specialistsList,
      },
    );

    try {
      // Filter to valid specialists
      const validSpecialists = specialistsList.filter((name) => {
        const specialist = specialists[name as keyof typeof specialists];
        if (!specialist) {
          console.warn(`Specialist ${name} not found, skipping`);
          return false;
        }
        return true;
      });

      await observability.emitProgress(
        ctx,
        ctx.taskId,
        `Orchestrator: Invoking ${validSpecialists.length} specialists in parallel`,
        {
          step: 'orchestrator_parallel_start',
          progress: 55,
          specialists: validSpecialists,
        },
      );

      // Invoke all specialists in parallel
      const results = await Promise.all(
        validSpecialists.map(async (specialistName) => {
          const specialist =
            specialists[specialistName as keyof typeof specialists];
          try {
            const result = await specialist(state);
            // Emit per-specialist completion to keep SSE alive during parallel execution
            await observability.emitProgress(
              ctx,
              ctx.taskId,
              `Orchestrator: ${specialistName} specialist completed`,
              {
                step: 'specialist_done',
                progress: 70,
                specialist: specialistName,
              },
            );
            return {
              specialistName,
              result,
              success: !(result.error || result.status === 'failed'),
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error(`Specialist ${specialistName} failed:`, errorMessage);
            return {
              specialistName,
              result: { error: errorMessage },
              success: false,
            };
          }
        }),
      );

      // Process results - merge successful specialist outputs
      const completed: string[] = [];
      const failed: string[] = [];
      let mergedSpecialistOutputs: typeof state.specialistOutputs = {};

      for (const { specialistName, result, success } of results) {
        if (success) {
          completed.push(specialistName);
          // Merge specialist outputs
          mergedSpecialistOutputs = {
            ...mergedSpecialistOutputs,
            ...result.specialistOutputs,
          };
        } else {
          failed.push(specialistName);
          console.error(`Specialist ${specialistName} failed:`, result.error);
        }
      }

      await observability.emitProgress(
        ctx,
        ctx.taskId,
        `Orchestrator: All specialists completed (${completed.length}/${validSpecialists.length} successful)`,
        { step: 'orchestrator_complete', progress: 85, completed, failed },
      );

      // Return merged state with all specialist outputs
      return {
        specialistOutputs: mergedSpecialistOutputs,
        orchestration: {
          specialists: validSpecialists,
          completed,
          failed: failed.length > 0 ? failed : undefined,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.taskId,
        `Orchestrator failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Orchestrator: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}
