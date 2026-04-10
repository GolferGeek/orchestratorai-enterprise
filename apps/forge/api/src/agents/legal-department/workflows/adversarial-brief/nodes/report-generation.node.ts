/**
 * Report Generation Node — formats the final output for the attorney.
 *
 * Combines the stress-test report, debate transcript summary, and
 * (optional) fortified brief into a readable markdown report.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { AdversarialBriefState } from '../adversarial-brief.state';

export function createReportGenerationNode(
  observability: ObservabilityService,
) {
  return async function reportGenerationNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating final report',
      { step: 'report_generation', progress: 95 },
    );

    const report = state.stressTestReport;
    const sections: string[] = ['# Adversarial Brief Stress-Test Report', ''];

    if (report) {
      sections.push(
        '## Summary',
        `- **Overall Strength**: ${report.summary.overallStrength}/10`,
        `- **Debate Rounds**: ${report.summary.totalRounds}`,
        `- **Convergence**: ${report.summary.convergenceReason}`,
        `- **Critical Weaknesses**: ${report.summary.criticalWeaknesses}`,
        `- **Moderate Weaknesses**: ${report.summary.moderateWeaknesses}`,
        `- **Minor Weaknesses**: ${report.summary.minorWeaknesses}`,
        '',
      );

      if (report.attacks.length > 0) {
        sections.push('## Ranked Attacks', '');
        for (const attack of report.attacks) {
          sections.push(
            `### ${attack.id} — Severity ${attack.severity}/10 (${attack.category})`,
            `**Target**: ${attack.briefSection}`,
            `**Attack**: ${attack.description}`,
            `**Red Team Reasoning**: ${attack.redTeamReasoning}`,
            `**Blue Team Rebuttal**: ${attack.blueTeamRebuttal}`,
            `**Judge Assessment**: ${attack.judgeAssessment}`,
            `**Recommendation**: ${attack.recommendation}`,
            '',
          );
        }
      }

      if (report.weakCitations.length > 0) {
        sections.push('## Weak Citations', '');
        for (const cite of report.weakCitations) {
          sections.push(
            `- **${cite.originalCitation}**: ${cite.weakness}`,
            cite.suggestedReplacement
              ? `  - Suggested replacement: ${cite.suggestedReplacement}`
              : '  - No replacement available',
            '',
          );
        }
      }

      if (report.factualGaps.length > 0) {
        sections.push('## Factual Gaps', '');
        for (const gap of report.factualGaps) {
          sections.push(
            `- **${gap.assertion}**: ${gap.gap}`,
            `  - Suggested evidence: ${gap.suggestedEvidence}`,
            '',
          );
        }
      }
    }

    if (state.fortifiedBrief) {
      sections.push(
        '## Fortified Brief',
        '',
        'The following revised brief incorporates the accepted fortifications:',
        '',
        state.fortifiedBrief,
      );
    }

    const finalReport = sections.join('\n');

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Report generation complete',
      { step: 'report_complete', progress: 98 },
    );

    return { report: finalReport };
  };
}
