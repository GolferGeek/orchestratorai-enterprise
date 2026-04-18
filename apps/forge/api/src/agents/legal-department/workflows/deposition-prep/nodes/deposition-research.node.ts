/**
 * Deposition Research Node — researches deposition strategies for this dispute
 * type, evasion tactics for the witness type, and (optionally) opposing counsel
 * style when a name is provided.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  DepositionResearchOutput,
} from '../deposition-prep.state';

const STRATEGY_SYSTEM_PROMPT = `You are a litigation expert. Based on the case description, identify the most effective deposition strategies for this type of dispute.

Respond ONLY with valid JSON:
{ "caseStrategies": ["...", "..."] }`;

const EVASION_SYSTEM_PROMPT = `You are a litigation expert specializing in witness psychology. Describe the typical evasion tactics used by the given witness type during depositions, so counsel can anticipate and counter them.

Respond ONLY with valid JSON:
{ "evasionTactics": ["...", "..."] }`;

const COUNSEL_STYLE_SYSTEM_PROMPT = `You are a litigation expert. Based only on publicly available information about the named opposing counsel, describe their known deposition style — aggressive vs. methodical, common objections, typical document use, etc. If you have no reliable information, say so plainly.

Respond ONLY with valid JSON:
{ "opposingCounselStyle": "..." }`;

export function createDepositionResearchNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function depositionResearchNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;
    const { input } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Researching deposition strategies and witness evasion tactics',
      { step: 'deposition_research', progress: 60 },
    );

    const caseContext = `CASE FACTS:\n${input.caseFacts}\n\nLEGAL THEORIES: ${state.caseAnalysis?.legalTheories.join(', ') ?? 'unknown'}`;

    const [strategiesResponse, evasionResponse] = await Promise.all([
      callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: STRATEGY_SYSTEM_PROMPT,
        userMessage: caseContext,
        temperature: 0.1,
        maxTokens: 2000,
        callerName: 'deposition-prep:deposition-research',
      }),
      callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: EVASION_SYSTEM_PROMPT,
        userMessage: `WITNESS TYPE: ${input.witnessType}\n\nWITNESS BACKGROUND: ${input.witnessBackground}`,
        temperature: 0.1,
        maxTokens: 2000,
        callerName: 'deposition-prep:deposition-research',
      }),
    ]);

    let caseStrategies: string[];
    try {
      const parsed = JSON.parse(
        stripMarkdownFences(strategiesResponse.text),
      ) as { caseStrategies: string[] };
      caseStrategies = parsed.caseStrategies;
    } catch {
      return {
        error: `Failed to parse strategy research response: ${strategiesResponse.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    let evasionTactics: string[];
    try {
      const parsed = JSON.parse(stripMarkdownFences(evasionResponse.text)) as {
        evasionTactics: string[];
      };
      evasionTactics = parsed.evasionTactics;
    } catch {
      return {
        error: `Failed to parse evasion tactics response: ${evasionResponse.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    const researchFindings: DepositionResearchOutput = {
      caseStrategies,
      evasionTactics,
    };

    if (input.opposingCounselName) {
      const counselResponse = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: COUNSEL_STYLE_SYSTEM_PROMPT,
        userMessage: `OPPOSING COUNSEL: ${input.opposingCounselName}`,
        temperature: 0.1,
        maxTokens: 1000,
        callerName: 'deposition-prep:deposition-research',
      });

      try {
        const parsed = JSON.parse(
          stripMarkdownFences(counselResponse.text),
        ) as { opposingCounselStyle: string };
        researchFindings.opposingCounselStyle = parsed.opposingCounselStyle;
      } catch {
        return {
          error: `Failed to parse opposing counsel response: ${counselResponse.text.slice(0, 200)}`,
          status: 'failed',
        };
      }
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Research complete: ${caseStrategies.length} strategies, ${evasionTactics.length} evasion tactics${input.opposingCounselName ? ', counsel profile' : ''}`,
      { step: 'deposition_research_complete', progress: 70 },
    );

    return { researchFindings };
  };
}
