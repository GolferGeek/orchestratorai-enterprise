import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulationState } from '../trial-simulation.state';
import type {
  SimulationResult,
  TrialVerdict,
  ClaimResult,
} from '../monte-carlo-trial-simulator.types';

export function createRecordVerdictNode(observability: ObservabilityService) {
  return async function recordVerdictNode(
    state: TrialSimulationState,
  ): Promise<Partial<TrialSimulationState>> {
    const ctx = state.executionContext;
    const { parameters, caseRecord } = state;

    let verdict: TrialVerdict = 'defense';
    let claimResults: ClaimResult[] = caseRecord.claims.map((c) => ({
      claimId: c.claimId,
      liable: false,
    }));
    let damagesAwarded: number | undefined;
    let keyFactors: string[] = [];
    let pivotalMoments: string[] = [];

    if (state.deliberationOutput) {
      try {
        const parsed = JSON.parse(state.deliberationOutput) as {
          verdict: TrialVerdict;
          claimResults: ClaimResult[];
          damagesAwarded?: number;
          keyFactors: string[];
          pivotalMoments: string[];
        };
        verdict = parsed.verdict ?? 'defense';
        claimResults = parsed.claimResults ?? claimResults;
        damagesAwarded = parsed.damagesAwarded;
        keyFactors = parsed.keyFactors ?? [];
        pivotalMoments = parsed.pivotalMoments ?? [];
      } catch {
        // deliberationOutput was set but unparseable — use defaults (defense wins, no damages)
      }
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Simulation ${parameters.simulationIndex} recorded: ${verdict}`,
      { step: 'record_verdict', progress: 98 },
    );

    const simulationResult: SimulationResult = {
      simulationId: parameters.simulationId,
      simulationIndex: parameters.simulationIndex,
      parameters,
      verdict,
      claimResults,
      damagesAwarded,
      keyFactors,
      pivotalMoments,
      transcript: {
        parameters,
        openingArguments: state.openingArguments ?? {
          plaintiff: '',
          defense: '',
        },
        evidencePhase: state.evidencePhaseResults,
        closingArguments: state.closingArguments ?? {
          plaintiff: '',
          defense: '',
        },
        juryDeliberation: state.deliberationOutput ?? '',
        verdict,
      },
      durationMs: Date.now() - state.startedAt,
    };

    return {
      simulationResult,
      status: 'completed',
    };
  };
}
