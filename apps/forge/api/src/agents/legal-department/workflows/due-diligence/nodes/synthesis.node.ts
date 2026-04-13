/**
 * Due Diligence Room — Synthesis Node.
 *
 * Reads all perDocumentOutputs and runningFindings from state. Produces:
 * - RiskMatrix (7 categories x 4 severities with counts and document refs)
 * - perCategoryAnalysis (narrative + findings per category)
 * - dealBreakerFlags (critical findings)
 * - missingDocuments (referenced but absent)
 * - crossReferenceMap (inter-document relationships)
 *
 * Single LLM call with structured output.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 6)
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';
import type {
  RiskMatrix,
  CategoryAnalysis,
  DealBreakerFlag,
  MissingDocument,
  CrossReference,
} from '../due-diligence.types';

const SYNTHESIS_SYSTEM = `You are a senior M&A attorney synthesizing findings from a due diligence document review. You have analyzed multiple documents and need to produce a comprehensive cross-document synthesis.

Respond with ONLY a JSON object (no markdown fences):
{
  "riskMatrix": {
    "cells": [
      {
        "category": "<contractual|ip|employment|regulatory|financial|corporate|environmental>",
        "severity": "<critical|high|medium|low>",
        "count": <number>,
        "documentRefs": [{"documentId": "<id>", "documentName": "<name>", "finding": "<summary>"}]
      }
    ]
  },
  "perCategoryAnalysis": {
    "<category>": {
      "category": "<category>",
      "narrative": "<2-3 paragraph markdown narrative>",
      "findings": [
        {
          "documentId": "<id>",
          "documentName": "<name>",
          "clauseRef": "<clause if applicable>",
          "finding": "<finding>",
          "severity": "<critical|high|medium|low>",
          "recommendation": "<recommendation>"
        }
      ],
      "overallRisk": "<critical|high|medium|low>"
    }
  },
  "dealBreakerFlags": [
    {
      "finding": "<finding>",
      "category": "<category>",
      "severity": "critical",
      "documentRefs": [{"documentId": "<id>", "documentName": "<name>"}],
      "reasoning": "<why this is a deal breaker>",
      "recommendation": "<recommended action>"
    }
  ],
  "missingDocuments": [
    {
      "referencedIn": {"documentId": "<id>", "documentName": "<name>"},
      "description": "<what document is missing>",
      "importance": "<critical|high|medium|low>"
    }
  ],
  "crossReferenceMap": [
    {
      "sourceDocId": "<id>",
      "sourceDocName": "<name>",
      "targetDocId": "<id>",
      "targetDocName": "<name>",
      "relationship": "<relationship description>",
      "riskImplication": "<risk implication if any>"
    }
  ]
}

Categories: contractual, ip, employment, regulatory, financial, corporate, environmental.
Only include categories that have actual findings. Severity: critical, high, medium, low.
Be thorough and cite specific documents by name and ID.`;

export function createSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function synthesisNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Running cross-document synthesis',
      { step: 'dd:synthesis_started', progress: 77 },
    );

    // Build synthesis input from all per-document outputs and running findings
    const docSummaries = state.documentIndex
      .filter((d) => d.status === 'complete')
      .map((d) => {
        const output = state.perDocumentOutputs[d.documentId];
        return `Document: "${d.name}" (ID: ${d.documentId})
Type: ${d.documentType} | Parties: ${d.parties.join(', ')} | Date: ${d.date ?? 'N/A'} | Risk Score: ${d.riskScore ?? 'N/A'}
Summary: ${d.summary}
Specialist Outputs: ${output ? JSON.stringify(output.specialistOutputs).slice(0, 2000) : 'None'}`;
      })
      .join('\n\n---\n\n');

    const runningFindingsSummary = Object.entries(state.runningFindings)
      .map(
        ([key, summary]) =>
          `${key}: ${summary.documentCount} docs, ${summary.keyFindings.length} findings\n` +
          summary.keyFindings
            .slice(0, 10)
            .map(
              (f) =>
                `  [${f.severity.toUpperCase()}] ${f.documentName}: ${f.finding}`,
            )
            .join('\n'),
      )
      .join('\n\n');

    const userMessage = `Transaction: ${state.dealContext.transactionType}
Target: ${state.dealContext.targetCompany}
Buyer: ${state.dealContext.buyerCompany}
Jurisdictions: ${state.dealContext.jurisdictions.join(', ') || 'Not specified'}
Focus Areas: ${state.dealContext.focusAreas.join(', ') || 'None specified'}
Known Issues: ${state.dealContext.knownIssues.join(', ') || 'None specified'}

Total Documents: ${state.documents.length}
Analyzed: ${state.documentsAnalyzed.length}
Failed: ${Object.keys(state.documentsFailed).length}

DOCUMENT ANALYSIS SUMMARIES:
${docSummaries}

RUNNING FINDINGS BY SPECIALIST:
${runningFindingsSummary}

Synthesize all findings into a comprehensive risk matrix, per-category analysis, deal-breaker flags, missing documents, and cross-reference map.`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        systemMessage: SYNTHESIS_SYSTEM,
        userMessage,
        callerName: 'legal-department:dd-synthesis',
        temperature: 0.2,
        maxTokens: 8000,
      });

      // Parse synthesis output
      const cleaned = response.text
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/^```(?:json)?\s*\n?/m, '')
        .replace(/\n?```\s*$/m, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        // If parsing fails, return minimal results
        parsed = {};
      }

      const riskMatrix = (parsed.riskMatrix as RiskMatrix) ?? { cells: [] };
      const perCategoryAnalysis =
        (parsed.perCategoryAnalysis as Record<string, CategoryAnalysis>) ?? {};
      const dealBreakerFlags =
        (parsed.dealBreakerFlags as DealBreakerFlag[]) ?? [];
      const missingDocuments =
        (parsed.missingDocuments as MissingDocument[]) ?? [];
      const crossReferenceMap =
        (parsed.crossReferenceMap as CrossReference[]) ?? [];

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Synthesis complete: ${riskMatrix.cells.length} risk cells, ${dealBreakerFlags.length} deal-breakers`,
        {
          step: 'dd:synthesis_complete',
          progress: 85,
          riskMatrixSummary: {
            cells: riskMatrix.cells.length,
            dealBreakers: dealBreakerFlags.length,
          },
          dealBreakerCount: dealBreakerFlags.length,
        },
      );

      return {
        riskMatrix,
        perCategoryAnalysis,
        dealBreakerFlags,
        missingDocuments,
        crossReferenceMap,
        status: 'awaiting_synthesis_review',
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        error: `Synthesis failed: ${errMsg}`,
        status: 'failed',
      };
    }
  };
}
