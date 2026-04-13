/**
 * Due Diligence Room — Analyze Document Node.
 *
 * Processes a single document: pops it from the queue, runs CLO routing
 * to determine which specialists apply, invokes each specialist via the
 * existing specialist utilities, appends findings to running summaries,
 * and stores per-document outputs.
 *
 * Reuses the existing specialist infrastructure by constructing a
 * temporary LegalDepartmentState for each document.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 4)
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { RoutingDecision } from '../../../nodes/clo-routing.node';
import type { DueDiligenceState } from '../due-diligence.state';
import type {
  DocumentIndexEntry,
  RunningFindingsSummary,
  RunningFinding,
  PerDocumentOutput,
  Severity,
} from '../due-diligence.types';

/** Mapping from document classification type to specialist keys. */
const DOC_TYPE_TO_SPECIALISTS: Record<string, string[]> = {
  nda: ['contract', 'ip'],
  contract: ['contract', 'compliance'],
  employment_agreement: ['employment', 'contract'],
  lease: ['real_estate', 'contract'],
  ip_assignment: ['ip', 'contract'],
  privacy_policy: ['privacy', 'compliance'],
  corporate_governance: ['corporate', 'compliance'],
  regulatory_filing: ['compliance'],
  financial_statement: ['corporate'],
  insurance_policy: ['contract', 'compliance'],
  litigation: ['litigation'],
  amendment: ['contract'],
  schedule: ['contract'],
  exhibit: ['contract'],
  other: ['contract'],
};

function getSpecialistsForDocument(documentType: string): string[] {
  const normalized = documentType.toLowerCase().replace(/[- ]/g, '_');
  const mapped = DOC_TYPE_TO_SPECIALISTS[normalized];
  if (mapped) return mapped;
  // Partial match
  for (const [key, specialists] of Object.entries(DOC_TYPE_TO_SPECIALISTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return specialists;
    }
  }
  return ['contract']; // Default fallback
}

/** Extract a risk score (0-100) from specialist output text. */
function extractRiskScore(
  specialistOutputs: Record<string, unknown>,
): number | null {
  // Look for riskAssessment.overallRisk in any specialist output
  for (const output of Object.values(specialistOutputs)) {
    if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      const risk = obj.riskAssessment as Record<string, unknown> | undefined;
      if (risk?.overallRisk && typeof risk.overallRisk === 'string') {
        const level = risk.overallRisk.toLowerCase();
        if (level === 'critical') return 90;
        if (level === 'high') return 75;
        if (level === 'medium') return 50;
        if (level === 'low') return 25;
      }
      // Also check for riskLevel directly
      if (obj.overallRisk && typeof obj.overallRisk === 'string') {
        const level = obj.overallRisk.toLowerCase();
        if (level === 'critical') return 90;
        if (level === 'high') return 75;
        if (level === 'medium') return 50;
        if (level === 'low') return 25;
      }
    }
  }
  return null;
}

/** Extract key findings from specialist outputs for the running summary. */
function extractKeyFindings(
  documentId: string,
  documentName: string,
  specialistKey: string,
  output: unknown,
): RunningFinding[] {
  const findings: RunningFinding[] = [];
  if (!output || typeof output !== 'object') return findings;

  const obj = output as Record<string, unknown>;

  // Extract from riskFlags if present
  const riskFlags = obj.riskFlags as
    | Array<{ name?: string; severity?: string; description?: string }>
    | undefined;
  if (Array.isArray(riskFlags)) {
    for (const flag of riskFlags.slice(0, 5)) {
      // Top 5 findings per specialist
      findings.push({
        documentId,
        documentName,
        finding: flag.description || flag.name || 'Unspecified risk',
        severity: normalizeSeverity(flag.severity),
        category: specialistKey,
      });
    }
  }

  // Extract from keyFindings if present
  const keyFindings = obj.keyFindings as
    | Array<{ finding?: string; severity?: string }>
    | undefined;
  if (Array.isArray(keyFindings)) {
    for (const kf of keyFindings.slice(0, 5)) {
      findings.push({
        documentId,
        documentName,
        finding: kf.finding || 'Unspecified finding',
        severity: normalizeSeverity(kf.severity),
        category: specialistKey,
      });
    }
  }

  return findings;
}

function normalizeSeverity(s: string | undefined): Severity {
  if (!s) return 'medium';
  const lower = s.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  if (lower === 'low') return 'low';
  return 'medium';
}

export function createAnalyzeDocumentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function analyzeDocumentNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    // Pop the next document from the queue
    if (state.documentQueue.length === 0) {
      return {}; // Nothing to analyze
    }

    const nextDocId = state.documentQueue[0]!;
    const remainingQueue = state.documentQueue.slice(1);
    const doc = state.documents.find((d) => d.documentId === nextDocId);
    const indexEntry = state.documentIndex.find(
      (e) => e.documentId === nextDocId,
    );

    if (!doc || !indexEntry) {
      // Document not found — mark as failed, continue
      return {
        documentQueue: remainingQueue,
        documentsFailed: { [nextDocId]: 'Document not found in state' },
      };
    }

    // Mark as analyzing
    const updatedIndex = state.documentIndex.map((e) =>
      e.documentId === nextDocId ? { ...e, status: 'analyzing' as const } : e,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Analyzing: ${doc.name}`,
      {
        step: 'dd:document_analysis_started',
        documentId: nextDocId,
        name: doc.name,
      },
    );

    try {
      // Determine which specialists to run based on classified document type
      const specialists = getSpecialistsForDocument(indexEntry.documentType);

      // Build running findings context from prior documents
      const priorContext = buildRunningFindingsContext(
        state.runningFindings,
        specialists,
      );

      // Run each specialist on this document using direct LLM calls
      const specialistOutputs: Record<string, unknown> = {};
      const completedSpecialists: string[] = [];
      const newFindings: Record<string, RunningFindingsSummary> = {};

      for (const specialistKey of specialists) {
        try {
          const output = await runSingleSpecialist(
            llmClient,
            observability,
            ctx,
            doc,
            indexEntry,
            specialistKey,
            priorContext,
            state.dealContext,
          );
          specialistOutputs[specialistKey] = output;
          completedSpecialists.push(specialistKey);

          // Update running findings for this specialist
          const existingSummary = state.runningFindings[specialistKey];
          const keyFindings = extractKeyFindings(
            nextDocId,
            doc.name,
            specialistKey,
            output,
          );

          newFindings[specialistKey] = {
            specialistKey,
            documentCount: (existingSummary?.documentCount ?? 0) + 1,
            keyFindings: [
              ...(existingSummary?.keyFindings ?? []),
              ...keyFindings,
            ],
            crossReferences: existingSummary?.crossReferences ?? [],
            cumulativeRisks: existingSummary?.cumulativeRisks ?? [],
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          // Individual specialist failure doesn't stop the document
          specialistOutputs[specialistKey] = { error: errMsg };
        }
      }

      // Build routing decision from classification
      const routingDecision: RoutingDecision = {
        specialist: (specialists[0] ??
          'contract') as RoutingDecision['specialist'],
        specialists: specialists as RoutingDecision['specialist'][],
        confidence: 0.8,
        reasoning: `Routed based on document type: ${indexEntry.documentType}`,
        categories: [indexEntry.documentType],
        multiAgent: specialists.length > 1,
      };

      // Calculate risk score from specialist outputs
      const riskScore = extractRiskScore(specialistOutputs);

      // Build per-document output
      const perDocOutput: PerDocumentOutput = {
        specialistOutputs,
        routingDecision,
      };

      // Update document index entry
      const finalIndex: DocumentIndexEntry[] = updatedIndex.map((e) =>
        e.documentId === nextDocId
          ? {
              ...e,
              status: 'complete' as const,
              riskScore,
              specialistsAssigned: specialists,
              specialistsCompleted: completedSpecialists,
            }
          : e,
      );

      const findingCount = Object.values(newFindings).reduce(
        (sum, f) => sum + f.keyFindings.length,
        0,
      );

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Completed: ${doc.name} (${completedSpecialists.length} specialists, ${findingCount} findings)`,
        {
          step: 'dd:document_analysis_complete',
          documentId: nextDocId,
          name: doc.name,
          riskScore,
          findingCount,
        },
      );

      return {
        documentQueue: remainingQueue,
        documentsAnalyzed: [...state.documentsAnalyzed, nextDocId],
        documentIndex: finalIndex,
        perDocumentOutputs: { [nextDocId]: perDocOutput },
        runningFindings: newFindings,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Failed: ${doc.name} — ${errMsg}`,
        {
          step: 'dd:document_analysis_failed',
          documentId: nextDocId,
          name: doc.name,
          error: errMsg,
        },
      );

      // Mark document as failed, update index, continue pipeline
      const failedIndex: DocumentIndexEntry[] = updatedIndex.map((e) =>
        e.documentId === nextDocId
          ? { ...e, status: 'failed' as const, error: errMsg }
          : e,
      );

      return {
        documentQueue: remainingQueue,
        documentsFailed: { [nextDocId]: errMsg },
        documentIndex: failedIndex,
      };
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/** Build a context string from prior running findings summaries. */
function buildRunningFindingsContext(
  runningFindings: Record<string, RunningFindingsSummary>,
  relevantSpecialists: string[],
): string {
  const lines: string[] = [];
  for (const key of relevantSpecialists) {
    const summary = runningFindings[key];
    if (!summary || summary.keyFindings.length === 0) continue;

    lines.push(
      `\n--- Running Findings (${key}, ${summary.documentCount} docs analyzed) ---`,
    );
    // Show top findings, prioritizing critical/high
    const sorted = [...summary.keyFindings].sort((a, b) => {
      const order: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });
    for (const finding of sorted.slice(0, 20)) {
      lines.push(
        `- [${finding.severity.toUpperCase()}] ${finding.documentName}: ${finding.finding}`,
      );
    }
    if (sorted.length > 20) {
      lines.push(`  ... and ${sorted.length - 20} more findings`);
    }
  }
  return lines.length > 0
    ? '\n\nCROSS-DOCUMENT CONTEXT (findings from prior documents in this DD room):' +
        lines.join('\n')
    : '';
}

/** Run a single specialist analysis on a document via direct LLM call. */
async function runSingleSpecialist(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  ctx: DueDiligenceState['executionContext'],
  doc: DueDiligenceState['documents'][0],
  indexEntry: DocumentIndexEntry,
  specialistKey: string,
  priorContext: string,
  dealContext: DueDiligenceState['dealContext'],
): Promise<unknown> {
  const systemMessage = `You are a ${specialistKey} law specialist conducting due diligence analysis for an M&A ${dealContext.transactionType} transaction.

Target Company: ${dealContext.targetCompany}
Buyer Company: ${dealContext.buyerCompany}
${dealContext.jurisdictions.length > 0 ? `Jurisdictions: ${dealContext.jurisdictions.join(', ')}` : ''}
${dealContext.focusAreas.length > 0 ? `Focus Areas: ${dealContext.focusAreas.join(', ')}` : ''}
${dealContext.knownIssues.length > 0 ? `Known Issues: ${dealContext.knownIssues.join(', ')}` : ''}

Analyze this document from the ${specialistKey} law perspective. Respond with ONLY a JSON object (no markdown fences):
{
  "overallRisk": "critical|high|medium|low",
  "riskFlags": [
    {
      "name": "<short name>",
      "severity": "critical|high|medium|low",
      "description": "<1-2 sentence description>",
      "clauseRef": "<clause reference if applicable>"
    }
  ],
  "keyFindings": [
    {
      "finding": "<1-2 sentence finding>",
      "severity": "critical|high|medium|low",
      "recommendation": "<1-2 sentence recommendation>"
    }
  ],
  "summary": "<2-3 sentence analysis summary>"
}

Focus on risks, liabilities, and issues relevant to the ${dealContext.transactionType} from the ${specialistKey} law perspective.`;

  // Truncate document to fit context window — use first 12K chars
  const maxChars = 12000;
  const docSnippet =
    doc.content.length > maxChars
      ? doc.content.slice(0, maxChars) + '\n\n[Document truncated]'
      : doc.content;

  const userMessage = `Document: "${doc.name}" (classified as: ${indexEntry.documentType})
Parties: ${indexEntry.parties.join(', ') || 'Unknown'}
Date: ${indexEntry.date || 'Unknown'}
Summary: ${indexEntry.summary}
${priorContext}

DOCUMENT TEXT:
${docSnippet}`;

  const response = await llmClient.callLLM({
    context: ctx,
    systemMessage,
    userMessage,
    callerName: `legal-department:dd-${specialistKey}`,
    temperature: 0.2,
    maxTokens: 2000,
  });

  // Parse the JSON response
  const cleaned = response.text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      overallRisk: 'medium',
      riskFlags: [],
      keyFindings: [],
      summary: response.text.slice(0, 500),
    };
  }
}
