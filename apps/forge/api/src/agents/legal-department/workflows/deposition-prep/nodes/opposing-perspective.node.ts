/**
 * Opposing Perspective Node — models opposing counsel's deposition strategy:
 * goals, available documents, and witness vulnerabilities in priority order.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  OpposingPerspectiveOutput,
} from '../deposition-prep.state';

const OPPOSING_PERSPECTIVE_SYSTEM_PROMPT = `You are an expert deposition strategist. Model the opposing counsel's perspective for this deposition.

Analyze what opposing counsel is trying to accomplish and how they will approach this witness. Be specific and adversarial — think like a skilled litigator who has prepared this witness list.

Respond ONLY with valid JSON matching this schema:
{
  "depositionGoals": ["..."],
  "availableDocuments": ["..."],
  "witnessVulnerabilities": ["..."]
}

Where:
- depositionGoals: What opposing counsel wants to prove through this witness (3-5 specific objectives)
- availableDocuments: Documents opposing counsel likely has access to and will use to confront this witness
- witnessVulnerabilities: Weaknesses in this witness's position, ordered by priority (most damaging first)`;

export function createOpposingPerspectiveNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function opposingPerspectiveNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      "Modeling opposing counsel's deposition strategy",
      { step: 'opposing_perspective', progress: 35 },
    );

    const { input, caseAnalysis } = state;

    const caseContext = caseAnalysis
      ? `\n\nKEY THEMES IDENTIFIED:\n${caseAnalysis.themes.map((t) => `- ${t.description} (${t.relevance})`).join('\n')}\n\nLEGAL THEORIES:\n${caseAnalysis.legalTheories.map((t) => `- ${t}`).join('\n')}`
      : '';

    const userMessage = `CASE FACTS:\n${input.caseFacts}

WITNESS BACKGROUND:\n${input.witnessBackground}

WITNESS TYPE: ${input.witnessType}
${input.priorStatements ? `\nPRIOR STATEMENTS:\n${input.priorStatements}` : ''}${caseContext}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: OPPOSING_PERSPECTIVE_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.2,
      maxTokens: 3000,
      callerName: 'deposition-prep:opposing-perspective',
    });

    let opposingPerspective: OpposingPerspectiveOutput;
    try {
      opposingPerspective = JSON.parse(
        stripMarkdownFences(response.text),
      ) as OpposingPerspectiveOutput;
    } catch {
      return {
        error: `Failed to parse opposing perspective response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Opposing strategy modeled: ${opposingPerspective.witnessVulnerabilities.length} witness vulnerabilities identified`,
      { step: 'opposing_perspective_complete', progress: 50 },
    );

    return { opposingPerspective };
  };
}
