import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulatorState } from '../trial-simulator.state';
import { generateSimulationParameters } from '../generate-parameters.util';

export function createGenerateParameterSpaceNode(
  observability: ObservabilityService,
) {
  return async function generateParameterSpaceNode(
    state: TrialSimulatorState,
  ): Promise<Partial<TrialSimulatorState>> {
    const ctx = state.executionContext;
    const { caseRecord } = state;
    const count = caseRecord.simulationCount;

    const parameterSets = Array.from({ length: count }, (_, i) =>
      generateSimulationParameters(caseRecord, i, count),
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Generated ${count} simulation parameter sets`,
      { step: 'parameter_generation', progress: 5 },
    );

    return { parameterSets };
  };
}
