import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../shared/services/llm-maybe-reasoning.helper';

const AGENT_SLUG = 'legal-department';

/**
 * Synthesis Output Interface
 *
 * Combined analysis from multiple specialist agents (M11+)
 */
export interface SynthesisOutput {
  /** Executive summary combining all analyses */
  executiveSummary: string;
  /** Key findings from all specialists */
  keyFindings: Array<{
    specialist: string;
    finding: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  /** Overall risk assessment */
  overallRisk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    factors: string[];
  };
  /** Cross-specialist insights */
  crossInsights?: Array<{
    insight: string;
    relatedSpecialists: string[];
  }>;
  /** Recommended next steps */
  recommendations: string[];
  /** Confidence in synthesis */
  confidence: number;
}

/**
 * Synthesis Node - M11 Multi-Agent Coordination
 *
 * Purpose: Combine outputs from multiple specialist agents into unified analysis.
 *
 * This orchestration node:
 * 1. Receives outputs from all invoked specialists
 * 2. Calls LLM to synthesize a unified executive summary
 * 3. Identifies cross-specialist insights and patterns
 * 4. Generates overall risk assessment and recommendations
 *
 * M11 Architecture:
 * - ONE LLM CALL to synthesize all specialist outputs
 * - Focus on high-level summary and cross-cutting concerns
 * - Preserve individual specialist outputs for detailed review
 */
export function createSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function synthesisNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Synthesis: Combining multi-agent analysis',
      { step: 'synthesis', progress: 75 },
    );

    try {
      const specialistOutputs = state.specialistOutputs || {};
      const specialists = Object.keys(specialistOutputs);

      if (specialists.length === 0) {
        return {
          error: 'No specialist outputs available for synthesis',
          status: 'failed',
        };
      }

      // Build synthesis prompt
      const systemMessage = buildSynthesisPrompt();
      const userMessage = buildSynthesisUserMessage(specialistOutputs, state);

      // Emit pre-LLM event to keep SSE alive through Cloudflare
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Synthesis: Analyzing ${specialists.length} specialist outputs`,
        { step: 'synthesis_llm_call', progress: 77 },
      );

      // Single LLM call to synthesize all outputs — opt into reasoning capture
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:synthesis`,
        temperature: 0.4, // Slightly higher for creative synthesis
        maxTokens: 4000,
      });

      // Parse synthesis output
      let synthesis: SynthesisOutput;
      try {
        synthesis = parseSynthesis(response.text);
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Synthesis: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Synthesis: Analysis complete',
        { step: 'synthesis_complete', progress: 80 },
      );

      // Store synthesis in orchestration
      return {
        orchestration: {
          ...state.orchestration,
          synthesis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Synthesis failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Synthesis: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

/**
 * Build synthesis system prompt
 */
function buildSynthesisPrompt(): string {
  return `You are a Chief Legal Officer AI responsible for synthesizing multi-specialist legal analysis.

Your task is to:
1. Review outputs from multiple legal specialists (contract, compliance, IP, privacy, etc.)
2. Create an executive summary that highlights the most important findings
3. Identify patterns and insights that span multiple legal domains
4. Assess overall risk level and provide actionable recommendations

Focus on:
- Cross-cutting concerns (e.g., IP + privacy implications)
- Conflicting or reinforcing findings between specialists
- Business-critical risks that need immediate attention
- Strategic recommendations that address multiple legal areas
- When multiple documents are present: cross-document patterns, conflicts between documents, and how the documents interrelate

OUTPUT FORMAT (JSON only):
{
  "executiveSummary": "2-3 paragraph executive summary suitable for C-level review",
  "keyFindings": [
    {
      "specialist": "specialist-name",
      "finding": "key finding description",
      "severity": "low|medium|high|critical"
    }
  ],
  "overallRisk": {
    "level": "low|medium|high|critical",
    "description": "overall risk assessment",
    "factors": ["list of risk factors"]
  },
  "crossInsights": [
    {
      "insight": "cross-specialist insight",
      "relatedSpecialists": ["specialist1", "specialist2"]
    }
  ],
  "recommendations": [
    "prioritized list of actionable recommendations"
  ],
  "confidence": 0.0-1.0
}`;
}

/**
 * Build user message with all specialist outputs
 */
function buildSynthesisUserMessage(
  specialistOutputs: Record<string, unknown>,
  state: LegalDepartmentState,
): string {
  let message = `Synthesize the following legal specialist analyses:\n\n`;

  // Phase 3: document table — enumerate all analyzed documents.
  const docs = state.documents ?? [];
  if (docs.length === 1) {
    const doc = docs[0]!;
    message += `Document: ${doc.name}`;
    const meta = state.documentsMetadata?.[0];
    if (meta?.documentType?.type) {
      message += ` (${meta.documentType.type})`;
    }
    message += '\n';
  } else if (docs.length > 1) {
    message += `Documents analyzed (${docs.length}):\n`;
    docs.forEach((doc, i) => {
      const meta = state.documentsMetadata?.[i];
      const type = meta?.documentType?.type ?? 'unknown';
      const length = doc.content.length;
      message += `  ${i + 1}. ${doc.name} — type: ${type}, length: ${length} chars\n`;
    });
    message +=
      '\nCross-reference findings across all documents where relevant.\n';
  }
  message += `\n---\n\n`;

  // Add each specialist's output
  for (const [specialist, output] of Object.entries(specialistOutputs)) {
    message += `${specialist.toUpperCase()} SPECIALIST ANALYSIS:\n`;
    message += JSON.stringify(output, null, 2);
    message += `\n\n---\n\n`;
  }

  message += `Based on these analyses, provide an executive summary and strategic recommendations.`;

  return message;
}

/**
 * Parse synthesis response
 */
function parseSynthesis(responseText: string): SynthesisOutput {
  let jsonStr = responseText.trim();

  // Remove markdown code blocks
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    executiveSummary:
      (parsed.executiveSummary as string) || 'Synthesis completed',
    keyFindings: (parsed.keyFindings as SynthesisOutput['keyFindings']) || [],
    overallRisk: (parsed.overallRisk as SynthesisOutput['overallRisk']) || {
      level: 'medium',
      description: 'Risk assessment unavailable',
      factors: [],
    },
    crossInsights: parsed.crossInsights as SynthesisOutput['crossInsights'],
    recommendations: (parsed.recommendations as string[]) || [],
    confidence: (parsed.confidence as number) || 0.7,
  };
}

/**
 * Create fallback synthesis
 */
