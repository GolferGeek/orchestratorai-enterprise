import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { TrialSimulationState } from '../trial-simulation.state';
import type { EvidencePhaseEntry } from '../monte-carlo-trial-simulator.types';

const EVIDENCE_PRESENTATION_SYSTEM_PROMPT = `You are simulating a trial evidence presentation phase. For a single piece of evidence being presented, generate the courtroom exchange.

You will be given:
- The evidence item (type, description, strength)
- Which side it supports
- The judge's strictness on evidence (0=lenient, 1=strict)
- A brief summary of recent evidence already presented

Generate what happens when this evidence is presented. Consider:
- Opposing counsel's objection (or lack thereof)
- The judge's ruling on admissibility given their strictness level
- The likely jury impact (how the jury perceives it)

Respond ONLY with valid JSON:
{
  "objection": "Objection text or 'No objection'",
  "ruling": "Judge's ruling — 'Admitted', 'Excluded', or 'Admitted with limitation: ...'",
  "juryImpact": "Description of how the jury likely perceives this evidence"
}`;

export function createEvidencePresentationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function evidencePresentationNode(
    state: TrialSimulationState,
  ): Promise<Partial<TrialSimulationState>> {
    const ctx = state.executionContext;
    const { caseRecord, parameters } = state;

    const admittedItems = caseRecord.evidence.filter(
      (e) => parameters.evidenceAdmissibility[e.evidenceId] !== false,
    );

    const results: EvidencePhaseEntry[] = [];
    let totalInputTokens = state.tokenUsage.input;
    let totalOutputTokens = state.tokenUsage.output;

    // Rolling context window: last 3 presented items
    const recentWindow: string[] = [];

    for (const [i, item] of admittedItems.entries()) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Simulation ${parameters.simulationIndex}: evidence ${i + 1}/${admittedItems.length} — ${item.evidenceId}`,
        {
          step: 'evidence_presentation',
          progress: 20 + Math.floor((i / admittedItems.length) * 35),
        },
      );

      const recentSummary =
        recentWindow.length > 0
          ? `Recently presented evidence:\n${recentWindow.join('\n')}`
          : 'No evidence presented yet.';

      const userMessage = `
Case: ${caseRecord.caseType} — ${caseRecord.jurisdiction}
Judge strictness on evidence: ${parameters.judgeCharacteristics.strictnessOnEvidence.toFixed(2)} (0=lenient, 1=strict)

${recentSummary}

CURRENT EVIDENCE ITEM:
ID: ${item.evidenceId}
Type: ${item.type}
Description: ${item.description}
Supports: ${item.supportsClaims.length > 0 ? `Claims: ${item.supportsClaims.join(', ')}` : ''} ${item.supportsDefenses.length > 0 ? `Defenses: ${item.supportsDefenses.join(', ')}` : ''}
Strength: ${item.strength}
Admissibility risk: ${item.admissibilityRisk}

Generate the courtroom exchange for this evidence item.`.trim();

      try {
        const response = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage: EVIDENCE_PRESENTATION_SYSTEM_PROMPT,
          userMessage,
          temperature: 0.7,
          maxTokens: 500,
          callerName: 'monte-carlo-trial-simulator:evidence-presentation',
        });

        totalInputTokens += response.usage?.promptTokens ?? 0;
        totalOutputTokens += response.usage?.completionTokens ?? 0;

        let parsed: { objection: string; ruling: string; juryImpact: string };
        try {
          parsed = JSON.parse(stripMarkdownFences(response.text)) as {
            objection: string;
            ruling: string;
            juryImpact: string;
          };
          if (!parsed.objection || !parsed.ruling || !parsed.juryImpact) {
            throw new Error('Missing required fields');
          }
        } catch {
          results.push({
            evidenceId: item.evidenceId,
            description: item.description,
            admitted: false,
            objection: '',
            ruling: '',
            juryImpact: '',
            error: `JSON parse failure: ${response.text.slice(0, 200)}`,
          });
          recentWindow.push(`[${item.evidenceId}]: parse error`);
          if (recentWindow.length > 3) recentWindow.shift();
          continue;
        }

        const admitted = !parsed.ruling.toLowerCase().startsWith('excluded');
        results.push({
          evidenceId: item.evidenceId,
          description: item.description,
          admitted,
          objection: parsed.objection,
          ruling: parsed.ruling,
          juryImpact: parsed.juryImpact,
        });

        recentWindow.push(
          `[${item.evidenceId}] ${admitted ? 'Admitted' : 'Excluded'}: ${parsed.juryImpact.slice(0, 80)}`,
        );
        if (recentWindow.length > 3) recentWindow.shift();
      } catch (err) {
        results.push({
          evidenceId: item.evidenceId,
          description: item.description,
          admitted: false,
          objection: '',
          ruling: '',
          juryImpact: '',
          error: `LLM call failure: ${err instanceof Error ? err.message : String(err)}`,
        });
        recentWindow.push(`[${item.evidenceId}]: call error`);
        if (recentWindow.length > 3) recentWindow.shift();
      }
    }

    return {
      evidencePhaseResults: results,
      tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
    };
  };
}
