/**
 * Sentinel Ingest — Classify Signals Node.
 *
 * Uses LLM (local Ollama) to classify each new signal:
 * signal_type, jurisdictions, practice_areas.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { ClassifiedSignal, RawItem } from '../sentinel-ingest.types';
import type { SignalType } from '../../../sentinel/sentinel.types';

interface ClassificationResult {
  signalType: string;
  jurisdictions: string[];
  practiceAreas: string[];
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are a legal signal classifier. Given a legal news item, classify it.

Return a JSON object with these exact fields:
{
  "signalType": "enforcement" | "ruling" | "legislation" | "guidance" | "news",
  "jurisdictions": ["array of jurisdiction codes, e.g. us-federal, eu, uk, us-california"],
  "practiceAreas": ["array of practice areas, e.g. securities, data-privacy, employment, corporate, tax, environmental, antitrust, ip"]
}

Signal type definitions:
- enforcement: Regulatory enforcement actions, fines, penalties, sanctions
- ruling: Court decisions, judicial opinions, case law
- legislation: New laws, bills, statutory changes
- guidance: Regulatory guidance, advisories, compliance bulletins
- news: General legal news, commentary, analysis

Be concise. Use lowercase for all values.`;

const VALID_SIGNAL_TYPES = new Set<string>([
  'enforcement',
  'ruling',
  'legislation',
  'guidance',
  'news',
]);

export function createClassifySignalsNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function classifySignalsNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const newSignals = state.newSignals;

    if (newSignals.length === 0) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'No new signals to classify',
        { step: 'sentinel_classify_skip', progress: 50 },
      );
      return {
        classifiedSignals: [],
        status: 'storing',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Classifying ${newSignals.length} new signals via LLM`,
      {
        step: 'sentinel_classify_start',
        progress: 35,
        count: newSignals.length,
      },
    );

    const classifiedSignals: ClassifiedSignal[] = [];

    for (let i = 0; i < newSignals.length; i++) {
      const item = newSignals[i]!;
      const classified = await classifySingleSignal(llmClient, ctx, item);
      classifiedSignals.push(classified);

      if ((i + 1) % 5 === 0 || i === newSignals.length - 1) {
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Classified ${i + 1}/${newSignals.length} signals`,
          {
            step: 'sentinel_classify_progress',
            progress: 35 + Math.round(((i + 1) / newSignals.length) * 20),
          },
        );
      }
    }

    return {
      classifiedSignals,
      status: 'storing',
    };
  };
}

async function classifySingleSignal(
  llmClient: LLMHttpClientService,
  ctx: SentinelIngestState['executionContext'],
  item: RawItem,
): Promise<ClassifiedSignal> {
  const userMessage = `Classify this legal signal:

Title: ${item.title}
URL: ${item.url}
Summary: ${item.summary}
${item.fullText ? `Full Text (first 2000 chars): ${item.fullText.slice(0, 2000)}` : ''}`;

  try {
    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: CLASSIFICATION_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      callerName: 'sentinel-ingest:classify-signals',
    });

    const cleaned = stripMarkdownFences(response.text);
    const result = JSON.parse(cleaned) as Partial<ClassificationResult>;

    return {
      ...item,
      signalType: VALID_SIGNAL_TYPES.has(result.signalType ?? '')
        ? (result.signalType as SignalType)
        : 'news',
      jurisdictions: Array.isArray(result.jurisdictions)
        ? result.jurisdictions
        : [],
      practiceAreas: Array.isArray(result.practiceAreas)
        ? result.practiceAreas
        : [],
    };
  } catch {
    // Classification failure: store with defaults rather than losing the signal
    return {
      ...item,
      signalType: 'news',
      jurisdictions: [],
      practiceAreas: [],
    };
  }
}
