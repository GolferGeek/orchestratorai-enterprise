import { Logger } from '@nestjs/common';
import type { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import type { RiskStoreService } from '../risk-store.service';
import type {
  DecisionRiskState,
  DimensionAssessment,
} from '../decision-risk.state';
import { parseJsonResponse, requireBoundedNumber } from './parse-json-response';

interface DimensionResponse {
  score: unknown;
  confidence: unknown;
  reasoning: unknown;
  evidence?: unknown;
}

/**
 * The risk radar: every dimension assesses the proposition independently and in
 * parallel, each with its own prompt from the database.
 *
 * Independence is the point. The dimensions do not see each other's verdicts,
 * so they cannot converge on a shared narrative — which is what makes the
 * spread between them informative, and what gives the red team something real
 * to attack later.
 */
export function createAssessDimensionsNode(deps: {
  llm: LLMHttpClientService;
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
  ): Promise<Partial<DecisionRiskState>> => {
    const { dimensions, scope, subjectId, executionContext } = state;

    if (!scope || !subjectId) {
      throw new Error(
        'assess_dimensions ran without a scope or subject. load_scope must run first.',
      );
    }

    const userMessage = buildUserMessage(state);

    deps.logger.log(
      `Assessing ${dimensions.length} dimensions for subject ${subjectId}`,
    );

    // Promise.all, not allSettled: a dimension that fails must fail the run.
    // A composite computed from a subset, presented as complete, is a wrong
    // answer that looks like a right one.
    const assessments: DimensionAssessment[] = await Promise.all(
      dimensions.map(async (dimension) => {
        const response = await deps.llm.callLLM({
          context: executionContext,
          systemMessage: dimension.systemPrompt,
          userMessage,
          temperature: 0.3,
          callerName: `decision-risk:${dimension.slug}`,
        });

        const parsed = parseJsonResponse<DimensionResponse>(
          response.text,
          `Dimension '${dimension.slug}'`,
        );

        return {
          dimensionId: dimension.id,
          dimensionSlug: dimension.slug,
          score: Math.round(
            requireBoundedNumber(
              parsed.score,
              `Dimension '${dimension.slug}' score`,
              0,
              100,
            ),
          ),
          confidence: requireBoundedNumber(
            parsed.confidence,
            `Dimension '${dimension.slug}' confidence`,
            0,
            1,
          ),
          reasoning: String(parsed.reasoning ?? '').trim(),
          evidence: Array.isArray(parsed.evidence)
            ? parsed.evidence.map((e) => String(e))
            : [],
        };
      }),
    );

    const persisted = await deps.store.recordAssessments(
      subjectId,
      executionContext.conversationId,
      assessments,
      dimensions,
      executionContext.provider,
      executionContext.model,
    );

    return { assessments: persisted, status: 'in_progress' };
  };
}

export function buildUserMessage(state: DecisionRiskState): string {
  const parts = [`PROPOSITION:\n${state.proposition}`];
  if (state.background?.trim()) {
    parts.push(`CONTEXT:\n${state.background.trim()}`);
  } else {
    parts.push(
      'CONTEXT:\nNone supplied. Say so in your reasoning and let it lower your confidence rather than inventing detail.',
    );
  }
  return parts.join('\n\n');
}
