/**
 * Regulatory Compliance Audit — Compute Scorecard Node.
 *
 * After all evaluations complete (before HITL gate), computes the
 * ComplianceScorecard from the accumulated findings.
 *
 * Scoring formula per theme:
 *   score = (compliant + 0.5 * partiallyCompliant) / totalQuestions * 100
 *
 * Overall score = weighted average across all themes.
 *
 * For Compliance Scan: scorecard only includes discovered themes.
 * For Full Audit: scorecard includes all themes from the config.
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4 Phase 3
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type {
  ComplianceFinding,
  ComplianceScorecard,
  FrameworkScore,
  ThemeScore,
} from '../compliance-audit.types';

/** Framework name mapping for display. */
const FRAMEWORK_NAMES: Record<string, string> = {
  gdpr: 'GDPR',
  hipaa: 'HIPAA',
  sox: 'SOX',
};

export function createComputeScorecardNode(
  observability: ObservabilityService,
) {
  return async function computeScorecardNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Computing compliance scorecard from ${state.findings.length} findings`,
      { step: 'ca_compute_scorecard', progress: 76 },
    );

    const scorecard = computeScorecard(
      state.findings,
      state.auditContext.frameworkSlugs,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Scorecard computed: overall score ${scorecard.overallScore.toFixed(1)}%`,
      {
        step: 'ca_scorecard_complete',
        progress: 78,
        overallScore: scorecard.overallScore,
      },
    );

    return {
      scorecard,
      status: 'awaiting_review',
    };
  };
}

/**
 * Compute a ComplianceScorecard from an array of findings.
 * Exported for unit testing.
 */
export function computeScorecard(
  findings: ComplianceFinding[],
  frameworkSlugs: string[],
): ComplianceScorecard {
  // Group findings by framework → theme
  const frameworkMap = new Map<string, Map<string, ComplianceFinding[]>>();

  for (const finding of findings) {
    const fw = finding.frameworkSlug;
    if (!frameworkMap.has(fw)) {
      frameworkMap.set(fw, new Map());
    }
    const themeMap = frameworkMap.get(fw)!;

    // Use themeId if available (Full Audit), otherwise use 'discovered' bucket
    const themeKey = finding.themeId ?? 'discovered';
    if (!themeMap.has(themeKey)) {
      themeMap.set(themeKey, []);
    }
    themeMap.get(themeKey)!.push(finding);
  }

  // Compute scores per framework
  const perFramework: FrameworkScore[] = [];

  for (const fwSlug of frameworkSlugs) {
    const themeMap = frameworkMap.get(fwSlug);
    if (!themeMap || themeMap.size === 0) {
      perFramework.push({
        frameworkSlug: fwSlug,
        frameworkName: FRAMEWORK_NAMES[fwSlug] ?? fwSlug.toUpperCase(),
        score: 0,
        themeScores: [],
      });
      continue;
    }

    const themeScores: ThemeScore[] = [];

    for (const [themeId, themeFindings] of themeMap) {
      const score = computeThemeScore(themeId, themeFindings, fwSlug);
      themeScores.push(score);
    }

    // Framework score = weighted average of theme scores (weighted by question count)
    const totalQuestions = themeScores.reduce(
      (sum, t) => sum + t.totalQuestions,
      0,
    );
    const weightedSum = themeScores.reduce(
      (sum, t) => sum + t.score * t.totalQuestions,
      0,
    );
    const frameworkScore =
      totalQuestions > 0 ? weightedSum / totalQuestions : 0;

    perFramework.push({
      frameworkSlug: fwSlug,
      frameworkName: FRAMEWORK_NAMES[fwSlug] ?? fwSlug.toUpperCase(),
      score: Math.round(frameworkScore * 10) / 10,
      themeScores,
    });
  }

  // Overall score = weighted average across all frameworks
  const totalAllQuestions = perFramework.reduce(
    (sum, fw) => sum + fw.themeScores.reduce((s, t) => s + t.totalQuestions, 0),
    0,
  );
  const weightedAllSum = perFramework.reduce(
    (sum, fw) =>
      sum + fw.themeScores.reduce((s, t) => s + t.score * t.totalQuestions, 0),
    0,
  );
  const overallScore =
    totalAllQuestions > 0 ? weightedAllSum / totalAllQuestions : 0;

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    perFramework,
  };
}

function computeThemeScore(
  themeId: string,
  findings: ComplianceFinding[],
  frameworkSlug: string,
): ThemeScore {
  let compliant = 0;
  let partiallyCompliant = 0;
  let nonCompliant = 0;
  let notAddressed = 0;

  for (const f of findings) {
    switch (f.status) {
      case 'compliant':
        compliant++;
        break;
      case 'partially-compliant':
        partiallyCompliant++;
        break;
      case 'non-compliant':
        nonCompliant++;
        break;
      case 'not-addressed':
        notAddressed++;
        break;
      // 'unable-to-evaluate' is not counted in scoring
    }
  }

  const totalQuestions =
    compliant + partiallyCompliant + nonCompliant + notAddressed;
  const score =
    totalQuestions > 0
      ? ((compliant + 0.5 * partiallyCompliant) / totalQuestions) * 100
      : 0;

  return {
    themeId,
    themeName: findings[0]?.themeName ?? themeId,
    frameworkSlug,
    totalQuestions,
    compliant,
    partiallyCompliant,
    nonCompliant,
    notAddressed,
    score: Math.round(score * 10) / 10,
  };
}
