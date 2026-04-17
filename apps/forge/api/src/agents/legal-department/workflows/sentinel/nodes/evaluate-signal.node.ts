/**
 * Sentinel Evaluate — Evaluate Signal Node.
 *
 * The core cross-reference engine. For the current signal:
 *
 * 1. Pop next signal from unprocessedSignals queue
 * 2. Query sentinel-portfolio-{orgSlug} RAG collection with signal text
 * 3. For each RAG match, call LLM to score relevance, severity, urgency
 * 4. Write alerts to state for signals that match (relevance > 30)
 * 5. Mark signal as processed
 *
 * Uses callLLMMaybeWithReasoning() for evaluation (captures specialist reasoning).
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { SentinelRepository } from '../../../sentinel/sentinel.repository';
import type { SentinelEvaluateState } from '../sentinel-evaluate.state';
import type {
  CreateAlertDto,
  AlertSeverity,
  AlertUrgency,
} from '../../../sentinel/sentinel.types';

const RELEVANCE_THRESHOLD = 30;

interface EvaluationResult {
  relevanceScore: number;
  severity: AlertSeverity;
  urgency: AlertUrgency;
  summary: string;
  reasoning: string;
  recommendedAction: string;
  holdingId: string;
}

export function createEvaluateSignalNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  repository: SentinelRepository,
  workflowRag?: WorkflowRagService,
) {
  return async function evaluateSignalNode(
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
    const ctx = state.executionContext;
    const orgSlug = ctx.orgSlug;
    const queue = [...state.unprocessedSignals];
    const signal = queue.shift();

    if (!signal) {
      return { unprocessedSignals: queue };
    }

    try {
      // Build the query text from signal content
      const queryText = [
        signal.title,
        signal.summary,
        signal.full_text?.slice(0, 2000),
      ]
        .filter(Boolean)
        .join('\n\n');

      // Query portfolio RAG collection
      let ragContext = '';
      if (workflowRag) {
        const collectionSlug = `sentinel-portfolio-${orgSlug}`;
        ragContext = await workflowRag.getContext({
          collectionSlug,
          orgSlug,
          query: queryText,
          topK: 10,
        });
      }

      // If no RAG context, mark processed and skip
      if (!ragContext) {
        await repository.markSignalsProcessed([signal.id]);

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Signal "${signal.title.slice(0, 50)}" — no portfolio matches`,
          { step: 'sentinel_eval_no_match', signalId: signal.id },
        );

        return {
          unprocessedSignals: queue,
          currentSignal: undefined,
        };
      }

      // Call LLM to evaluate relevance
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: EVALUATION_SYSTEM_PROMPT,
        userMessage: buildEvaluationPrompt(signal, ragContext),
        temperature: 0.1,
        callerName: 'sentinel-evaluate:evaluate-signal',
      });

      const evaluations = parseEvaluationResponse(response.text);

      // Build alert DTOs for matches above threshold
      const newAlerts: CreateAlertDto[] = evaluations
        .filter((e) => e.relevanceScore >= RELEVANCE_THRESHOLD)
        .map((e) => ({
          signalId: signal.id,
          portfolioId: e.holdingId,
          relevanceScore: e.relevanceScore,
          severity: e.severity,
          urgency: e.urgency,
          summary: e.summary,
          reasoning: e.reasoning,
          recommendedAction: e.recommendedAction,
        }));

      // Write alerts to DB
      if (newAlerts.length > 0) {
        await repository.createAlertsBatch(orgSlug, newAlerts);
      }

      // Mark signal as processed
      await repository.markSignalsProcessed([signal.id]);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Signal "${signal.title.slice(0, 50)}" — ${newAlerts.length} alert(s) generated`,
        {
          step: 'sentinel_eval_signal_done',
          signalId: signal.id,
          alertCount: newAlerts.length,
        },
      );

      return {
        unprocessedSignals: queue,
        currentSignal: undefined,
        alerts: newAlerts,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Evaluation failed for "${signal.title.slice(0, 50)}": ${msg}`,
        { step: 'sentinel_eval_signal_error', error: msg, signalId: signal.id },
      );

      // Mark the signal as processed even on error to avoid infinite reprocessing
      await repository.markSignalsProcessed([signal.id]);

      return {
        unprocessedSignals: queue,
        currentSignal: undefined,
      };
    }
  };
}

// ── Prompt Builders ─────────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are a legal compliance analyst evaluating regulatory signals against a law firm's client portfolio.

Your task is to assess whether a regulatory signal is relevant to any client portfolio holdings and generate structured alerts.

Return a JSON array of evaluations. Each evaluation is for a distinct portfolio holding matched by the RAG context. Return an empty array if no holdings are relevant.

Each element must have these exact fields:
{
  "holdingId": "the portfolio holding ID from the context",
  "relevanceScore": 0-100,
  "severity": "critical" | "high" | "medium" | "low",
  "urgency": "immediate" | "this_week" | "informational",
  "summary": "one-sentence summary of why this signal matters for this client",
  "reasoning": "detailed reasoning for the relevance assessment",
  "recommendedAction": "specific action the legal team should take"
}

Scoring guidelines:
- 80-100: Direct impact — signal names the client, their industry sector, or their specific jurisdiction and practice area
- 50-79: Strong relevance — signal covers the same legal domain and could materially affect the client
- 30-49: Moderate relevance — signal is in a related area; the client should be aware
- 0-29: Low relevance — tangential connection only

Severity guidelines:
- critical: Immediate regulatory action, enforcement against similar entities, new criminal liability
- high: Significant regulatory change, major ruling affecting client's practice area
- medium: Notable development, new guidance worth monitoring
- low: Informational, general industry trend

Urgency guidelines:
- immediate: Requires action within 24-48 hours (enforcement deadlines, emergency orders)
- this_week: Should be reviewed within the week (new regulations, significant rulings)
- informational: No time pressure, for awareness (guidance, trends, commentary)`;

function buildEvaluationPrompt(
  signal: {
    title: string;
    summary: string | null;
    full_text: string | null;
    signal_type: string | null;
    jurisdictions: string[];
    practice_areas: string[];
  },
  ragContext: string,
): string {
  return `Evaluate this regulatory signal against the portfolio holdings found via RAG.

**Signal:**
- Title: ${signal.title}
- Type: ${signal.signal_type ?? 'unknown'}
- Jurisdictions: ${signal.jurisdictions.join(', ') || 'unspecified'}
- Practice Areas: ${signal.practice_areas.join(', ') || 'unspecified'}
${signal.summary ? `- Summary: ${signal.summary}` : ''}
${signal.full_text ? `- Full Text (truncated): ${signal.full_text.slice(0, 3000)}` : ''}

**Portfolio Holdings (from RAG):**
${ragContext}

Assess which holdings are affected by this signal. Return a JSON array of evaluations, one per affected holding. If no holdings are meaningfully affected, return an empty array \`[]\`.`;
}

// ── Response Parser ─────────────────────────────────────────────────

function parseEvaluationResponse(responseText: string): EvaluationResult[] {
  try {
    const cleaned = stripMarkdownFences(responseText);
    const parsed = JSON.parse(cleaned) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object',
      )
      .map((item) => ({
        holdingId: typeof item.holdingId === 'string' ? item.holdingId : '',
        relevanceScore:
          typeof item.relevanceScore === 'number' ? item.relevanceScore : 0,
        severity: validateSeverity(item.severity) ? item.severity : 'medium',
        urgency: validateUrgency(item.urgency) ? item.urgency : 'informational',
        summary: typeof item.summary === 'string' ? item.summary : '',
        reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
        recommendedAction:
          typeof item.recommendedAction === 'string'
            ? item.recommendedAction
            : '',
      }))
      .filter((e) => e.holdingId);
  } catch {
    return [];
  }
}

function validateSeverity(s: unknown): s is AlertSeverity {
  return (
    typeof s === 'string' && ['critical', 'high', 'medium', 'low'].includes(s)
  );
}

function validateUrgency(s: unknown): s is AlertUrgency {
  return (
    typeof s === 'string' &&
    ['immediate', 'this_week', 'informational'].includes(s)
  );
}
