/**
 * Convergence Check Node — examines the Red Team's attacks and decides
 * whether to continue the debate or exit the loop.
 *
 * Exit conditions (any one triggers exit):
 * 1. No Red Team attack scored above severityThreshold
 * 2. currentRound >= maxRounds (hard cap)
 * 3. All Red Team attacks are repeats of previous rounds (diminishing returns)
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type {
  AdversarialBriefState,
  DebateRound,
} from '../adversarial-brief.state';

export function createConvergenceCheckNode(
  observability: ObservabilityService,
) {
  return async function convergenceCheckNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;
    const round = state.currentRound;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Checking convergence (Round ${round})`,
      { step: 'convergence', progress: 55 + round * 10, round },
    );

    const redTeamOutput = state.redTeamOutput;
    const blueTeamOutput = state.blueTeamOutput;

    // Store current round in history
    const currentDebateRound: DebateRound = {
      round,
      blueTeamArguments: blueTeamOutput ?? { defenses: [], summary: '' },
      redTeamAttacks: redTeamOutput ?? { attacks: [], summary: '' },
      judgeScoring: state.judgeOutput ?? undefined,
    };
    const updatedRounds = [...state.rounds, currentDebateRound];

    // Use judge scores if available, otherwise use Red Team self-reported severity
    const severityScores = state.judgeOutput
      ? state.judgeOutput.exchanges.map((e) => e.overallSeverity)
      : (redTeamOutput?.attacks.map((a) => a.severity) ?? []);

    const highestSeverity = Math.max(0, ...severityScores);

    // Exit condition 1: No high-severity attacks
    if (highestSeverity < state.severityThreshold) {
      const reason = `Converged: no attack above severity threshold (highest=${highestSeverity}, threshold=${state.severityThreshold})`;
      await emitConvergence(observability, ctx, round, reason);
      return {
        converged: true,
        convergenceReason: reason,
        rounds: updatedRounds,
      };
    }

    // Exit condition 2: Hard round cap
    if (round >= state.maxRounds) {
      const reason = `Hard round cap reached (${round}/${state.maxRounds})`;
      await emitConvergence(observability, ctx, round, reason);
      return {
        converged: true,
        convergenceReason: reason,
        rounds: updatedRounds,
      };
    }

    // Exit condition 3: Diminishing returns (all attacks are repeats)
    if (state.rounds.length > 0 && redTeamOutput) {
      const previousAttackTexts = new Set(
        state.rounds.flatMap((r) =>
          r.redTeamAttacks.attacks.map((a) => a.attack.toLowerCase().trim()),
        ),
      );
      const currentAttacks = redTeamOutput.attacks.map((a) =>
        a.attack.toLowerCase().trim(),
      );
      const allRepeats =
        currentAttacks.length > 0 &&
        currentAttacks.every((text) => previousAttackTexts.has(text));

      if (allRepeats) {
        const reason =
          'Converged: all Red Team attacks are repeats of previous rounds';
        await emitConvergence(observability, ctx, round, reason);
        return {
          converged: true,
          convergenceReason: reason,
          rounds: updatedRounds,
        };
      }
    }

    // Not converged — continue debating
    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Not converged: highest severity=${highestSeverity}, continuing to round ${round + 1}`,
      { step: 'convergence_continue', progress: 55 + round * 10, round },
    );

    return {
      converged: false,
      rounds: updatedRounds,
    };
  };
}

async function emitConvergence(
  observability: ObservabilityService,
  ctx: import('@orchestrator-ai/transport-types').ExecutionContext,
  round: number,
  reason: string,
) {
  await observability.emitProgress(ctx, ctx.conversationId, reason, {
    step: 'convergence_complete',
    progress: 60,
    round,
    reason,
  });
}
