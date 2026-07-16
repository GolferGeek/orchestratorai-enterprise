/**
 * Contract-review orchestrator — invokes specialists and validates clauseIds.
 *
 * Reuses the same parallel/sequential provider gating pattern as the
 * document-onboarding orchestrator, but adds post-specialist validation
 * to strip annotations that reference clauseIds not in the clause map.
 */
import { Logger } from '@nestjs/common';
import { LegalDepartmentState } from '../../../legal-department.state';
import type { ClauseAnnotation } from '../../../legal-department.types';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ContractReviewSpecialistMap } from './specialists';

const logger = new Logger('contract-review:orchestrator');
const SINGLE_STREAM_PROVIDERS = new Set(['ollama']);

export function createContractReviewOrchestratorNode(
  specialists: ContractReviewSpecialistMap,
  observability: ObservabilityService,
) {
  return async function orchestratorNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;
    const specialistsList = state.routingDecision?.specialists || [];

    if (specialistsList.length === 0) {
      return {};
    }

    // Detect rejection re-run: if HITL decision was 'reject', only
    // re-analyze the rejected clauses by filtering the clause map.
    const hitlDecision = state.orchestration?.hitlDecision;
    let effectiveState = state;
    let isPartialRerun = false;

    if (
      hitlDecision?.decision === 'reject' &&
      'feedback' in hitlDecision &&
      hitlDecision.feedback &&
      state.clauseMap
    ) {
      // Parse rejected clauseIds from feedback (format: "Clauses rejected: s1-c1, s2-c1")
      const feedbackStr = hitlDecision.feedback;
      const match = feedbackStr.match(/Clauses rejected:\s*(.+)/);
      if (match) {
        const rejectedIds = new Set(
          match[1]!.split(',').map((id) => id.trim()),
        );

        if (rejectedIds.size > 0) {
          isPartialRerun = true;
          // Create a filtered clause map with only rejected clauses
          const filteredEntries = state.clauseMap.entries.filter((e) =>
            rejectedIds.has(e.clauseId),
          );

          effectiveState = {
            ...state,
            clauseMap: {
              ...state.clauseMap,
              entries: filteredEntries,
              clauseCount: filteredEntries.filter(
                (e) => e.entryType === 'clause',
              ).length,
              sectionCount: filteredEntries.filter(
                (e) => e.entryType === 'section',
              ).length,
            },
          };

          logger.log(
            `Partial re-run: ${rejectedIds.size} rejected clauses (${[...rejectedIds].join(', ')})`,
          );
        }
      }
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      isPartialRerun
        ? `Contract Review Orchestrator: Re-analyzing ${effectiveState.clauseMap?.entries.length ?? 0} rejected clauses`
        : `Contract Review Orchestrator: Invoking ${specialistsList.length} specialists`,
      {
        step: 'cr_orchestrator_start',
        progress: 35,
        specialists: specialistsList,
        isPartialRerun,
      },
    );

    try {
      // Filter to valid specialists — use underscore-to-camelCase mapping
      // since CLO routing uses snake_case keys (real_estate) while
      // specialist configs use camelCase keys (realEstate).
      const snakeToCamel: Record<string, string> = {
        real_estate: 'realEstate',
      };
      const validSpecialists = specialistsList
        .map((name) => snakeToCamel[name] ?? name)
        .filter((name) => {
          if (!specialists[name]) {
            logger.warn(`Specialist ${name} not found, skipping`);
            return false;
          }
          return true;
        });

      const isSingleStream = SINGLE_STREAM_PROVIDERS.has(ctx.provider);
      const mode = isSingleStream ? 'sequential' : 'parallel';

      const runOne = async (specialistName: string) => {
        const specialist = specialists[specialistName];
        if (!specialist) {
          return { specialistName, result: {}, success: false };
        }
        try {
          const result = await specialist(effectiveState);
          return {
            specialistName,
            result,
            success: !(result.error || result.status === 'failed'),
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`Specialist ${specialistName} failed: ${msg}`);
          return {
            specialistName,
            result: { error: msg },
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

      // Merge successful specialist outputs
      const completed: string[] = [];
      const failed: string[] = [];
      let mergedOutputs: typeof state.specialistOutputs = {};

      for (const { specialistName, result, success } of results) {
        if (success) {
          completed.push(specialistName);
          mergedOutputs = { ...mergedOutputs, ...result.specialistOutputs };
        } else {
          failed.push(specialistName);
        }
      }

      // For partial re-runs, merge new specialist outputs with existing
      // accepted annotations from the previous round.
      if (isPartialRerun && state.specialistOutputs) {
        for (const [key, existingValue] of Object.entries(
          state.specialistOutputs,
        )) {
          if (!Array.isArray(existingValue)) continue;
          const existingAnnotations =
            existingValue as unknown as ClauseAnnotation[];
          const newAnnotations = ((mergedOutputs as Record<string, unknown>)[
            key
          ] ?? []) as unknown as ClauseAnnotation[];
          const rejectedIds = new Set(
            effectiveState.clauseMap?.entries.map((e) => e.clauseId) ?? [],
          );

          // Keep existing annotations for non-rejected clauses,
          // replace with new annotations for rejected clauses
          const preserved = existingAnnotations.filter(
            (a) => !rejectedIds.has(a.clauseId),
          );
          (mergedOutputs as Record<string, unknown>)[key] = [
            ...preserved,
            ...newAnnotations,
          ];
        }
      }

      // Post-specialist validation: strip annotations with invalid clauseIds
      const validClauseIds = new Set(
        state.clauseMap?.entries.map((e) => e.clauseId) ?? [],
      );

      if (validClauseIds.size > 0) {
        for (const [key, value] of Object.entries(mergedOutputs)) {
          if (!Array.isArray(value)) continue;
          const annotations = value as unknown as ClauseAnnotation[];
          const before = annotations.length;
          const valid = annotations.filter((a) =>
            validClauseIds.has(a.clauseId),
          );
          if (valid.length < before) {
            logger.warn(
              `${key}: stripped ${before - valid.length} annotations with invalid clauseIds`,
            );
          }
          (mergedOutputs as Record<string, unknown>)[key] = valid;
        }
      }

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Contract Review Orchestrator: ${completed.length}/${validSpecialists.length} specialists completed (${mode})`,
        {
          step: 'cr_orchestrator_complete',
          progress: 70,
          completed,
          failed,
          mode,
        },
      );

      return {
        specialistOutputs: mergedOutputs,
        orchestration: {
          specialists: validSpecialists,
          completed,
          failed: failed.length > 0 ? failed : undefined,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Contract Review Orchestrator failed: ${msg}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Contract Review Orchestrator: ${msg}`,
        status: 'failed',
      };
    }
  };
}
