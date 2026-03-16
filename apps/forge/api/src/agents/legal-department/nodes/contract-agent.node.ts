import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';

const AGENT_SLUG = 'legal-department';

/**
 * Contract Analysis Output Interface
 *
 * Structured output from the contract specialist agent.
 * Used for NDA analysis and other contract types.
 */
export interface ContractAnalysisOutput {
  /** Extracted key clauses */
  clauses: {
    /** Contract term/duration */
    term?: {
      duration: string;
      startDate?: string;
      endDate?: string;
      renewalTerms?: string;
    };
    /** Confidentiality provisions */
    confidentiality?: {
      period: string;
      scope: string;
      exceptions?: string[];
    };
    /** Governing law and jurisdiction */
    governingLaw?: {
      jurisdiction: string;
      disputeResolution?: string;
    };
    /** Termination provisions */
    termination?: {
      forCause: string;
      forConvenience?: string;
      noticePeriod?: string;
    };
    /** Indemnification clauses */
    indemnification?: {
      scope: string;
      limitations?: string;
    };
    /** Limitation of liability */
    liabilityLimitation?: {
      cap?: string;
      exclusions?: string[];
    };
  };
  /** Risk flags identified by playbook rules */
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  /** Contract type classification */
  contractType: {
    type: 'nda' | 'msa' | 'sla' | 'employment' | 'license' | 'other';
    subtype?: string;
    isMutual: boolean;
  };
  /** Overall confidence in analysis */
  confidence: number;
  /** Brief summary */
  summary: string;
}

/**
 * Contract Agent Node - M2 Specialist
 *
 * Purpose: Analyze contract/NDA documents and extract key terms.
 *
 * This specialist node:
 * 1. Receives document text and legal metadata from state
 * 2. Calls LLM with structured output prompt for contract analysis
 * 3. Applies hardcoded playbook rules (flag one-sided, flag term > 5 years)
 * 4. Returns structured analysis in specialistOutputs.contract
 *
 * Follows M2 architecture principles:
 * - ONE LLM CALL with structured JSON output
 * - Simple playbook rules (hardcoded, not database)
 * - Demo-grade, not production
 */
export function createContractAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function contractAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Contract Agent: Analyzing document',
      { step: 'contract_agent', progress: 60 },
    );

    try {
      // Get document text - from documents array or extract from metadata
      const documentText = getDocumentText(state);

      if (!documentText) {
        return {
          error: 'No document content available for contract analysis',
          status: 'failed',
        };
      }

      // Build the analysis prompt
      const systemMessage = buildContractAnalysisPrompt();
      const userMessage = buildUserMessage(documentText, state);

      // Single LLM call with structured output request
      const response = await llmClient.callLLM({
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:contract-agent`,
        temperature: 0.3, // Lower temperature for structured extraction
        maxTokens: 3000,
      });

      // Parse LLM response as JSON
      let analysis: ContractAnalysisOutput;
      try {
        analysis = parseContractAnalysis(response.text);
      } catch {
        // If parsing fails, create a basic analysis from the text response
        analysis = createFallbackAnalysis(response.text);
      }

      // Apply hardcoded playbook rules
      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Contract Agent: Analysis complete',
        { step: 'contract_agent_complete', progress: 80 },
      );

      // Return analysis in specialistOutputs
      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          contract: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Contract Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Contract Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

/**
 * Get document text from state
 */
function getDocumentText(state: LegalDepartmentState): string | undefined {
  // First try documents array
  if (state.documents && state.documents.length > 0) {
    return state.documents[0]!.content;
  }

  // Fall back to extracting sections from legal metadata
  if (state.legalMetadata?.sections?.sections) {
    return state.legalMetadata.sections.sections
      .map((s) => s.content)
      .join('\n\n');
  }

  return undefined;
}

/**
 * Build the system prompt for contract analysis
 */
function buildContractAnalysisPrompt(): string {
  return `You are a Contract Analysis Specialist AI. Your task is to analyze legal contracts and NDAs.

INSTRUCTIONS:
1. Extract key contract terms and clauses
2. Identify the contract type (NDA, MSA, SLA, etc.)
3. Determine if the agreement is mutual or one-sided
4. Extract term/duration, confidentiality period, and governing law
5. Flag any concerning clauses or unusual terms

OUTPUT FORMAT:
Respond with a JSON object in EXACTLY this format:
{
  "clauses": {
    "term": {
      "duration": "string describing duration (e.g., '2 years', 'perpetual')",
      "startDate": "if specified",
      "endDate": "if specified",
      "renewalTerms": "auto-renewal terms if any"
    },
    "confidentiality": {
      "period": "duration of confidentiality obligation",
      "scope": "what information is covered",
      "exceptions": ["list of exceptions"]
    },
    "governingLaw": {
      "jurisdiction": "state/country governing the contract",
      "disputeResolution": "arbitration, litigation, etc."
    },
    "termination": {
      "forCause": "termination for cause provisions",
      "forConvenience": "termination for convenience if allowed",
      "noticePeriod": "required notice period"
    }
  },
  "contractType": {
    "type": "nda|msa|sla|employment|license|other",
    "subtype": "mutual-nda, unilateral-nda, etc.",
    "isMutual": true/false
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
  "summary": "2-3 sentence summary of the contract"
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
  let message = `Analyze the following contract document:\n\n${documentText}`;

  // Add metadata context if available
  if (state.legalMetadata) {
    const metadata = state.legalMetadata;
    message += `\n\n---\nDocument Metadata:`;
    message += `\n- Document Type: ${metadata.documentType.type} (${(metadata.documentType.confidence * 100).toFixed(0)}% confidence)`;

    if (metadata.parties.contractingParties) {
      const [party1, party2] = metadata.parties.contractingParties;
      const names = [party1?.name, party2?.name].filter(Boolean);
      if (names.length > 0) {
        message += `\n- Contracting Parties: ${names.join(' and ')}`;
      }
    }

    if (metadata.dates.primaryDate) {
      message += `\n- Primary Date: ${metadata.dates.primaryDate.normalizedDate}`;
    }
  }

  // Add user's original question if relevant
  if (state.userMessage && state.userMessage.toLowerCase() !== 'analyze') {
    message += `\n\n---\nUser Request: ${state.userMessage}`;
  }

  return message;
}

/**
 * Parse LLM response as ContractAnalysisOutput
 */
function parseContractAnalysis(responseText: string): ContractAnalysisOutput {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  // Validate required fields
  if (!parsed.clauses || !parsed.contractType || !parsed.summary) {
    throw new Error('Missing required fields in analysis');
  }

  return {
    clauses: (parsed.clauses as ContractAnalysisOutput['clauses']) || {},
    riskFlags: (parsed.riskFlags as ContractAnalysisOutput['riskFlags']) || [],
    contractType: parsed.contractType as ContractAnalysisOutput['contractType'],
    confidence: (parsed.confidence as number) || 0.7,
    summary: parsed.summary as string,
  };
}

/**
 * Create fallback analysis when JSON parsing fails
 */
function createFallbackAnalysis(responseText: string): ContractAnalysisOutput {
  return {
    clauses: {},
    riskFlags: [
      {
        flag: 'analysis-incomplete',
        severity: 'medium',
        description:
          'Could not fully parse contract analysis. Manual review recommended.',
        recommendation: 'Review the contract manually for key terms.',
      },
    ],
    contractType: {
      type: 'other',
      isMutual: false,
    },
    confidence: 0.5,
    summary: responseText.slice(0, 500),
  };
}

/**
 * Apply hardcoded playbook rules to the analysis
 *
 * M2 Playbook Rules:
 * 1. Flag if one-sided agreement
 * 2. Flag if term > 5 years
 * 3. Flag if no governing law specified
 * 4. Flag perpetual confidentiality
 */
function applyPlaybookRules(
  analysis: ContractAnalysisOutput,
): ContractAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag one-sided agreements
  if (!analysis.contractType.isMutual) {
    existingFlags.push({
      flag: 'one-sided-agreement',
      severity: 'medium',
      description:
        'This is a unilateral/one-sided agreement. Only one party has obligations.',
      recommendation:
        'Consider negotiating mutual obligations if appropriate for the business relationship.',
    });
  }

  // Rule 2: Flag term > 5 years
  if (analysis.clauses.term?.duration) {
    const duration = analysis.clauses.term.duration.toLowerCase();
    const yearsMatch = duration.match(/(\d+)\s*year/);
    if (yearsMatch) {
      const years = parseInt(yearsMatch[1]!, 10);
      if (years > 5) {
        existingFlags.push({
          flag: 'long-term-commitment',
          severity: 'high',
          description: `Contract term of ${years} years exceeds recommended 5-year maximum.`,
          recommendation:
            'Consider negotiating a shorter initial term with renewal options.',
        });
      }
    }
    if (duration.includes('perpetual') || duration.includes('indefinite')) {
      existingFlags.push({
        flag: 'perpetual-term',
        severity: 'high',
        description: 'Contract has perpetual/indefinite term.',
        recommendation:
          'Perpetual terms are unusual. Ensure termination provisions are adequate.',
      });
    }
  }

  // Rule 3: Flag missing governing law
  if (!analysis.clauses.governingLaw?.jurisdiction) {
    existingFlags.push({
      flag: 'no-governing-law',
      severity: 'medium',
      description: 'No governing law or jurisdiction specified.',
      recommendation:
        'Add governing law clause to avoid disputes over applicable law.',
    });
  }

  // Rule 4: Flag perpetual confidentiality
  if (analysis.clauses.confidentiality?.period) {
    const period = analysis.clauses.confidentiality.period.toLowerCase();
    if (
      period.includes('perpetual') ||
      period.includes('indefinite') ||
      period.includes('forever')
    ) {
      existingFlags.push({
        flag: 'perpetual-confidentiality',
        severity: 'medium',
        description: 'Confidentiality obligations are perpetual.',
        recommendation:
          'Consider limiting confidentiality period to 3-5 years for standard business information.',
      });
    }
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}
