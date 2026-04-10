/**
 * Fortification Node — revises the brief based on accepted recommendations.
 *
 * Takes the original brief + accepted recommendations from the HITL decision
 * and produces a revised brief with the fortifications applied.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import type { AdversarialBriefState } from '../adversarial-brief.state';

const FORTIFICATION_SYSTEM_PROMPT = `You are a legal brief editor. Your task is to revise a legal brief by applying specific fortification recommendations.

You will receive:
1. The original brief text
2. A list of accepted recommendations (each with a description and suggested fix)

Apply ONLY the accepted recommendations. Do not make other changes. Preserve the original tone, style, and structure as much as possible.

For each recommendation:
- If it suggests strengthening an argument, add supporting reasoning
- If it suggests replacing a citation, swap it out
- If it suggests addressing a factual gap, add supporting evidence language

Return the complete revised brief text.`;

export function createFortificationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function fortificationNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Applying ${state.acceptedFortifications.length} fortifications`,
      { step: 'fortification', progress: 90 },
    );

    const originalBrief = state.documents
      .map((doc) => doc.content)
      .join('\n\n');

    // Find the accepted recommendations from the stress test report
    const report = state.stressTestReport;
    const acceptedIds = new Set(state.acceptedFortifications);
    const acceptedRecommendations = [
      ...(report?.attacks.filter((a) => acceptedIds.has(a.id)) ?? []),
    ];

    if (acceptedRecommendations.length === 0) {
      return { fortifiedBrief: originalBrief };
    }

    const recommendationText = acceptedRecommendations
      .map(
        (r, i) =>
          `${i + 1}. [${r.category}] ${r.description}\n   Recommendation: ${r.recommendation}`,
      )
      .join('\n');

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: FORTIFICATION_SYSTEM_PROMPT,
      userMessage: `Original brief:\n${originalBrief}\n\nAccepted recommendations:\n${recommendationText}`,
      temperature: 0.2,
      maxTokens: 8000,
      callerName: 'adversarial-brief:fortification',
    });

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Fortification complete',
      { step: 'fortification_complete', progress: 93 },
    );

    return {
      fortifiedBrief: response.text,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
