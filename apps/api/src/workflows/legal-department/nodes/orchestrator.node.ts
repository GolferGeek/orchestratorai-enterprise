import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';

export type SpecialistMap = Record<
  string,
  (state: LegalDepartmentState) => Promise<Partial<LegalDepartmentState>>
>;

/**
 * Multi-Agent Orchestrator Node - M11
 *
 * Purpose: Invoke multiple specialists for complex documents.
 *
 * This node:
 * 1. Checks if multi-agent mode is enabled
 * 2. Invokes specialists either in parallel (cloud providers) or sequentially
 *    (single-stream local providers like Ollama). Local-first sovereign deployments
 *    must run sequentially because Ollama serializes calls inside the daemon, so
 *    Promise.all just queues every call against the same GPU and the slowest one
 *    blows past the per-call timeout.
 * 3. Merges all outputs into specialistOutputs
 * 4. Returns control to graph for synthesis
 *
 * Provider gating:
 * - Cloud providers (anthropic, openai, google, etc.) → parallel via Promise.all
 * - Single-stream local providers (ollama) → sequential via for...of
 */
const SINGLE_STREAM_PROVIDERS = new Set(['ollama']);
export function createOrchestratorNode(
  specialists: SpecialistMap,
  observability: ObservabilityService,
) {
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
      ctx.conversationId,
      `Orchestrator: Invoking ${specialistsList.length} specialists`,
      {
        step: 'orchestrator_start',
        progress: 35,
        specialists: specialistsList,
      },
    );

    try {
      // Filter to valid specialists
      const validSpecialists = specialistsList.filter((name) => {
        const specialist = specialists[name];
        if (!specialist) {
          console.warn(`Specialist ${name} not found, skipping`);
          return false;
        }
        return true;
      });

      const isSingleStream = SINGLE_STREAM_PROVIDERS.has(ctx.provider);
      const mode = isSingleStream ? 'sequential' : 'parallel';

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Orchestrator: Invoking ${validSpecialists.length} specialists ${mode} (provider=${ctx.provider})`,
        {
          step: `orchestrator_${mode}_start`,
          progress: 35,
          specialists: validSpecialists,
          mode,
        },
      );

      const runOne = async (specialistName: string) => {
        const specialist = specialists[specialistName];
        if (!specialist) {
          // Should never happen — validSpecialists was already filtered, but guard for TS
          return {
            specialistName,
            result: { error: 'Specialist not found' },
            success: false,
          };
        }
        try {
          const result = await specialist(state);
          await observability.emitProgress(
            ctx,
            ctx.conversationId,
            `Orchestrator: ${specialistName} specialist completed`,
            {
              step: 'specialist_done',
              progress: 60,
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
      };

      let results: Awaited<ReturnType<typeof runOne>>[];
      if (isSingleStream) {
        results = [];
        for (const name of validSpecialists) {
          results.push(await runOne(name));
        }
      } else {
        results = await Promise.all(validSpecialists.map(runOne));
      }

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
        ctx.conversationId,
        `Orchestrator: All specialists completed (${completed.length}/${validSpecialists.length} successful)`,
        { step: 'orchestrator_complete', progress: 70, completed, failed },
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
        ctx.conversationId,
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
