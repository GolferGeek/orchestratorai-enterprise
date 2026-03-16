import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';

const AGENT_SLUG = 'legal-department';

export interface CorporateAnalysisOutput {
  /** Document type and purpose */
  documentType: {
    type: 'resolution' | 'bylaws' | 'articles' | 'minutes' | 'filing' | 'other';
    purpose: string;
    details: string;
  };
  /** Governance matters */
  governance?: {
    /** Board/shareholder action */
    action?: string;
    /** Quorum requirements */
    quorum?: {
      required: string;
      met: boolean;
      details: string;
    };
    /** Voting results */
    votingResults?: {
      required: string;
      actual: string;
      passed: boolean;
    };
    /** Authority and authorization */
    authority?: string[];
  };
  /** Compliance requirements */
  compliance?: {
    /** Filing deadlines */
    filingDeadlines?: Array<{
      deadline: string;
      requirement: string;
      status: 'upcoming' | 'current' | 'overdue' | 'unknown';
    }>;
    /** Required approvals */
    requiredApprovals?: string[];
    /** Regulatory requirements */
    regulatoryRequirements?: string[];
    details: string;
  };
  /** Entity information */
  entityInfo?: {
    entityName?: string;
    entityType?: string;
    jurisdiction?: string;
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
 * Corporate Agent Node - M8 Specialist
 *
 * Purpose: Analyze corporate governance documents, resolutions, and filings.
 *
 * M8 Playbook Rules:
 * - Flag missing quorum
 * - Flag upcoming filing deadlines (< 30 days)
 * - Flag missing required approvals
 */
export function createCorporateAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function corporateAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Corporate Agent: Analyzing governance document',
      { step: 'corporate_agent', progress: 60 },
    );

    try {
      const documentText = getDocumentText(state);
      if (!documentText) {
        return {
          error: 'No document content available for corporate analysis',
          status: 'failed',
        };
      }

      const systemMessage = buildCorporateAnalysisPrompt();
      const userMessage = buildUserMessage(documentText, state);

      const response = await llmClient.callLLM({
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:corporate-agent`,
        temperature: 0.3,
        maxTokens: 3000,
      });

      let analysis: CorporateAnalysisOutput;
      try {
        analysis = parseCorporateAnalysis(response.text);
      } catch {
        analysis = createFallbackAnalysis(response.text);
      }

      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.taskId,
        'Corporate Agent: Analysis complete',
        { step: 'corporate_agent_complete', progress: 80 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          corporate: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.taskId,
        `Corporate Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Corporate Agent: ${errorMessage}`,
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

function buildCorporateAnalysisPrompt(): string {
  return `You are a Corporate Governance Specialist AI. Analyze corporate documents including resolutions, bylaws, articles, and filings.

INSTRUCTIONS:
1. Identify document type and purpose
2. Check quorum requirements and voting results
3. Identify filing deadlines and compliance requirements
4. Review authority and approval requirements
5. Extract entity information

OUTPUT FORMAT (JSON only):
{
  "documentType": {
    "type": "resolution|bylaws|articles|minutes|filing|other",
    "purpose": "purpose of document",
    "details": "document analysis"
  },
  "governance": {
    "action": "board/shareholder action taken",
    "quorum": {
      "required": "quorum requirement",
      "met": true/false,
      "details": "quorum analysis"
    },
    "votingResults": {
      "required": "vote threshold required",
      "actual": "actual vote count/percentage",
      "passed": true/false
    },
    "authority": ["list of authorities/authorizations"]
  },
  "compliance": {
    "filingDeadlines": [
      {
        "deadline": "date",
        "requirement": "what must be filed",
        "status": "upcoming|current|overdue|unknown"
      }
    ],
    "requiredApprovals": ["list of required approvals"],
    "regulatoryRequirements": ["list of regulatory requirements"],
    "details": "compliance analysis"
  },
  "entityInfo": {
    "entityName": "company name",
    "entityType": "corporation|LLC|partnership|etc",
    "jurisdiction": "state/country of incorporation",
    "details": "entity details"
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
  let message = `Analyze corporate governance document:\n\n${documentText}`;
  if (state.legalMetadata) {
    message += `\n\n---\nDocument Type: ${state.legalMetadata.documentType.type}`;
  }
  if (state.userMessage && state.userMessage.toLowerCase() !== 'analyze') {
    message += `\n\nUser Request: ${state.userMessage}`;
  }
  return message;
}

function parseCorporateAnalysis(responseText: string): CorporateAnalysisOutput {
  let jsonStr = responseText.trim();
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    documentType:
      (parsed.documentType as CorporateAnalysisOutput['documentType']) || {
        type: 'other',
        purpose: 'unknown',
        details: 'No document type identified',
      },
    governance: parsed.governance as CorporateAnalysisOutput['governance'],
    compliance: parsed.compliance as CorporateAnalysisOutput['compliance'],
    entityInfo: parsed.entityInfo as CorporateAnalysisOutput['entityInfo'],
    riskFlags: (parsed.riskFlags as CorporateAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Corporate analysis completed',
  };
}

function createFallbackAnalysis(responseText: string): CorporateAnalysisOutput {
  return {
    documentType: {
      type: 'other',
      purpose: 'unknown',
      details: 'Could not parse document type',
    },
    riskFlags: [
      {
        flag: 'analysis-incomplete',
        severity: 'medium',
        description: 'Could not fully parse corporate analysis.',
        recommendation: 'Review document manually.',
      },
    ],
    confidence: 0.5,
    summary: responseText.slice(0, 500),
  };
}

function applyPlaybookRules(
  analysis: CorporateAnalysisOutput,
): CorporateAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag missing quorum
  if (analysis.governance?.quorum && analysis.governance.quorum.met === false) {
    existingFlags.push({
      flag: 'quorum-not-met',
      severity: 'critical',
      description: `Required quorum of ${analysis.governance.quorum.required} was not met.`,
      recommendation:
        'Meeting may be invalid. Reconvene with proper quorum or obtain written consent.',
    });
  }

  // Rule 2: Flag upcoming deadlines
  if (analysis.compliance?.filingDeadlines) {
    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    for (const deadline of analysis.compliance.filingDeadlines) {
      if (deadline.status === 'upcoming') {
        const deadlineDate = new Date(deadline.deadline);
        if (deadlineDate <= thirtyDaysFromNow) {
          existingFlags.push({
            flag: 'upcoming-filing-deadline',
            severity: 'high',
            description: `Filing deadline approaching: ${deadline.requirement} due ${deadline.deadline}`,
            recommendation:
              'Schedule filing preparation immediately to meet deadline.',
          });
        }
      } else if (deadline.status === 'overdue') {
        existingFlags.push({
          flag: 'overdue-filing',
          severity: 'critical',
          description: `Overdue filing: ${deadline.requirement} was due ${deadline.deadline}`,
          recommendation:
            'File immediately to avoid penalties. Consider filing late filing disclosure.',
        });
      }
    }
  }

  // Rule 3: Flag failed votes
  if (
    analysis.governance?.votingResults &&
    analysis.governance.votingResults.passed === false
  ) {
    existingFlags.push({
      flag: 'motion-failed',
      severity: 'high',
      description: `Motion did not achieve required ${analysis.governance.votingResults.required} vote threshold.`,
      recommendation:
        'Action was not approved. Consider revising proposal or seeking additional support.',
    });
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}
