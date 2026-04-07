import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import {
  getDocumentText,
  stripMarkdownFences,
  buildBaseUserMessage,
  queryCollectionForContext,
  runSpecialistOverDocument,
} from './specialist-utils';

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
  ragService?: RagStorageService,
) {
  return async function contractAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Contract Agent: Analyzing document',
      { step: 'contract_agent', progress: 40 },
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

      // Query RAG for relevant context
      const ragContext = await queryCollectionForContext(
        ragService,
        ctx.orgSlug,
        'law-contracts-hybrid',
        documentText,
      );

      // Build the analysis prompt
      const systemMessage = buildContractAnalysisPrompt();

      // Single LLM call with structured output request
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Contract Agent: calling LLM for analysis...',
        { step: 'contract_agent_llm_call', progress: 45 },
      );

      // Run via the chunk-aware helper. For documents that fit the
      // model's per-call budget this is exactly equivalent to a single
      // llmClient.callLLM(); for oversized documents the helper splits
      // the text, fans out one call per chunk, and merges the parsed
      // outputs through `mergeContractAnalyses` below.
      let analysis: ContractAnalysisOutput;
      try {
        const run = await runSpecialistOverDocument<ContractAnalysisOutput>({
          llmClient,
          observability,
          state,
          documentText,
          systemMessage,
          callerName: `${AGENT_SLUG}:contract-agent`,
          temperature: 0.3,
          maxTokens: 3000,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`;
            }
            return msg;
          },
          parse: parseContractAnalysis,
          merge: mergeContractAnalyses,
          progressLabel: 'Contract Agent',
          progressStepPrefix: 'contract_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Contract Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      // Apply hardcoded playbook rules
      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Contract Agent: Analysis complete',
        { step: 'contract_agent_complete', progress: 60 },
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
  return `Analyze the following contract document:\n\n${buildBaseUserMessage(documentText, state)}`;
}

/**
 * Parse LLM response as ContractAnalysisOutput
 */
function parseContractAnalysis(responseText: string): ContractAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

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

/**
 * Merge contract analyses produced from chunked LLM calls.
 *
 * Merge rules (deterministic — same inputs always produce same output):
 *  - clauses: deep-merge field-by-field. First non-empty value wins per key
 *    (chunks are processed in order, so the earliest chunk that mentions a
 *    clause keeps its extraction).
 *  - riskFlags: concat then dedupe by `flag` name (first occurrence wins).
 *  - contractType: take the first chunk's classification — the contract
 *    type is a document-level property and doesn't change between chunks.
 *  - confidence: minimum across chunks (chunked extraction is inherently
 *    less confident than a whole-doc pass; we don't want to inflate it).
 *  - summary: join non-empty chunk summaries with a separator so the
 *    reviewer can see how each segment was characterized.
 */
function mergeContractAnalyses(
  results: ContractAnalysisOutput[],
): ContractAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const mergedClauses: Record<string, unknown> = {};
  for (const r of results) {
    for (const [key, value] of Object.entries(r.clauses ?? {})) {
      if (mergedClauses[key] === undefined && value !== undefined) {
        mergedClauses[key] = value;
      }
    }
  }
  const seen = new Set<string>();
  const riskFlags: ContractAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      riskFlags.push(f);
    }
  }
  return {
    clauses: mergedClauses as ContractAnalysisOutput['clauses'],
    riskFlags,
    contractType: results[0]!.contractType,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
