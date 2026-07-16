/**
 * Due Diligence Room — Report Generation Node.
 *
 * Assembles a structured markdown DD report from synthesis outputs,
 * document index, and per-document annotations. Incorporates any
 * HITL modifications (reclassified risks, added commentary).
 *
 * Report sections:
 * 1. Executive summary
 * 2. Risk matrix
 * 3. Per-category detailed analysis with clause-level citations
 * 4. Document index with per-document risk scores
 * 5. Cross-reference map
 * 6. Appendix with per-document annotations
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 8)
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';

export function createReportGenerationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function reportGenerationNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating DD report',
      { step: 'dd_report_generation', progress: 87 },
    );

    try {
      // Build report from synthesis outputs + document index
      const report = assembleReport(state);

      // Optionally refine the executive summary with an LLM call
      let executiveSummary: string;
      try {
        const response = await llmClient.callLLM({
          context: ctx,
          systemMessage:
            'You are a senior M&A attorney writing the executive summary for a due diligence report. Write a concise 3-5 paragraph executive summary. Include the key deal-breaker risks, overall risk assessment, and recommendations. Use markdown formatting.',
          userMessage: `Transaction: ${state.dealContext.transactionType} (${state.dealContext.targetCompany} / ${state.dealContext.buyerCompany})
Documents analyzed: ${state.documentsAnalyzed.length} of ${state.documents.length}
Failed: ${Object.keys(state.documentsFailed).length}

Deal-breaker flags: ${JSON.stringify(state.dealBreakerFlags ?? [])}

Risk matrix summary: ${JSON.stringify(state.riskMatrix?.cells?.slice(0, 20) ?? [])}

Per-category analysis: ${Object.entries(state.perCategoryAnalysis ?? {})
            .map(
              ([cat, a]) =>
                `${cat}: ${a.overallRisk} risk — ${a.narrative?.slice(0, 200)}`,
            )
            .join('\n')}

Missing documents: ${JSON.stringify(state.missingDocuments ?? [])}`,
          callerName: 'legal-department:dd-exec-summary',
          temperature: 0.3,
          maxTokens: 2000,
        });
        executiveSummary = response.text;
      } catch {
        executiveSummary = buildFallbackExecutiveSummary(state);
      }

      // Replace the placeholder executive summary with the LLM-generated one
      const finalReport = report.replace(
        /## 1\. Executive Summary\n\n\[Generated executive summary\]/,
        `## 1. Executive Summary\n\n${executiveSummary}`,
      );

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'DD report generated',
        { step: 'dd:report_generated', progress: 95 },
      );

      return {
        report: finalReport,
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

function assembleReport(state: DueDiligenceState): string {
  const dc = state.dealContext;
  const lines: string[] = [];

  lines.push(`# Due Diligence Report`);
  lines.push('');
  lines.push(
    `**Transaction:** ${dc.transactionType} | **Target:** ${dc.targetCompany} | **Buyer:** ${dc.buyerCompany}`,
  );
  if (dc.dealValueRange) lines.push(`**Deal Value:** ${dc.dealValueRange}`);
  if (dc.jurisdictions.length > 0)
    lines.push(`**Jurisdictions:** ${dc.jurisdictions.join(', ')}`);
  lines.push(
    `**Date:** ${new Date().toISOString().split('T')[0]} | **Documents:** ${state.documents.length} (${state.documentsAnalyzed.length} analyzed, ${Object.keys(state.documentsFailed).length} failed)`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // Section 1: Executive Summary (placeholder — replaced by LLM)
  lines.push('## 1. Executive Summary');
  lines.push('');
  lines.push('[Generated executive summary]');
  lines.push('');

  // Section 2: Risk Matrix
  lines.push('## 2. Risk Matrix');
  lines.push('');
  if (state.riskMatrix?.cells?.length) {
    lines.push('| Category | Critical | High | Medium | Low |');
    lines.push('|----------|----------|------|--------|-----|');
    const categories = [
      'contractual',
      'ip',
      'employment',
      'regulatory',
      'financial',
      'corporate',
      'environmental',
    ];
    for (const cat of categories) {
      const cells = state.riskMatrix.cells.filter((c) => c.category === cat);
      const counts: Record<string, number> = {};
      for (const cell of cells) counts[cell.severity] = cell.count;
      lines.push(
        `| ${cat} | ${counts['critical'] ?? 0} | ${counts['high'] ?? 0} | ${counts['medium'] ?? 0} | ${counts['low'] ?? 0} |`,
      );
    }
  } else {
    lines.push('*No risk matrix data available.*');
  }
  lines.push('');

  // Deal Breakers
  if (state.dealBreakerFlags?.length) {
    lines.push('### Deal Breakers');
    lines.push('');
    for (const flag of state.dealBreakerFlags) {
      lines.push(`- **${flag.finding}** (${flag.category})`);
      lines.push(`  - Reasoning: ${flag.reasoning}`);
      lines.push(`  - Recommendation: ${flag.recommendation}`);
      lines.push(
        `  - Documents: ${flag.documentRefs.map((r) => r.documentName).join(', ')}`,
      );
    }
    lines.push('');
  }

  // Section 3: Per-Category Analysis
  lines.push('## 3. Detailed Analysis by Category');
  lines.push('');
  if (state.perCategoryAnalysis) {
    for (const [cat, analysis] of Object.entries(state.perCategoryAnalysis)) {
      lines.push(`### ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      lines.push(`**Overall Risk:** ${analysis.overallRisk}`);
      lines.push('');
      lines.push(analysis.narrative);
      lines.push('');
      if (analysis.findings?.length) {
        for (const finding of analysis.findings) {
          lines.push(
            `- **[${finding.severity.toUpperCase()}]** ${finding.documentName}: ${finding.finding}`,
          );
          if (finding.recommendation) {
            lines.push(`  - *Recommendation:* ${finding.recommendation}`);
          }
        }
        lines.push('');
      }
    }
  }

  // Section 4: Document Index
  lines.push('## 4. Document Index');
  lines.push('');
  lines.push('| # | Document | Type | Risk Score | Status |');
  lines.push('|---|----------|------|------------|--------|');
  for (let i = 0; i < state.documentIndex.length; i++) {
    const d = state.documentIndex[i]!;
    lines.push(
      `| ${i + 1} | ${d.name} | ${d.documentType} | ${d.riskScore ?? '—'} | ${d.status} |`,
    );
  }
  lines.push('');

  // Failed documents
  const failedDocs = state.documentIndex.filter((d) => d.status === 'failed');
  if (failedDocs.length > 0) {
    lines.push('### Failed Documents');
    lines.push('');
    for (const d of failedDocs) {
      lines.push(`- **${d.name}**: ${d.error ?? 'Unknown error'}`);
    }
    lines.push('');
  }

  // Section 5: Cross-Reference Map
  lines.push('## 5. Cross-Reference Map');
  lines.push('');
  if (state.crossReferenceMap?.length) {
    for (const ref of state.crossReferenceMap) {
      lines.push(
        `- ${ref.sourceDocName} → ${ref.targetDocName}: ${ref.relationship}`,
      );
      if (ref.riskImplication) {
        lines.push(`  - *Risk:* ${ref.riskImplication}`);
      }
    }
  } else {
    lines.push('*No cross-references identified.*');
  }
  lines.push('');

  // Section 6: Missing Documents
  if (state.missingDocuments?.length) {
    lines.push('## 6. Missing Documents');
    lines.push('');
    for (const md of state.missingDocuments) {
      lines.push(
        `- **[${md.importance.toUpperCase()}]** ${md.description} (referenced in ${md.referencedIn.documentName})`,
      );
    }
    lines.push('');
  }

  // Section 7: Appendix — Per-Document Annotations
  const completedDocs = state.documentIndex.filter(
    (d) => d.status === 'complete',
  );
  if (completedDocs.length > 0) {
    lines.push('## 7. Appendix: Per-Document Annotations');
    lines.push('');
    for (const doc of completedDocs) {
      lines.push(`### ${doc.name}`);
      lines.push(
        `**Type:** ${doc.documentType} | **Risk Score:** ${doc.riskScore ?? '—'} | **Parties:** ${doc.parties.join(', ') || '—'} | **Date:** ${doc.date ?? '—'}`,
      );
      lines.push('');
      lines.push(`> ${doc.summary}`);
      lines.push('');

      // Include specialist findings from per-document outputs
      const output = state.perDocumentOutputs[doc.documentId];
      if (output?.specialistOutputs) {
        for (const [specialist, findings] of Object.entries(
          output.specialistOutputs,
        )) {
          if (!findings || typeof findings !== 'object') continue;
          const f = findings as Record<string, unknown>;
          lines.push(`**${specialist} specialist:**`);

          // Summary
          if (typeof f.summary === 'string') {
            lines.push(f.summary);
            lines.push('');
          }

          // Risk flags
          const riskFlags = f.riskFlags as
            | Array<{
                name?: string;
                severity?: string;
                description?: string;
              }>
            | undefined;
          if (Array.isArray(riskFlags) && riskFlags.length > 0) {
            for (const flag of riskFlags) {
              lines.push(
                `- **[${(flag.severity ?? 'medium').toUpperCase()}]** ${flag.name ?? ''}: ${flag.description ?? ''}`,
              );
            }
            lines.push('');
          }
        }
      }
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildFallbackExecutiveSummary(state: DueDiligenceState): string {
  const dc = state.dealContext;
  const dealBreakers = state.dealBreakerFlags?.length ?? 0;
  const totalDocs = state.documents.length;
  const analyzed = state.documentsAnalyzed.length;
  const failed = Object.keys(state.documentsFailed).length;

  return `This due diligence review analyzed ${analyzed} of ${totalDocs} documents for the proposed ${dc.transactionType} of ${dc.targetCompany} by ${dc.buyerCompany}.${failed > 0 ? ` ${failed} document(s) could not be analyzed.` : ''}

${dealBreakers > 0 ? `**${dealBreakers} deal-breaker risk(s) were identified** that require immediate attention before proceeding.` : 'No deal-breaker risks were identified.'}

A comprehensive risk matrix and per-category analysis are provided in the sections below.`;
}
