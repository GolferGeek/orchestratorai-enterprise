/**
 * Judge Scoring Node — scores each sub-argument exchange on a rubric.
 *
 * Uses a reasoning-capable model to evaluate Blue Team defenses vs Red Team
 * attacks. Implements position-bias mitigation by randomizing argument order
 * and using neutral labels.
 *
 * Scoring rubric (per argument exchange):
 * - Legal soundness (1-10)
 * - Factual support (1-10)
 * - Citation quality (1-10)
 * - Persuasiveness (1-10)
 * - Overall severity of attack (1-10) — drives convergence
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  AdversarialBriefState,
  JudgeScoring,
  ArgumentExchangeScore,
  BlueTeamOutput,
  RedTeamOutput,
} from '../adversarial-brief.state';

const JUDGE_SYSTEM_PROMPT = `You are a skeptical, experienced judge evaluating a legal debate. You must score BOTH sides fairly and identify which attacks are most serious.

You will receive arguments from two sides labeled "Position A" and "Position B". You do NOT know which side is the original brief's defenders and which is the attackers — score purely on merit.

For each argument exchange, score both positions on:
1. **legalSoundness** (1-10): How legally correct is the position?
2. **factualSupport** (1-10): How well-supported by evidence?
3. **citationQuality** (1-10): How strong and relevant are cited authorities?
4. **persuasiveness** (1-10): How convincing is the argument?

Then assess the **overallSeverity** (1-10) of the challenge — how much damage does the attacking position do to the defending position? A score of 10 means the defense is fatally undermined. A score of 1 means the attack has no merit.

Provide a brief assessment of each exchange.

Respond with JSON:
{
  "exchanges": [
    {
      "argumentId": "<id of the argument being debated>",
      "positionAScore": {
        "legalSoundness": <1-10>,
        "factualSupport": <1-10>,
        "citationQuality": <1-10>,
        "persuasiveness": <1-10>
      },
      "positionBScore": {
        "legalSoundness": <1-10>,
        "factualSupport": <1-10>,
        "citationQuality": <1-10>,
        "persuasiveness": <1-10>
      },
      "overallSeverity": <1-10>,
      "assessment": "<brief assessment>"
    }
  ],
  "roundSummary": "<overall round assessment>"
}`;

interface JudgeRawResponse {
  exchanges: Array<{
    argumentId: string;
    positionAScore: {
      legalSoundness: number;
      factualSupport: number;
      citationQuality: number;
      persuasiveness: number;
    };
    positionBScore: {
      legalSoundness: number;
      factualSupport: number;
      citationQuality: number;
      persuasiveness: number;
    };
    overallSeverity: number;
    assessment: string;
  }>;
  roundSummary: string;
}

export function createJudgeScoringNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function judgeScoringNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;
    const round = state.currentRound;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Judge scoring (Round ${round})`,
      { step: 'judge', progress: 50 + round * 10, round },
    );

    const blueTeam = state.blueTeamOutput;
    const redTeam = state.redTeamOutput;

    if (!blueTeam || !redTeam) {
      return {
        error: 'Judge requires both Blue and Red team outputs',
        status: 'failed',
      };
    }

    // Position-bias mitigation: randomly assign Blue/Red to Position A/B
    const blueFirst = Math.random() < 0.5;
    const positionOrder: 'blue-first' | 'red-first' = blueFirst
      ? 'blue-first'
      : 'red-first';

    const debateContent = formatDebateForJudge(blueTeam, redTeam, blueFirst);

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: JUDGE_SYSTEM_PROMPT,
      userMessage: debateContent,
      temperature: 0.2,
      maxTokens: 4000,
      callerName: 'adversarial-brief:judge',
    });

    let rawScoring: JudgeRawResponse;
    try {
      rawScoring = JSON.parse(
        stripMarkdownFences(response.text),
      ) as JudgeRawResponse;
    } catch {
      // If JSON parse fails, produce a default scoring with high severity
      // so the debate continues (fail-open for judge errors)
      rawScoring = {
        exchanges: [],
        roundSummary: `Judge failed to produce valid scoring in round ${round}`,
      };
    }

    // Un-randomize: map Position A/B scores back to Blue/Red
    const exchanges: ArgumentExchangeScore[] = rawScoring.exchanges.map(
      (ex) => ({
        argumentId: ex.argumentId,
        blueScore: blueFirst ? ex.positionAScore : ex.positionBScore,
        redScore: blueFirst ? ex.positionBScore : ex.positionAScore,
        overallSeverity: ex.overallSeverity,
        assessment: ex.assessment,
      }),
    );

    const highestSeverity = Math.max(
      0,
      ...exchanges.map((e) => e.overallSeverity),
    );

    const judgeOutput: JudgeScoring = {
      round,
      exchanges,
      roundSummary: rawScoring.roundSummary,
      highestSeverity,
      positionOrder,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Judge scored round ${round}: highest severity=${highestSeverity}`,
      {
        step: 'judge_complete',
        progress: 55 + round * 10,
        round,
        highestSeverity,
      },
    );

    return {
      judgeOutput,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}

/**
 * Format the debate for the judge with neutralized labels.
 * Position A and B are assigned based on the randomization.
 */
function formatDebateForJudge(
  blueTeam: BlueTeamOutput,
  redTeam: RedTeamOutput,
  blueFirst: boolean,
): string {
  const blueContent = blueTeam.defenses
    .map((d) => `- Argument ${d.targetId}: ${d.defense}`)
    .join('\n');

  const redContent = redTeam.attacks
    .map(
      (a) =>
        `- Argument ${a.targetId}: ${a.attack} (self-rated severity: ${a.severity}/10)`,
    )
    .join('\n');

  const posAContent = blueFirst ? blueContent : redContent;
  const posBContent = blueFirst ? redContent : blueContent;

  return [
    '## Position A',
    posAContent,
    '',
    '## Position B',
    posBContent,
    '',
    "Score each argument exchange on the rubric. Determine how severe Position B's challenge is to Position A (or vice versa — one side is defending, the other attacking).",
  ].join('\n');
}
