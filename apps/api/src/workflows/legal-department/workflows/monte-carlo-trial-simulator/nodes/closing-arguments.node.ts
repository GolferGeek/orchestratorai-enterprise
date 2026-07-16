import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { TrialSimulationState } from '../trial-simulation.state';

const CLOSING_ARGUMENTS_SYSTEM_PROMPT = `You are simulating a trial. Generate closing arguments for BOTH plaintiff and defense counsel.

You will be given:
- The case type and claims to prove
- The defenses raised
- The evidence that was admitted or excluded during trial
- Witness credibility modifiers (>1.0 means jury found the witness credible, <1.0 means less credible)
- Jury attitude biases
- Judge sympathy bias

Generate realistic closing arguments. Each should:
- Be 2-4 paragraphs
- Reference specific admitted evidence (acknowledge excluded evidence cannot be referenced)
- Address witness credibility directly (favorable witnesses praised, unfavorable ones challenged)
- Speak directly to the jury's apparent attitudes and biases
- Be influenced by the judge's sympathy bias in tone

Respond ONLY with valid JSON:
{
  "plaintiff": "Closing argument text...",
  "defense": "Closing argument text..."
}`;

export function createClosingArgumentsNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function closingArgumentsNode(
    state: TrialSimulationState,
  ): Promise<Partial<TrialSimulationState>> {
    const ctx = state.executionContext;
    const { caseRecord, parameters, evidencePhaseResults } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Simulation ${parameters.simulationIndex}: drafting closing arguments`,
      { step: 'closing_arguments', progress: 65 },
    );

    const admittedEvidence = evidencePhaseResults
      .filter((e) => e.admitted && !e.error)
      .map(
        (e) =>
          `${e.evidenceId}: ${e.description} — jury impact: ${e.juryImpact}`,
      )
      .join('\n');

    const excludedEvidence = evidencePhaseResults
      .filter((e) => !e.admitted && !e.error)
      .map((e) => `${e.evidenceId}: ${e.description} (excluded: ${e.ruling})`)
      .join('\n');

    const witnessCredibility = caseRecord.witnesses
      .map((w) => {
        const modifier =
          parameters.witnessCredibilityModifiers[w.witnessId] ?? 1.0;
        const credLabel =
          modifier >= 1.15
            ? 'highly credible'
            : modifier <= 0.85
              ? 'low credibility'
              : 'moderate credibility';
        return `${w.name} (${w.side}, ${w.type}): modifier ${modifier.toFixed(2)} — ${credLabel}`;
      })
      .join('\n');

    const claimsSummary = caseRecord.claims
      .map(
        (c) =>
          `${c.claimId}: ${c.description} (standard: ${c.standardOfProof})`,
      )
      .join('\n');

    const userMessage = `
Case Type: ${caseRecord.caseType}
Jurisdiction: ${caseRecord.jurisdiction}

CLAIMS TO PROVE:
${claimsSummary}

DEFENSES RAISED:
${caseRecord.defenses.map((d) => `${d.defenseId}: ${d.description}`).join('\n')}

ADMITTED EVIDENCE:
${admittedEvidence || 'No evidence admitted.'}

EXCLUDED EVIDENCE (counsel cannot reference):
${excludedEvidence || 'None excluded.'}

WITNESS CREDIBILITY:
${witnessCredibility || 'No witnesses.'}

JURY COMPOSITION:
- Plaintiff sympathy bias: ${parameters.juryComposition.attitudeBiases.plaintiffSympathy.toFixed(2)} (-1=defense sympathetic, +1=plaintiff sympathetic)
- Corporate skepticism: ${parameters.juryComposition.attitudeBiases.corporateSkepticism.toFixed(2)}
- Expert deference: ${parameters.juryComposition.attitudeBiases.expertDeference.toFixed(2)}

JUDGE SYMPATHY BIAS: ${parameters.judgeCharacteristics.sympathyBias.toFixed(2)} (-1=defense, +1=plaintiff)

Generate closing arguments for both sides.`.trim();

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: CLOSING_ARGUMENTS_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.7,
      maxTokens: 1500,
      callerName: 'monte-carlo-trial-simulator:closing-arguments',
    });

    let closingArguments: { plaintiff: string; defense: string };
    try {
      closingArguments = JSON.parse(stripMarkdownFences(response.text)) as {
        plaintiff: string;
        defense: string;
      };
      if (!closingArguments.plaintiff || !closingArguments.defense) {
        throw new Error('Missing plaintiff or defense fields');
      }
    } catch {
      return {
        error: `JSON parse failure in closing-arguments: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    return {
      closingArguments,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
