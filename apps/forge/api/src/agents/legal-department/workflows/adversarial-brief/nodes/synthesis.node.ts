/**
 * Synthesis Node — produces the ranked StressTestReport from all debate rounds.
 *
 * Reads accumulated round data, uses an LLM to produce the final assessment
 * with ranked attacks, weak citations, factual gaps, and summary statistics.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  AdversarialBriefState,
  StressTestReport,
} from '../adversarial-brief.state';

const SYNTHESIS_SYSTEM_PROMPT = `You are a legal analysis synthesizer. Your task is to produce a ranked stress-test report from a multi-round adversarial debate.

You will receive the full debate transcript: Blue Team defenses, Red Team attacks, and Judge scores for each round.

Produce a ranked report with:

1. **attacks**: Ranked by severity (highest first). Each attack includes:
   - id: unique identifier
   - severity: 1-10 from judge scoring
   - category: "argument", "citation", or "factual"
   - description: what the attack is
   - briefSection: which part of the brief it targets
   - redTeamReasoning: why the Red Team made this attack
   - blueTeamRebuttal: how the Blue Team responded
   - judgeAssessment: the judge's assessment
   - recommendation: suggested fortification

2. **weakCitations**: Citations identified as weak. Each includes:
   - id: unique identifier
   - originalCitation: the citation text
   - weakness: what's wrong with it
   - suggestedReplacement: a better citation if known, or null

3. **factualGaps**: Factual assertions with insufficient support. Each includes:
   - id: unique identifier
   - assertion: the factual claim
   - gap: what's missing
   - suggestedEvidence: what evidence would fill the gap

4. **summary**: Overall statistics
   - totalRounds: number of debate rounds
   - convergenceReason: why the debate ended
   - overallStrength: 1-10 composite score of the brief
   - criticalWeaknesses: count of attacks with severity >= 8
   - moderateWeaknesses: count of attacks with severity 5-7
   - minorWeaknesses: count of attacks with severity < 5

Respond ONLY with valid JSON matching this schema.`;

export function createSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function synthesisNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Synthesizing stress-test report',
      { step: 'synthesis', progress: 75 },
    );

    const debateTranscript = state.rounds
      .map(
        (r) =>
          `### Round ${r.round}\n` +
          `Blue Team: ${JSON.stringify(r.blueTeamArguments.defenses)}\n` +
          `Red Team: ${JSON.stringify(r.redTeamAttacks.attacks)}\n` +
          `Judge: ${r.judgeScoring ? JSON.stringify(r.judgeScoring) : 'N/A'}`,
      )
      .join('\n\n');

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: SYNTHESIS_SYSTEM_PROMPT,
      userMessage: `Debate transcript (${state.rounds.length} rounds, convergence: ${state.convergenceReason}):\n\n${debateTranscript}`,
      temperature: 0.2,
      maxTokens: 6000,
      callerName: 'adversarial-brief:synthesis',
    });

    let stressTestReport: StressTestReport;
    try {
      stressTestReport = JSON.parse(stripMarkdownFences(response.text)) as StressTestReport;
    } catch {
      // Produce a minimal report from raw data
      stressTestReport = {
        attacks: [],
        weakCitations: [],
        factualGaps: [],
        summary: {
          totalRounds: state.rounds.length,
          convergenceReason: state.convergenceReason || 'Unknown',
          overallStrength: 5,
          criticalWeaknesses: 0,
          moderateWeaknesses: 0,
          minorWeaknesses: 0,
        },
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Synthesis complete: ${stressTestReport.attacks.length} attacks, ${stressTestReport.weakCitations.length} weak citations, ${stressTestReport.factualGaps.length} factual gaps`,
      { step: 'synthesis_complete', progress: 80 },
    );

    return {
      stressTestReport,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
