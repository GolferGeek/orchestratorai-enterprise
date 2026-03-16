import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';

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
) {
  return async function litigationAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Litigation Agent: Analyzing pleading',
      { step: 'litigation_agent', progress: 60 },
    );

    try {
      const documentText = getDocumentText(state);
      if (!documentText) {
        return {
          error: 'No document content available for litigation analysis',
          status: 'failed',
        };
      }

      const systemMessage = buildLitigationAnalysisPrompt();
      const userMessage = buildUserMessage(documentText, state);

      const response = await llmClient.callLLM({
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:litigation-agent`,
        temperature: 0.3,
        maxTokens: 3500,
      });

      let analysis: LitigationAnalysisOutput;
      try {
        analysis = parseLitigationAnalysis(response.text);
      } catch {
        analysis = createFallbackAnalysis(response.text);
      }

      analysis = applyPlaybookRules(analysis, state);

      await observability.emitProgress(
        ctx,
        ctx.taskId,
        'Litigation Agent: Analysis complete',
        { step: 'litigation_agent_complete', progress: 80 },
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
        ctx.taskId,
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

function getDocumentText(state: LegalDepartmentState): string | undefined {
  if (state.documents && state.documents.length > 0) {
    return state.documents[0]!.content;
  }
  if (state.legalMetadata?.sections?.sections) {
    return state.legalMetadata.sections.sections
      .map((s) => s.content)
      .join('\n\n');
  }
  return undefined;
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
  let message = `Analyze litigation document:\n\n${documentText}`;
  if (state.legalMetadata) {
    message += `\n\n---\nDocument Type: ${state.legalMetadata.documentType.type}`;
    if (state.legalMetadata.dates.primaryDate) {
      message += `\n- Filing Date: ${state.legalMetadata.dates.primaryDate.normalizedDate}`;
    }
  }
  if (state.userMessage && state.userMessage.toLowerCase() !== 'analyze') {
    message += `\n\nUser Request: ${state.userMessage}`;
  }
  return message;
}

function parseLitigationAnalysis(
  responseText: string,
): LitigationAnalysisOutput {
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

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

function createFallbackAnalysis(
  responseText: string,
): LitigationAnalysisOutput {
  return {
    caseInfo: {
      details: 'Could not parse case information',
    },
    parties: {
      plaintiffs: [],
      defendants: [],
    },
    claims: [],
    deadlines: [],
    riskFlags: [
      {
        flag: 'analysis-incomplete',
        severity: 'medium',
        description: 'Could not fully parse litigation analysis.',
        recommendation: 'Review document manually.',
      },
    ],
    confidence: 0.5,
    summary: responseText.slice(0, 500),
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
  const docText =
    state.documents?.[0]?.content?.toLowerCase() ||
    state.legalMetadata?.sections?.sections
      ?.map((s) => s.content)
      .join(' ')
      .toLowerCase() ||
    '';

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
