/**
 * Compliance Audit — Report Generation Node.
 *
 * Assembles a structured markdown compliance report from findings,
 * scorecard, and remediation data. Uses LLM to generate the executive
 * summary; remaining sections are assembled deterministically from state.
 *
 * Report sections:
 * 1. Executive summary (LLM-generated)
 * 2. Compliance scorecard
 * 3. Gap analysis — per-finding detail with citations
 * 4. Remediation recommendations — prioritized by severity × effort
 * 5. Policy-to-requirement mapping
 * 6. Appendix: per-finding evidence (specialist reasoning)
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1 (report_generation)
 */
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type {
  ComplianceFinding,
  ComplianceScorecard,
  RemediationItem,
  Severity,
} from '../compliance-audit.types';

const COMPLIANCE_DISCLAIMER =
  '> **Disclaimer:** This is an AI-assisted analysis and does not constitute a legal opinion. All findings, scores, and recommendations should be reviewed by qualified legal counsel before reliance.';

export function createReportGenerationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function reportGenerationNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating compliance audit report',
      { step: 'ca_report_generation', progress: 87 },
    );

    try {
      // Build remediation plan from findings (sorted by priority)
      const remediationPlan = buildRemediationPlan(state.findings);

      // Assemble the static sections of the report
      const report = assembleReport(state, remediationPlan);

      // Generate the executive summary via LLM
      let executiveSummary: string;
      try {
        const response = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage:
            'You are a senior compliance officer writing the executive summary for a regulatory compliance audit report. Write a concise 3-5 paragraph executive summary covering: overall compliance posture, critical gaps identified, framework coverage, and key recommendations. Use markdown formatting. Be direct and actionable.',
          userMessage: buildExecSummaryPrompt(state, remediationPlan),
          callerName: 'legal-department:ca-exec-summary',
          temperature: 0.3,
          maxTokens: 2000,
        });
        executiveSummary = response.text;
      } catch {
        executiveSummary = buildFallbackExecutiveSummary(state);
      }

      // Replace the placeholder with the LLM-generated summary
      const finalReport = report.replace(
        /## 1\. Executive Summary\n\n\[Generated executive summary\]/,
        `## 1. Executive Summary\n\n${executiveSummary}`,
      );

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Compliance audit report generated',
        { step: 'ca_report_generated', progress: 95 },
      );

      return {
        report: finalReport,
        remediationPlan,
        status: 'completed',
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        error: `Report generation failed: ${errMsg}`,
        status: 'failed',
      };
    }
  };
}

// ── Report Assembly ─────────────────────────────────────────────────

function assembleReport(
  state: ComplianceAuditState,
  remediationPlan: RemediationItem[],
): string {
  const ac = state.auditContext;
  const lines: string[] = [];

  lines.push('# Compliance Audit Report');
  lines.push('');
  lines.push(COMPLIANCE_DISCLAIMER);
  lines.push('');
  lines.push(
    `**Mode:** ${ac.mode === 'scan' ? 'Compliance Scan' : 'Full Audit'} | **Frameworks:** ${ac.frameworkSlugs.join(', ').toUpperCase()}`,
  );
  lines.push(
    `**Date:** ${new Date().toISOString().split('T')[0]} | **Documents:** ${state.documents.length} | **Policy Sections:** ${state.policySections.length} | **Findings:** ${state.findings.length}`,
  );
  if (ac.organizationContext) {
    const oc = ac.organizationContext;
    const parts: string[] = [];
    if (oc.industry) parts.push(`Industry: ${oc.industry}`);
    if (oc.jurisdiction) parts.push(`Jurisdiction: ${oc.jurisdiction}`);
    if (oc.employeeCount) parts.push(`Employees: ${oc.employeeCount}`);
    if (parts.length > 0) lines.push(`**Organization:** ${parts.join(' | ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section 1: Executive Summary (placeholder — replaced by LLM)
  lines.push('## 1. Executive Summary');
  lines.push('');
  lines.push('[Generated executive summary]');
  lines.push('');

  // Section 2: Compliance Scorecard
  lines.push('## 2. Compliance Scorecard');
  lines.push('');
  appendScorecardSection(lines, state.scorecard);
  lines.push('');

  // Section 3: Gap Analysis
  lines.push('## 3. Gap Analysis');
  lines.push('');
  appendGapAnalysisSection(lines, state.findings);
  lines.push('');

  // Section 4: Remediation Recommendations
  lines.push('## 4. Remediation Recommendations');
  lines.push('');
  appendRemediationSection(lines, remediationPlan);
  lines.push('');

  // Section 5: Policy-to-Requirement Mapping
  lines.push('## 5. Policy-to-Requirement Mapping');
  lines.push('');
  appendPolicyMappingSection(lines, state.findings);
  lines.push('');

  // Section 6: Appendix — Per-Finding Evidence
  lines.push('## 6. Appendix: Per-Finding Evidence');
  lines.push('');
  appendAppendixSection(lines, state.findings);

  return lines.join('\n');
}

function appendScorecardSection(
  lines: string[],
  scorecard: ComplianceScorecard | undefined,
): void {
  if (!scorecard) {
    lines.push('*Scorecard not available.*');
    return;
  }

  lines.push(
    `**Overall Compliance Score: ${scorecard.overallScore.toFixed(1)}%**`,
  );
  lines.push('');

  for (const fw of scorecard.perFramework) {
    lines.push(`### ${fw.frameworkName} (${fw.frameworkSlug.toUpperCase()})`);
    lines.push(`**Framework Score: ${fw.score.toFixed(1)}%**`);
    lines.push('');

    if (fw.themeScores.length > 0) {
      lines.push(
        '| Theme | Score | Compliant | Partial | Non-Compliant | Not Addressed |',
      );
      lines.push(
        '|-------|-------|-----------|---------|---------------|---------------|',
      );
      for (const ts of fw.themeScores) {
        lines.push(
          `| ${ts.themeName} | ${ts.score.toFixed(1)}% | ${ts.compliant} | ${ts.partiallyCompliant} | ${ts.nonCompliant} | ${ts.notAddressed} |`,
        );
      }
      lines.push('');
    }
  }
}

function appendGapAnalysisSection(
  lines: string[],
  findings: ComplianceFinding[],
): void {
  if (findings.length === 0) {
    lines.push('*No findings to report.*');
    return;
  }

  // Group by framework
  const byFramework = new Map<string, ComplianceFinding[]>();
  for (const f of findings) {
    const arr = byFramework.get(f.frameworkSlug) ?? [];
    arr.push(f);
    byFramework.set(f.frameworkSlug, arr);
  }

  for (const [fw, fwFindings] of byFramework) {
    lines.push(`### ${fw.toUpperCase()}`);
    lines.push('');
    lines.push('| Status | Severity | Requirement | Gap Description |');
    lines.push('|--------|----------|-------------|-----------------|');

    // Sort: non-compliant first, then partially-compliant, then others
    const statusOrder: Record<string, number> = {
      'non-compliant': 0,
      'partially-compliant': 1,
      'not-addressed': 2,
      'unable-to-evaluate': 3,
      compliant: 4,
    };
    const sorted = [...fwFindings].sort(
      (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
    );

    for (const f of sorted) {
      const statusEmoji = statusEmojis[f.status] ?? '❓';
      lines.push(
        `| ${statusEmoji} ${f.status} | ${f.severity} | ${f.requirementRef} | ${truncate(f.gapDescription, 80)} |`,
      );
    }
    lines.push('');
  }
}

const statusEmojis: Record<string, string> = {
  compliant: '✅',
  'partially-compliant': '⚠️',
  'non-compliant': '❌',
  'not-addressed': '🔲',
  'unable-to-evaluate': '❓',
};

function appendRemediationSection(
  lines: string[],
  remediationPlan: RemediationItem[],
): void {
  if (remediationPlan.length === 0) {
    lines.push('*No remediation items identified.*');
    return;
  }

  lines.push(
    '| Priority | Severity | Effort | Requirement | Recommended Action |',
  );
  lines.push(
    '|----------|----------|--------|-------------|-------------------|',
  );

  for (const item of remediationPlan) {
    lines.push(
      `| ${item.priority} | ${item.severity} | ${item.effort} | ${truncate(item.requirement, 40)} | ${truncate(item.recommendedAction, 60)} |`,
    );
  }
}

function appendPolicyMappingSection(
  lines: string[],
  findings: ComplianceFinding[],
): void {
  // Build a map: policy document → requirements it addresses
  const policyMap = new Map<
    string,
    Array<{ requirementRef: string; status: string }>
  >();

  for (const f of findings) {
    for (const cite of f.policyCitations) {
      const key = `${cite.documentName} — ${cite.sectionTitle}`;
      const arr = policyMap.get(key) ?? [];
      arr.push({ requirementRef: f.requirementRef, status: f.status });
      policyMap.set(key, arr);
    }
  }

  if (policyMap.size === 0) {
    lines.push('*No policy-to-requirement mappings identified.*');
    return;
  }

  lines.push('| Policy Section | Requirements Addressed | Status |');
  lines.push('|---------------|----------------------|--------|');

  for (const [policy, reqs] of policyMap) {
    const reqList = reqs
      .map((r) => `${r.requirementRef} (${r.status})`)
      .join(', ');
    const worstStatus = reqs.reduce(
      (worst, r) =>
        (statusPriority[r.status] ?? 5) < (statusPriority[worst] ?? 5)
          ? r.status
          : worst,
      'compliant',
    );
    lines.push(`| ${truncate(policy, 40)} | ${reqList} | ${worstStatus} |`);
  }
}

const statusPriority: Record<string, number> = {
  'non-compliant': 0,
  'partially-compliant': 1,
  'not-addressed': 2,
  'unable-to-evaluate': 3,
  compliant: 4,
};

function appendAppendixSection(
  lines: string[],
  findings: ComplianceFinding[],
): void {
  if (findings.length === 0) {
    lines.push('*No findings to detail.*');
    return;
  }

  for (const f of findings) {
    lines.push(`### ${f.requirementRef} — ${f.status.toUpperCase()}`);
    lines.push(
      `**Severity:** ${f.severity} | **Framework:** ${f.frameworkSlug.toUpperCase()}`,
    );
    if (f.themeName) {
      lines.push(`**Theme:** ${f.themeName}`);
    }
    lines.push('');
    lines.push(`**Requirement:** ${f.requirementText}`);
    lines.push('');
    lines.push(`**Gap Description:** ${f.gapDescription}`);
    lines.push('');
    lines.push(
      `**Remediation Recommendation:** ${f.remediationRecommendation}`,
    );
    lines.push('');

    if (f.policyCitations.length > 0) {
      lines.push('**Policy Citations:**');
      for (const cite of f.policyCitations) {
        lines.push(
          `- *${cite.documentName}* — ${cite.sectionTitle}: "${truncate(cite.excerpt, 120)}"`,
        );
      }
      lines.push('');
    }

    if (f.specialistReasoning) {
      lines.push('<details>');
      lines.push('<summary>Specialist Reasoning</summary>');
      lines.push('');
      lines.push(f.specialistReasoning);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }
}

// ── Remediation Plan Builder ────────────────────────────────────────

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function buildRemediationPlan(
  findings: ComplianceFinding[],
): RemediationItem[] {
  // Only generate remediation for non-compliant, partially-compliant, or not-addressed
  const actionable = findings.filter(
    (f) =>
      f.status === 'non-compliant' ||
      f.status === 'partially-compliant' ||
      f.status === 'not-addressed',
  );

  const items: RemediationItem[] = actionable.map((f) => {
    const effort = estimateEffort(f);
    const effortWeight = effort === 'small' ? 1 : effort === 'medium' ? 2 : 3;
    const priority = SEVERITY_WEIGHT[f.severity] * 10 - effortWeight;

    return {
      findingId: f.id,
      priority,
      severity: f.severity,
      effort,
      description: f.gapDescription,
      requirement: f.requirementRef,
      currentState:
        f.status === 'not-addressed'
          ? 'No policy coverage identified'
          : `Partially addressed — ${f.policyCitations.length} policy section(s) reference this requirement`,
      recommendedAction: f.remediationRecommendation,
    };
  });

  // Sort by priority descending (highest priority first)
  items.sort((a, b) => b.priority - a.priority);

  // Re-number priorities sequentially
  for (let i = 0; i < items.length; i++) {
    items[i]!.priority = i + 1;
  }

  return items;
}

function estimateEffort(
  finding: ComplianceFinding,
): 'small' | 'medium' | 'large' {
  // Heuristic: severity + coverage determines effort
  if (finding.status === 'not-addressed') {
    // No existing policy coverage — writing new policy is at least medium
    return finding.severity === 'low' ? 'medium' : 'large';
  }
  // Partially compliant — updating existing policy
  if (finding.severity === 'critical' || finding.severity === 'high') {
    return 'medium';
  }
  return 'small';
}

// ── LLM Prompt Builders ─────────────────────────────────────────────

function buildExecSummaryPrompt(
  state: ComplianceAuditState,
  remediationPlan: RemediationItem[],
): string {
  const ac = state.auditContext;
  const statusCounts = countByStatus(state.findings);
  const severityCounts = countBySeverity(state.findings);

  return `Audit mode: ${ac.mode === 'scan' ? 'Compliance Scan' : 'Full Audit'}
Frameworks: ${ac.frameworkSlugs.join(', ').toUpperCase()}
Documents analyzed: ${state.documents.length}
Policy sections identified: ${state.policySections.length}
Total findings: ${state.findings.length}

Finding status breakdown:
- Compliant: ${statusCounts.compliant}
- Partially compliant: ${statusCounts['partially-compliant']}
- Non-compliant: ${statusCounts['non-compliant']}
- Not addressed: ${statusCounts['not-addressed']}
- Unable to evaluate: ${statusCounts['unable-to-evaluate']}

Severity breakdown:
- Critical: ${severityCounts.critical}
- High: ${severityCounts.high}
- Medium: ${severityCounts.medium}
- Low: ${severityCounts.low}

Overall compliance score: ${state.scorecard?.overallScore?.toFixed(1) ?? 'N/A'}%

${state.scorecard?.perFramework.map((fw) => `${fw.frameworkName}: ${fw.score.toFixed(1)}%`).join('\n') ?? ''}

Top remediation priorities:
${remediationPlan
  .slice(0, 5)
  .map((r) => `- [${r.severity}] ${r.requirement}: ${r.recommendedAction}`)
  .join('\n')}

${ac.organizationContext ? `Organization context: ${ac.organizationContext.industry ?? 'N/A'} industry, ${ac.organizationContext.jurisdiction ?? 'N/A'} jurisdiction, ${ac.organizationContext.employeeCount ?? 'N/A'} employees` : ''}`;
}

function buildFallbackExecutiveSummary(state: ComplianceAuditState): string {
  const ac = state.auditContext;
  const statusCounts = countByStatus(state.findings);
  const criticalGaps =
    (statusCounts['non-compliant'] ?? 0) + (statusCounts['not-addressed'] ?? 0);

  return `This ${ac.mode === 'scan' ? 'compliance scan' : 'full compliance audit'} analyzed ${state.documents.length} policy document(s) against ${ac.frameworkSlugs.join(', ').toUpperCase()}.

Of ${state.findings.length} total findings, **${criticalGaps} gap(s)** require attention: ${statusCounts['non-compliant']} non-compliant and ${statusCounts['not-addressed']} not addressed. ${statusCounts['partially-compliant']} finding(s) were partially compliant.

${state.scorecard ? `Overall compliance score: **${state.scorecard.overallScore.toFixed(1)}%**.` : ''}

A detailed gap analysis and prioritized remediation plan are provided in the sections below.`;
}

// ── Helpers ─────────────────────────────────────────────────────────

function countByStatus(findings: ComplianceFinding[]): Record<string, number> {
  const counts: Record<string, number> = {
    compliant: 0,
    'partially-compliant': 0,
    'non-compliant': 0,
    'not-addressed': 0,
    'unable-to-evaluate': 0,
  };
  for (const f of findings) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
  }
  return counts;
}

function countBySeverity(
  findings: ComplianceFinding[],
): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
