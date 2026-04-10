import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import type { WorkflowRagService } from '../../shared/services/workflow-rag.service';
import {
  enumerateDocuments,
  stripMarkdownFences,
  buildBaseUserMessage,
  runSpecialistOverDocuments,
  loadWorkflowMemory,
  formatMemoryForPrompt,
} from './specialist-utils';

const AGENT_SLUG = 'legal-department';

export interface LitigationAnalysisOutput {
  /** Case information */
  caseInfo: {
    /** Case name/caption */
    caption?: string;
    /** Court */
    court?: string;
    /** Case number */
    caseNumber?: string;
    /** Filing date */
    filingDate?: string;
    details: string;
  };
  /** Parties */
  parties: {
    /** Plaintiffs */
    plaintiffs: string[];
    /** Defendants */
    defendants: string[];
    /** Other parties */
    otherParties?: string[];
  };
  /** Claims and causes of action */
  claims: Array<{
    claim: string;
    description: string;
  }>;
  /** Relief sought */
  reliefSought?: {
    monetary?: string;
    injunctive?: string;
    other?: string[];
    details: string;
  };
  /** Deadlines */
  deadlines: Array<{
    deadline: string;
    description: string;
    calculatedDate?: string;
    daysRemaining?: number;
    rule?: string; // FRCP rule reference
  }>;
  /** Risk assessment */
  riskAssessment?: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    details: string;
  };
  /** Risk flags */
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

/**
 * Litigation Agent Node - M9 Specialist
 *
 * Purpose: Analyze pleadings, motions, and court filings. Calculate deadlines.
 *
 * M9 Playbook Rules:
 * - Calculate response deadlines using FRCP rules
 * - Flag missing service information
 * - Flag upcoming deadlines (< 7 days)
 */
export function createLitigationAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
) {
  return async function litigationAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Litigation Agent: Analyzing pleading',
      { step: 'litigation_agent', progress: 40 },
    );

    try {
      const documents = enumerateDocuments(state);
      if (documents.length === 0) {
        return {
          error: 'No document content available for litigation analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context
      const ragContext = await workflowRag?.getContext({
        collectionSlug: 'law-litigation-cross-reference',
        orgSlug: ctx.orgSlug,
        query: documents[0]!.content,
      }) ?? '';

      const memory = await loadWorkflowMemory('document-onboarding');
      const systemMessage = buildLitigationAnalysisPrompt() + formatMemoryForPrompt(memory);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Litigation Agent: calling LLM for analysis...',
        { step: 'litigation_agent_llm_call', progress: 45 },
      );

      let analysis: LitigationAnalysisOutput;
      try {
        const run = await runSpecialistOverDocuments<LitigationAnalysisOutput>({
          llmClient,
          observability,
          state,
          documents,
          systemMessage,
          callerName: `${AGENT_SLUG}:litigation-agent`,
          temperature: 0.3,
          maxTokens: 3500,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += ragContext;
            }
            return msg;
          },
          parse: parseLitigationAnalysis,
          merge: mergeLitigationAnalyses,
          progressLabel: 'Litigation Agent',
          progressStepPrefix: 'litigation_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Litigation Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      analysis = applyPlaybookRules(analysis, state);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Litigation Agent: Analysis complete',
        { step: 'litigation_agent_complete', progress: 60 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          litigation: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Litigation Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Litigation Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

function buildLitigationAnalysisPrompt(): string {
  return `You are a Litigation Specialist AI. Analyze pleadings, motions, complaints, and court filings.

INSTRUCTIONS:
1. Extract case information (caption, court, case number)
2. Identify all parties (plaintiffs, defendants)
3. List claims and causes of action
4. Identify relief sought
5. Calculate important deadlines using FRCP rules:
   - Answer deadline: 21 days after service (FRCP 12(a)(1)(A))
   - Motion to dismiss deadline: before answering
   - Discovery deadlines: typically end 30 days before trial
   - Summary judgment: at least 30 days before trial

OUTPUT FORMAT (JSON only):
{
  "caseInfo": {
    "caption": "case name",
    "court": "court name",
    "caseNumber": "docket number",
    "filingDate": "YYYY-MM-DD",
    "details": "case details"
  },
  "parties": {
    "plaintiffs": ["list of plaintiffs"],
    "defendants": ["list of defendants"],
    "otherParties": ["third-parties, intervenors, etc"]
  },
  "claims": [
    {
      "claim": "claim name",
      "description": "claim description"
    }
  ],
  "reliefSought": {
    "monetary": "amount sought",
    "injunctive": "injunctive relief description",
    "other": ["other relief"],
    "details": "relief analysis"
  },
  "deadlines": [
    {
      "deadline": "deadline name (e.g., 'Answer Due')",
      "description": "what is due",
      "calculatedDate": "YYYY-MM-DD (if calculable)",
      "daysRemaining": number of days,
      "rule": "FRCP rule citation"
    }
  ],
  "riskAssessment": {
    "overallRisk": "low|medium|high|critical",
    "details": "risk analysis"
  },
  "riskFlags": [
    {
      "flag": "risk-identifier-slug",
      "severity": "low|medium|high|critical",
      "description": "What this risk means",
      "recommendation": "How to address it"
    }
  ],
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence summary"
}`;
}

function buildUserMessage(
  documentText: string,
  state: LegalDepartmentState,
): string {
  return `Analyze litigation document:\n\n${buildBaseUserMessage(documentText, state)}`;
}

function parseLitigationAnalysis(
  responseText: string,
): LitigationAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    caseInfo: (parsed.caseInfo as LitigationAnalysisOutput['caseInfo']) || {
      details: 'No case information found',
    },
    parties: (parsed.parties as LitigationAnalysisOutput['parties']) || {
      plaintiffs: [],
      defendants: [],
    },
    claims: (parsed.claims as LitigationAnalysisOutput['claims']) || [],
    reliefSought:
      parsed.reliefSought as LitigationAnalysisOutput['reliefSought'],
    deadlines:
      (parsed.deadlines as LitigationAnalysisOutput['deadlines']) || [],
    riskAssessment:
      parsed.riskAssessment as LitigationAnalysisOutput['riskAssessment'],
    riskFlags:
      (parsed.riskFlags as LitigationAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Litigation analysis completed',
  };
}

function applyPlaybookRules(
  analysis: LitigationAnalysisOutput,
  state: LegalDepartmentState,
): LitigationAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag urgent deadlines (< 7 days)
  for (const deadline of analysis.deadlines) {
    if (deadline.daysRemaining !== undefined && deadline.daysRemaining < 7) {
      const severity =
        deadline.daysRemaining <= 3
          ? 'critical'
          : deadline.daysRemaining <= 5
            ? 'high'
            : 'medium';
      existingFlags.push({
        flag: 'urgent-deadline',
        severity,
        description: `${deadline.deadline} due in ${deadline.daysRemaining} days${deadline.calculatedDate ? ` (${deadline.calculatedDate})` : ''}`,
        recommendation:
          'Prioritize immediately. Ensure all materials are prepared and filed on time.',
      });
    }
  }

  // Rule 2: Flag if served but no answer deadline calculated
  const hasAnswerDeadline = analysis.deadlines.some((d) =>
    d.deadline.toLowerCase().includes('answer'),
  );
  const docText = (state.documents ?? [])
    .map((d) => d.content)
    .join('\n\n')
    .toLowerCase();

  if (
    (docText.includes('complaint') || docText.includes('summons')) &&
    !hasAnswerDeadline
  ) {
    existingFlags.push({
      flag: 'missing-answer-deadline',
      severity: 'high',
      description: 'Complaint received but answer deadline not calculated.',
      recommendation:
        'Determine service date and calculate answer deadline (typically 21 days from service).',
    });
  }

  // Rule 3: Flag high-risk cases
  if (
    analysis.riskAssessment?.overallRisk === 'high' ||
    analysis.riskAssessment?.overallRisk === 'critical'
  ) {
    existingFlags.push({
      flag: 'high-risk-case',
      severity: analysis.riskAssessment.overallRisk,
      description: `Case assessed as ${analysis.riskAssessment.overallRisk} risk: ${analysis.riskAssessment.details}`,
      recommendation:
        'Assign senior counsel. Consider early settlement discussions or aggressive defense strategy.',
    });
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}

/**
 * Merge litigation analyses from chunked LLM calls.
 *
 * Merge rules:
 *  - caseInfo: take first chunk's (caption/court/case number).
 *  - parties: union plaintiffs/defendants/otherParties.
 *  - claims: concat then dedupe by claim text.
 *  - reliefSought: first chunk that has it.
 *  - deadlines: concat then dedupe by `deadline+description`.
 *  - riskAssessment: take the most severe across chunks.
 *  - riskFlags: dedupe by `flag` (first occurrence wins).
 *  - confidence: minimum across chunks.
 *  - summary: join non-empty chunk summaries.
 */
function mergeLitigationAnalyses(
  results: LitigationAnalysisOutput[],
): LitigationAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const plaintiffs = new Set<string>();
  const defendants = new Set<string>();
  const others = new Set<string>();
  for (const r of results) {
    for (const p of r.parties?.plaintiffs ?? []) plaintiffs.add(p);
    for (const d of r.parties?.defendants ?? []) defendants.add(d);
    for (const o of r.parties?.otherParties ?? []) others.add(o);
  }
  const seenClaims = new Set<string>();
  const claims: LitigationAnalysisOutput['claims'] = [];
  for (const r of results) {
    for (const c of r.claims ?? []) {
      const k = c.claim.trim().toLowerCase();
      if (seenClaims.has(k)) continue;
      seenClaims.add(k);
      claims.push(c);
    }
  }
  const seenDeadlines = new Set<string>();
  const deadlines: LitigationAnalysisOutput['deadlines'] = [];
  for (const r of results) {
    for (const d of r.deadlines ?? []) {
      const k = `${d.deadline}|${d.description}`;
      if (seenDeadlines.has(k)) continue;
      seenDeadlines.add(k);
      deadlines.push(d);
    }
  }
  const riskRank: Record<'low' | 'medium' | 'high' | 'critical', number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  let worstRisk: LitigationAnalysisOutput['riskAssessment'];
  for (const r of results) {
    if (!r.riskAssessment) continue;
    if (
      !worstRisk ||
      riskRank[r.riskAssessment.overallRisk] > riskRank[worstRisk.overallRisk]
    ) {
      worstRisk = r.riskAssessment;
    }
  }
  const seen = new Set<string>();
  const riskFlags: LitigationAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      riskFlags.push(f);
    }
  }
  return {
    caseInfo: results[0]!.caseInfo,
    parties: {
      plaintiffs: Array.from(plaintiffs),
      defendants: Array.from(defendants),
      otherParties: others.size ? Array.from(others) : undefined,
    },
    claims,
    reliefSought: results.find((r) => r.reliefSought)?.reliefSought,
    deadlines,
    riskAssessment: worstRisk,
    riskFlags,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
