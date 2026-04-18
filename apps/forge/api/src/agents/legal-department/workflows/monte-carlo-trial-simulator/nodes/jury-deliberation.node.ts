import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { TrialSimulationState } from '../trial-simulation.state';
import type {
  TrialVerdict,
  ClaimResult,
} from '../monte-carlo-trial-simulator.types';

const JURY_DELIBERATION_SYSTEM_PROMPT = `You are simulating jury deliberations for a civil trial. You must render a verdict as the collective jury.

Your jury persona is defined by the provided composition parameters. Make your verdict reflect the jury's biases, attitudes, and what they heard during trial.

Evaluate each claim using the standard of proof provided. Consider:
- Only admitted evidence (excluded evidence cannot factor into your deliberation)
- Witness credibility (credibility modifiers indicate how persuasive each witness was)
- Jury attitude biases (plaintiff sympathy, corporate skepticism, expert deference)
- The quality and framing of opening and closing arguments

For a mixed verdict: some claims liable, some not; damages may be reduced.

Respond ONLY with valid JSON:
{
  "verdict": "plaintiff" | "defense" | "mixed",
  "claimResults": [
    { "claimId": "claim-1", "liable": true },
    { "claimId": "claim-2", "liable": false }
  ],
  "damagesAwarded": 1500000,
  "keyFactors": ["Factor that most influenced the verdict", "Second factor"],
  "pivotalMoments": ["The moment that turned the jury", "Another pivotal moment"],
  "deliberationNarrative": "Brief description of the jury's reasoning process"
}

Notes:
- "verdict" = "plaintiff" if ANY claim is liable, "defense" if NONE are liable, "mixed" if partial claims found
- "damagesAwarded" only present when verdict is "plaintiff" or "mixed"; omit or set to 0 for defense
- "keyFactors": 2-4 strings describing what most influenced the verdict
- "pivotalMoments": 1-3 strings describing turning-point moments in the trial`;

export function createJuryDeliberationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function juryDeliberationNode(
    state: TrialSimulationState,
  ): Promise<Partial<TrialSimulationState>> {
    const ctx = state.executionContext;
    const {
      caseRecord,
      parameters,
      evidencePhaseResults,
      openingArguments,
      closingArguments,
    } = state;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Simulation ${parameters.simulationIndex}: jury deliberating`,
      { step: 'jury_deliberation', progress: 75 },
    );

    const juryPersona = `
JURY COMPOSITION:
- Average age: ${parameters.juryComposition.averageAge}
- Education distribution: ${JSON.stringify(parameters.juryComposition.educationDistribution)}
- Occupation mix: ${parameters.juryComposition.occupationMix.join(', ') || 'mixed'}
- Plaintiff sympathy: ${parameters.juryComposition.attitudeBiases.plaintiffSympathy.toFixed(2)} (-1=strongly defense-leaning, +1=strongly plaintiff-leaning)
- Corporate skepticism: ${parameters.juryComposition.attitudeBiases.corporateSkepticism.toFixed(2)}
- Expert deference: ${parameters.juryComposition.attitudeBiases.expertDeference.toFixed(2)}`.trim();

    const admittedEvidence = evidencePhaseResults
      .filter((e) => e.admitted && !e.error)
      .map(
        (e) =>
          `- ${e.evidenceId}: ${e.description}\n  Jury impact: ${e.juryImpact}`,
      )
      .join('\n');

    const witnessCredibility = caseRecord.witnesses
      .map((w) => {
        const modifier =
          parameters.witnessCredibilityModifiers[w.witnessId] ?? 1.0;
        return `- ${w.name} (${w.side}): credibility modifier ${modifier.toFixed(2)} — testimony: ${w.keyTestimony}`;
      })
      .join('\n');

    const claimsList = caseRecord.claims
      .map(
        (c) =>
          `- ${c.claimId}: ${c.description} (standard: ${c.standardOfProof})`,
      )
      .join('\n');

    const userMessage = `
Case Type: ${caseRecord.caseType}
Jurisdiction: ${caseRecord.jurisdiction}
Court Level: ${caseRecord.courtLevel}

${juryPersona}

CLAIMS TO DECIDE:
${claimsList}

ADMITTED EVIDENCE:
${admittedEvidence || 'No evidence was admitted.'}

WITNESS CREDIBILITY (from trial):
${witnessCredibility || 'No witnesses testified.'}

OPENING STATEMENT SUMMARIES:
Plaintiff: ${(openingArguments?.plaintiff ?? '').slice(0, 200)}...
Defense: ${(openingArguments?.defense ?? '').slice(0, 200)}...

CLOSING ARGUMENT SUMMARIES:
Plaintiff: ${(closingArguments?.plaintiff ?? '').slice(0, 200)}...
Defense: ${(closingArguments?.defense ?? '').slice(0, 200)}...

Deliberate and render your verdict.`.trim();

    // Use gemma4:26b for heavier deliberation reasoning
    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: { ...ctx, model: 'gemma4:26b' },
      systemMessage: JURY_DELIBERATION_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.6,
      maxTokens: 1200,
      callerName: 'monte-carlo-trial-simulator:jury-deliberation',
    });

    let parsed: {
      verdict: TrialVerdict;
      claimResults: ClaimResult[];
      damagesAwarded?: number;
      keyFactors: string[];
      pivotalMoments: string[];
      deliberationNarrative: string;
    };

    try {
      parsed = JSON.parse(stripMarkdownFences(response.text)) as typeof parsed;
      if (
        !parsed.verdict ||
        !Array.isArray(parsed.claimResults) ||
        !Array.isArray(parsed.keyFactors)
      ) {
        throw new Error('Missing required verdict fields');
      }
    } catch {
      return {
        error: `JSON parse failure in jury-deliberation: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Simulation ${parameters.simulationIndex}: jury deliberation complete — verdict: ${parsed.verdict}`,
      { step: 'jury_deliberation', progress: 90 },
    );

    const deliberationOutput = JSON.stringify({
      verdict: parsed.verdict,
      claimResults: parsed.claimResults,
      damagesAwarded: parsed.damagesAwarded,
      keyFactors: parsed.keyFactors,
      pivotalMoments: parsed.pivotalMoments,
      deliberationNarrative: parsed.deliberationNarrative,
    });

    return {
      deliberationOutput,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
