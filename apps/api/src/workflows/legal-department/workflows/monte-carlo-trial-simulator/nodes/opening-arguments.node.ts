import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { TrialSimulationState } from '../trial-simulation.state';

const OPENING_ARGUMENTS_SYSTEM_PROMPT = `You are simulating a trial. Generate opening statements for BOTH plaintiff and defense counsel.

You will be given:
- The case type and jurisdiction
- The claims being made (with elements to prove)
- The defenses raised
- The available evidence items (descriptions only)
- The witnesses
- The damages model
- Jury composition parameters (demographics and attitude biases)
- Judge characteristics (sympathy bias)

Generate realistic, concise opening statements for each side. Each statement should:
- Be 2-4 paragraphs
- Reference the specific claims/defenses
- Preview the key evidence
- Address the jury composition (e.g., if jury skews skeptical of corporations, plaintiff emphasizes individual harm)
- Be influenced by the judge's sympathy bias in tone

Respond ONLY with valid JSON:
{
  "plaintiff": "Opening statement text...",
  "defense": "Opening statement text..."
}`;

export function createOpeningArgumentsNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function openingArgumentsNode(
    state: TrialSimulationState,
  ): Promise<Partial<TrialSimulationState>> {
    const ctx = state.executionContext;
    const { caseRecord, parameters } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Simulation ${parameters.simulationIndex}: drafting opening arguments`,
      { step: 'opening_arguments', progress: 15 },
    );

    const claimsSummary = caseRecord.claims
      .map(
        (c) =>
          `${c.claimId}: ${c.description} (elements: ${c.elements.join('; ')})`,
      )
      .join('\n');
    const defensesSummary = caseRecord.defenses
      .map((d) => `${d.defenseId}: ${d.description} (${d.type})`)
      .join('\n');
    const evidenceSummary = caseRecord.evidence
      .map(
        (e) =>
          `${e.evidenceId} [${e.type}]: ${e.description} — strength: ${e.strength}, admissibility risk: ${e.admissibilityRisk}`,
      )
      .join('\n');
    const witnessSummary = caseRecord.witnesses
      .map((w) => `${w.name} (${w.type}, ${w.side}): ${w.keyTestimony}`)
      .join('\n');

    const userMessage = `
Case Type: ${caseRecord.caseType}
Jurisdiction: ${caseRecord.jurisdiction}
Court Level: ${caseRecord.courtLevel}

CLAIMS:
${claimsSummary}

DEFENSES:
${defensesSummary}

EVIDENCE:
${evidenceSummary}

WITNESSES:
${witnessSummary}

DAMAGES MODEL:
${caseRecord.damagesModel.map((d) => `${d.type}: $${d.rangeMin.toLocaleString()}–$${d.rangeMax.toLocaleString()} (${d.calculation})`).join('\n')}

JURY COMPOSITION (this simulation):
- Average age: ${parameters.juryComposition.averageAge}
- Plaintiff sympathy bias: ${parameters.juryComposition.attitudeBiases.plaintiffSympathy.toFixed(2)} (-1=defense sympathetic, +1=plaintiff sympathetic)
- Corporate skepticism: ${parameters.juryComposition.attitudeBiases.corporateSkepticism.toFixed(2)}
- Expert deference: ${parameters.juryComposition.attitudeBiases.expertDeference.toFixed(2)}

JUDGE CHARACTERISTICS (this simulation):
- Sympathy bias: ${parameters.judgeCharacteristics.sympathyBias.toFixed(2)} (-1=defense, +1=plaintiff)

Generate opening statements for both sides.`.trim();

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: OPENING_ARGUMENTS_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.7,
      maxTokens: 1500,
      callerName: 'monte-carlo-trial-simulator:opening-arguments',
    });

    let openingArguments: { plaintiff: string; defense: string };
    try {
      openingArguments = JSON.parse(stripMarkdownFences(response.text)) as {
        plaintiff: string;
        defense: string;
      };
      if (!openingArguments.plaintiff || !openingArguments.defense) {
        throw new Error('Missing plaintiff or defense fields');
      }
    } catch {
      return {
        error: `JSON parse failure in opening-arguments: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    return {
      openingArguments,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
