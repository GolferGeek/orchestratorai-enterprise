import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import {
  getDocumentText,
  stripMarkdownFences,
  buildBaseUserMessage,
  queryCollectionForContext,
} from './specialist-utils';

const AGENT_SLUG = 'legal-department';

/**
 * Compliance Analysis Output Interface
 *
 * Structured output from the compliance specialist agent.
 * Used for policy checks, regulatory compliance, and term limit analysis.
 */
export interface ComplianceAnalysisOutput {
  /** Policy compliance checks */
  policyChecks: {
    /** Term limit compliance */
    termLimit?: {
      contractTerm: string;
      maxAllowedTerm: string;
      compliant: boolean;
      details: string;
    };
    /** Jurisdiction compliance */
    jurisdiction?: {
      contractJurisdiction: string;
      allowedJurisdictions: string[];
      compliant: boolean;
      details: string;
    };
    /** Approval authority */
    approvalAuthority?: {
      contractValue?: string;
      requiredApprover: string;
      details: string;
    };
    /** Other policy checks */
    otherChecks?: Array<{
      policyName: string;
      compliant: boolean;
      details: string;
    }>;
  };
  /** Regulatory compliance */
  regulatoryCompliance: {
    /** Applicable regulations */
    regulations: string[];
    /** Compliance status */
    status:
      | 'compliant'
      | 'non-compliant'
      | 'review-required'
      | 'not-applicable';
    /** Details */
    details: string;
  };
  /** Risk flags identified by playbook rules */
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  /** Overall confidence in analysis */
  confidence: number;
  /** Brief summary */
  summary: string;
}

/**
 * Compliance Agent Node - M4 Specialist
 *
 * Purpose: Check documents against firm policies and regulatory requirements.
 *
 * This specialist node:
 * 1. Receives document text and legal metadata from state
 * 2. Calls LLM with structured output prompt for compliance analysis
 * 3. Applies hardcoded playbook rules (flag term > 5 years, flag non-US jurisdiction)
 * 4. Returns structured analysis in specialistOutputs.compliance
 *
 * Follows M2 architecture principles:
 * - ONE LLM CALL with structured JSON output
 * - Simple playbook rules (hardcoded, not database)
 * - Demo-grade, not production
 */
export function createComplianceAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  ragService?: RagStorageService,
) {
  return async function complianceAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Compliance Agent: Analyzing policy compliance',
      { step: 'compliance_agent', progress: 40 },
    );

    try {
      // Get document text
      const documentText = getDocumentText(state);

      if (!documentText) {
        return {
          error: 'No document content available for compliance analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context
      const ragContext = await queryCollectionForContext(
        ragService,
        ctx.orgSlug,
        'law-firm-policies-attributed',
        documentText,
      );

      // Build the analysis prompt
      const systemMessage = buildComplianceAnalysisPrompt();
      let userMessage = buildUserMessage(documentText, state);
      if (ragContext) {
        userMessage += `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`;
      }

      // Single LLM call with structured output request
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Compliance Agent: calling LLM for analysis...',
        { step: 'compliance_agent_llm_call', progress: 45 },
      );
      const response = await llmClient.callLLM({
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:compliance-agent`,
        temperature: 0.3,
        maxTokens: 3000,
      });

      // Parse LLM response as JSON
      let analysis: ComplianceAnalysisOutput;
      try {
        analysis = parseComplianceAnalysis(response.text);
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Compliance Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      // Apply hardcoded playbook rules
      analysis = applyPlaybookRules(analysis, state);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Compliance Agent: Analysis complete',
        { step: 'compliance_agent_complete', progress: 60 },
      );

      // Return analysis in specialistOutputs
      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          compliance: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Compliance Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Compliance Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

/**
 * Build the system prompt for compliance analysis
 */
function buildComplianceAnalysisPrompt(): string {
  return `You are a Compliance Analysis Specialist AI. Your task is to check legal documents against firm policies and regulatory requirements.

INSTRUCTIONS:
1. Extract contract term/duration
2. Identify jurisdiction and governing law
3. Check against standard firm policies (5-year term limit, US jurisdiction preferred)
4. Identify applicable regulations (GDPR, CCPA, SOX, etc.)
5. Flag any policy violations or compliance concerns

FIRM POLICIES (for this demo):
- Maximum contract term: 5 years
- Preferred jurisdictions: US states (Delaware, New York, California)
- Non-US jurisdictions require additional review

OUTPUT FORMAT:
Respond with a JSON object in EXACTLY this format:
{
  "policyChecks": {
    "termLimit": {
      "contractTerm": "extracted term (e.g., '3 years', 'perpetual')",
      "maxAllowedTerm": "5 years",
      "compliant": true/false,
      "details": "explanation"
    },
    "jurisdiction": {
      "contractJurisdiction": "extracted jurisdiction",
      "allowedJurisdictions": ["Delaware", "New York", "California"],
      "compliant": true/false,
      "details": "explanation"
    },
    "approvalAuthority": {
      "contractValue": "if monetary value mentioned",
      "requiredApprover": "CFO/CEO/Legal based on value",
      "details": "approval requirements"
    }
  },
  "regulatoryCompliance": {
    "regulations": ["list of applicable regulations"],
    "status": "compliant|non-compliant|review-required|not-applicable",
    "details": "compliance assessment"
  },
  "riskFlags": [
    {
      "flag": "short name of the risk",
      "severity": "low|medium|high|critical",
      "description": "detailed description",
      "recommendation": "suggested action"
    }
  ],
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence summary of compliance status"
}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.`;
}

/**
 * Build user message with document context
 */
function buildUserMessage(
  documentText: string,
  state: LegalDepartmentState,
): string {
  return `Analyze the following document for policy compliance:\n\n${buildBaseUserMessage(documentText, state)}`;
}

/**
 * Parse LLM response as ComplianceAnalysisOutput
 */
function parseComplianceAnalysis(
  responseText: string,
): ComplianceAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    policyChecks:
      (parsed.policyChecks as ComplianceAnalysisOutput['policyChecks']) || {},
    regulatoryCompliance:
      (parsed.regulatoryCompliance as ComplianceAnalysisOutput['regulatoryCompliance']) || {
        regulations: [],
        status: 'not-applicable',
        details: 'No regulatory requirements identified',
      },
    riskFlags:
      (parsed.riskFlags as ComplianceAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Compliance analysis completed',
  };
}

/**
 * Apply hardcoded playbook rules to the analysis
 *
 * M4 Playbook Rules:
 * 1. Flag if term > 5 years
 * 2. Flag if non-US jurisdiction
 * 3. Flag if no jurisdiction specified
 */
function applyPlaybookRules(
  analysis: ComplianceAnalysisOutput,
  _state: LegalDepartmentState,
): ComplianceAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag term > 5 years
  if (analysis.policyChecks.termLimit?.contractTerm) {
    const term = analysis.policyChecks.termLimit.contractTerm.toLowerCase();
    const yearsMatch = term.match(/(\d+)\s*year/);
    if (yearsMatch) {
      const years = parseInt(yearsMatch[1]!, 10);
      if (years > 5) {
        existingFlags.push({
          flag: 'term-limit-exceeded',
          severity: 'high',
          description: `Contract term of ${years} years exceeds firm policy maximum of 5 years.`,
          recommendation:
            'Seek approval from senior leadership or negotiate shorter term.',
        });
      }
    }
    if (term.includes('perpetual') || term.includes('indefinite')) {
      existingFlags.push({
        flag: 'perpetual-term-violation',
        severity: 'critical',
        description: 'Perpetual/indefinite term violates firm policy.',
        recommendation:
          'Must negotiate defined term or obtain executive approval.',
      });
    }
  }

  // Rule 2: Flag non-US jurisdiction
  if (analysis.policyChecks.jurisdiction?.contractJurisdiction) {
    const jurisdiction =
      analysis.policyChecks.jurisdiction.contractJurisdiction.toLowerCase();
    const usStates = [
      'delaware',
      'new york',
      'california',
      'texas',
      'florida',
      'illinois',
    ];
    const isUS = usStates.some((state) => jurisdiction.includes(state));

    if (
      !isUS &&
      !jurisdiction.includes('usa') &&
      !jurisdiction.includes('united states')
    ) {
      existingFlags.push({
        flag: 'non-us-jurisdiction',
        severity: 'medium',
        description: `Non-US jurisdiction (${analysis.policyChecks.jurisdiction.contractJurisdiction}) requires additional review.`,
        recommendation:
          'Consult with international legal counsel before approval.',
      });
    }
  }

  // Rule 3: Flag missing jurisdiction
  if (!analysis.policyChecks.jurisdiction?.contractJurisdiction) {
    existingFlags.push({
      flag: 'no-jurisdiction-specified',
      severity: 'medium',
      description: 'No jurisdiction or governing law specified.',
      recommendation:
        'Add governing law clause with preferred jurisdiction (Delaware, New York, or California).',
    });
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}
