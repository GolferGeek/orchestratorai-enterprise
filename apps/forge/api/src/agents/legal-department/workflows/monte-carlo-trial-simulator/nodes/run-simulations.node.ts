import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulatorState } from '../trial-simulator.state';
import type { TrialSimulationGraph } from '../trial-simulation.graph';
import type { SimulationResult } from '../monte-carlo-trial-simulator.types';

const CLOUD_BATCH_SIZE = 10;

export function createRunSimulationsNode(
  observability: ObservabilityService,
  innerGraph: TrialSimulationGraph,
) {
  return async function runSimulationsNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;
    const { parameterSets, caseRecord } = state;
    const total = parameterSets.length;

    async function runOne(index: number): Promise<SimulationResult> {
      const parameters = parameterSets[index];
      if (!parameters) {
        return {
          simulationId: `${caseRecord.matterId}-sim-${index}`,
          simulationIndex: index,
          parameters: {
            simulationId: `${caseRecord.matterId}-sim-${index}`,
            simulationIndex: index,
            juryComposition: {
              averageAge: 40,
              educationDistribution: {},
              occupationMix: [],
              attitudeBiases: {
                plaintiffSympathy: 0,
                corporateSkepticism: 0,
                expertDeference: 0,
              },
            },
            judgeCharacteristics: {
              strictnessOnEvidence: 0.5,
              sympathyBias: 0,
              patienceWithObjections: 0.5,
            },
            evidenceAdmissibility: {},
            witnessCredibilityModifiers: {},
          },
          verdict: 'defense',
          claimResults: [],
          keyFactors: [],
          pivotalMoments: [],
          transcript: {
            parameters: {
              simulationId: `${caseRecord.matterId}-sim-${index}`,
              simulationIndex: index,
              juryComposition: {
                averageAge: 40,
                educationDistribution: {},
                occupationMix: [],
                attitudeBiases: {
                  plaintiffSympathy: 0,
                  corporateSkepticism: 0,
                  expertDeference: 0,
                },
              },
              judgeCharacteristics: {
                strictnessOnEvidence: 0.5,
                sympathyBias: 0,
                patienceWithObjections: 0.5,
              },
              evidenceAdmissibility: {},
              witnessCredibilityModifiers: {},
            },
            openingArguments: { plaintiff: '', defense: '' },
            evidencePhase: [],
            closingArguments: { plaintiff: '', defense: '' },
            juryDeliberation: '',
            verdict: 'defense',
          },
          durationMs: 0,
          error: `Parameter set ${index} was undefined`,
        };
      }

      try {
        const rawResult = (await innerGraph.invoke(
          {
            executionContext: ctx,
            caseRecord,
            parameters,
            tokenUsage: { input: 0, output: 0 },
          },
          { configurable: { thread_id: `${ctx.conversationId}-sim-${index}` } },
        )) as {
          status: string;
          simulationResult?: SimulationResult;
          error?: string;
        };

        if (rawResult.status === 'failed' || rawResult.error) {
          return {
            simulationId: parameters.simulationId,
            simulationIndex: index,
            parameters,
            verdict: 'defense',
            claimResults: caseRecord.claims.map((c) => ({
              claimId: c.claimId,
              liable: false,
            })),
            keyFactors: [],
            pivotalMoments: [],
            transcript: {
              parameters,
              openingArguments: { plaintiff: '', defense: '' },
              evidencePhase: [],
              closingArguments: { plaintiff: '', defense: '' },
              juryDeliberation: '',
              verdict: 'defense',
            },
            durationMs: 0,
            error: rawResult.error ?? 'Simulation failed without error message',
          };
        }

        return (
          rawResult.simulationResult ?? {
            simulationId: parameters.simulationId,
            simulationIndex: index,
            parameters,
            verdict: 'defense',
            claimResults: [],
            keyFactors: [],
            pivotalMoments: [],
            transcript: {
              parameters,
              openingArguments: { plaintiff: '', defense: '' },
              evidencePhase: [],
              closingArguments: { plaintiff: '', defense: '' },
              juryDeliberation: '',
              verdict: 'defense',
            },
            durationMs: 0,
            error: 'Simulation completed but produced no result',
          }
        );
      } catch (err) {
        return {
          simulationId: parameters.simulationId,
          simulationIndex: index,
          parameters,
          verdict: 'defense',
          claimResults: caseRecord.claims.map((c) => ({
            claimId: c.claimId,
            liable: false,
          })),
          keyFactors: [],
          pivotalMoments: [],
          transcript: {
            parameters,
            openingArguments: { plaintiff: '', defense: '' },
            evidencePhase: [],
            closingArguments: { plaintiff: '', defense: '' },
            juryDeliberation: '',
            verdict: 'defense',
          },
          durationMs: 0,
          error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    function buildRunningStats(results: SimulationResult[]) {
      const successful = results.filter((r) => !r.error);
      const pWins = successful.filter((r) => r.verdict === 'plaintiff').length;
      const dWins = successful.filter((r) => r.verdict === 'defense').length;
      const pPct =
        successful.length > 0
          ? Math.round((pWins / successful.length) * 100)
          : 0;
      const dPct =
        successful.length > 0
          ? Math.round((dWins / successful.length) * 100)
          : 0;
      return { pPct, dPct };
    }

    const isOllama = ctx.provider === 'ollama' || !ctx.provider;
    const simulationResults: SimulationResult[] = [];

    if (isOllama) {
      for (let i = 0; i < total; i++) {
        const result = await runOne(i);
        simulationResults.push(result);

        const { pPct, dPct } = buildRunningStats(simulationResults);
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Simulation ${i + 1}/${total} complete — ${pPct}% plaintiff, ${dPct}% defense so far`,
          {
            step: 'simulation_running',
            progress: 10 + Math.floor(((i + 1) / total) * 75),
            partialResults: simulationResults,
          },
        );
      }
    } else {
      // Cloud path: batched parallel
      for (
        let batchStart = 0;
        batchStart < total;
        batchStart += CLOUD_BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + CLOUD_BATCH_SIZE, total);
        const batchIndices = Array.from(
          { length: batchEnd - batchStart },
          (_, k) => batchStart + k,
        );

        const batchResults = await Promise.allSettled(
          batchIndices.map((i) => runOne(i)),
        );

        for (const r of batchResults) {
          if (r.status === 'fulfilled') {
            simulationResults.push(r.value);
          } else {
            simulationResults.push({
              simulationId: `${caseRecord.matterId}-sim-unknown`,
              simulationIndex: -1,
              parameters: parameterSets[batchStart] ?? {
                simulationId: '',
                simulationIndex: -1,
                juryComposition: {
                  averageAge: 40,
                  educationDistribution: {},
                  occupationMix: [],
                  attitudeBiases: {
                    plaintiffSympathy: 0,
                    corporateSkepticism: 0,
                    expertDeference: 0,
                  },
                },
                judgeCharacteristics: {
                  strictnessOnEvidence: 0.5,
                  sympathyBias: 0,
                  patienceWithObjections: 0.5,
                },
                evidenceAdmissibility: {},
                witnessCredibilityModifiers: {},
              },
              verdict: 'defense',
              claimResults: [],
              keyFactors: [],
              pivotalMoments: [],
              transcript: {
                parameters: {
                  simulationId: '',
                  simulationIndex: -1,
                  juryComposition: {
                    averageAge: 40,
                    educationDistribution: {},
                    occupationMix: [],
                    attitudeBiases: {
                      plaintiffSympathy: 0,
                      corporateSkepticism: 0,
                      expertDeference: 0,
                    },
                  },
                  judgeCharacteristics: {
                    strictnessOnEvidence: 0.5,
                    sympathyBias: 0,
                    patienceWithObjections: 0.5,
                  },
                  evidenceAdmissibility: {},
                  witnessCredibilityModifiers: {},
                },
                openingArguments: { plaintiff: '', defense: '' },
                evidencePhase: [],
                closingArguments: { plaintiff: '', defense: '' },
                juryDeliberation: '',
                verdict: 'defense',
              },
              durationMs: 0,
              error: `Batch promise rejected: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
            });
          }
        }

        const { pPct, dPct } = buildRunningStats(simulationResults);
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Simulation ${simulationResults.length}/${total} complete — ${pPct}% plaintiff, ${dPct}% defense so far`,
          {
            step: 'simulation_running',
            progress: 10 + Math.floor((simulationResults.length / total) * 75),
            partialResults: simulationResults,
          },
        );
      }
    }

    return { simulationResults };
  };
}
