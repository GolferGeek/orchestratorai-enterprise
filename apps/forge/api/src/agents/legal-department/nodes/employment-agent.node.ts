import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import {
  enumerateDocuments,
  stripMarkdownFences,
  buildBaseUserMessage,
  queryCollectionForContext,
  runSpecialistOverDocuments,
} from './specialist-utils';

const AGENT_SLUG = 'legal-department';

export interface EmploymentAnalysisOutput {
  /** Employment terms */
  employmentTerms: {
    /** Employment type */
    type: 'at-will' | 'fixed-term' | 'contractor' | 'other';
    /** Position/title */
    position?: string;
    /** Compensation */
    compensation?: {
      salary?: string;
      bonus?: string;
      equity?: string;
      benefits?: string[];
    };
    /** Start date */
    startDate?: string;
    /** Employment duration (if fixed-term) */
    duration?: string;
    details: string;
  };
  /** Restrictive covenants */
  restrictiveCovenants?: {
    /** Non-compete clause */
    nonCompete?: {
      exists: boolean;
      duration?: string;
      territory?: string;
      enforceable: boolean;
      details: string;
    };
    /** Non-solicitation clause */
    nonSolicitation?: {
      exists: boolean;
      scope?: string;
      duration?: string;
      details: string;
    };
    /** Confidentiality */
    confidentiality?: {
      exists: boolean;
      duration?: string;
      details: string;
    };
  };
  /** Termination provisions */
  termination?: {
    /** For cause termination */
    forCause?: string;
    /** Notice period */
    noticePeriod?: string;
    /** Severance */
    severance?: string;
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
 * Employment Agent Node - M7 Specialist
 *
 * Purpose: Analyze employment agreements, offer letters, and HR documents.
 *
 * M7 Playbook Rules:
 * - Flag non-competes in California (unenforceable)
 * - Flag missing at-will language
 * - Flag overly broad restrictive covenants
 */
export function createEmploymentAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  ragService?: RagStorageService,
) {
  return async function employmentAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Employment Agent: Analyzing employment terms',
      { step: 'employment_agent', progress: 40 },
    );

    try {
      const documents = enumerateDocuments(state);
      if (documents.length === 0) {
        return {
          error: 'No document content available for employment analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context
      const ragContext = await queryCollectionForContext(
        ragService,
        ctx.orgSlug,
        'law-contracts-hybrid',
        documents[0]!.content,
      );

      const systemMessage = buildEmploymentAnalysisPrompt();

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Employment Agent: calling LLM for analysis...',
        { step: 'employment_agent_llm_call', progress: 45 },
      );

      let analysis: EmploymentAnalysisOutput;
      try {
        const run = await runSpecialistOverDocuments<EmploymentAnalysisOutput>({
          llmClient,
          observability,
          state,
          documents,
          systemMessage,
          callerName: `${AGENT_SLUG}:employment-agent`,
          temperature: 0.3,
          maxTokens: 3000,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`;
            }
            return msg;
          },
          parse: parseEmploymentAnalysis,
          merge: mergeEmploymentAnalyses,
          progressLabel: 'Employment Agent',
          progressStepPrefix: 'employment_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Employment Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      analysis = applyPlaybookRules(analysis, state);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Employment Agent: Analysis complete',
        { step: 'employment_agent_complete', progress: 60 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          employment: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Employment Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Employment Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

function buildEmploymentAnalysisPrompt(): string {
  return `You are an Employment Law Specialist AI. Analyze employment agreements, offer letters, and restrictive covenants.

INSTRUCTIONS:
1. Extract employment type (at-will, fixed-term, contractor)
2. Identify compensation and benefits
3. Analyze restrictive covenants (non-compete, non-solicitation, confidentiality)
4. Check enforceability (especially for California non-competes)
5. Review termination provisions

OUTPUT FORMAT (JSON only):
{
  "employmentTerms": {
    "type": "at-will|fixed-term|contractor|other",
    "position": "job title",
    "compensation": {
      "salary": "amount",
      "bonus": "bonus structure",
      "equity": "equity/stock options",
      "benefits": ["list of benefits"]
    },
    "startDate": "start date",
    "duration": "if fixed-term",
    "details": "employment terms analysis"
  },
  "restrictiveCovenants": {
    "nonCompete": {
      "exists": true/false,
      "duration": "time period",
      "territory": "geographic scope",
      "enforceable": true/false,
      "details": "non-compete analysis"
    },
    "nonSolicitation": {
      "exists": true/false,
      "scope": "customers|employees|both",
      "duration": "time period",
      "details": "non-solicitation analysis"
    },
    "confidentiality": {
      "exists": true/false,
      "duration": "time period",
      "details": "confidentiality analysis"
    }
  },
  "termination": {
    "forCause": "termination for cause provisions",
    "noticePeriod": "notice period required",
    "severance": "severance provisions",
    "details": "termination analysis"
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
  return `Analyze employment provisions:\n\n${buildBaseUserMessage(documentText, state)}`;
}

function parseEmploymentAnalysis(
  responseText: string,
): EmploymentAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  // Normalize riskFlags to ensure consistent structure
  const normalizedRiskFlags = normalizeRiskFlags(
    (parsed.riskFlags as unknown[]) || [],
  );

  return {
    employmentTerms:
      (parsed.employmentTerms as EmploymentAnalysisOutput['employmentTerms']) || {
        type: 'other',
        details: 'No employment terms found',
      },
    restrictiveCovenants:
      parsed.restrictiveCovenants as EmploymentAnalysisOutput['restrictiveCovenants'],
    termination: parsed.termination as EmploymentAnalysisOutput['termination'],
    riskFlags: normalizedRiskFlags,
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Employment analysis completed',
  };
}

/**
 * Normalize risk flags to ensure consistent structure
 * Handles various LLM output formats
 */
function normalizeRiskFlags(flags: unknown[]): Array<{
  flag: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation?: string;
}> {
  if (!Array.isArray(flags)) return [];

  return flags.map((item, index) => {
    // If it's a string, convert to proper structure
    if (typeof item === 'string') {
      return {
        flag: item.toLowerCase().replace(/\s+/g, '-'),
        severity: 'medium' as const,
        description: item,
      };
    }

    // If it's an object, normalize the properties
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;

      // Get flag name from various possible property names
      const flagName =
        (obj.flag as string) ||
        (obj.name as string) ||
        (obj.title as string) ||
        (obj.issue as string) ||
        (obj.risk as string) ||
        `risk-${index + 1}`;

      // Get severity with fallback
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (obj.severity && typeof obj.severity === 'string') {
        const sev = obj.severity.toLowerCase();
        if (['low', 'medium', 'high', 'critical'].includes(sev)) {
          severity = sev as 'low' | 'medium' | 'high' | 'critical';
        }
      }

      // Get description from various possible property names
      const description =
        (obj.description as string) ||
        (obj.details as string) ||
        (obj.message as string) ||
        flagName;

      return {
        flag: flagName.toLowerCase().replace(/\s+/g, '-'),
        severity,
        description,
        recommendation: obj.recommendation as string | undefined,
      };
    }

    // Fallback for unknown types
    return {
      flag: `unknown-risk-${index + 1}`,
      severity: 'medium' as const,
      description: String(item),
    };
  });
}

function applyPlaybookRules(
  analysis: EmploymentAnalysisOutput,
  state: LegalDepartmentState,
): EmploymentAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Combined text of all documents for keyword checks.
  const allDocText = (state.documents ?? [])
    .map((d) => d.content)
    .join('\n\n')
    .toLowerCase();

  // Rule 1: Flag California non-competes (unenforceable)
  if (analysis.restrictiveCovenants?.nonCompete?.exists) {
    const docText = allDocText;

    if (docText.includes('california') || docText.includes(' ca ')) {
      existingFlags.push({
        flag: 'california-non-compete',
        severity: 'critical',
        description:
          'Non-compete clauses are generally unenforceable in California (except for sale of business).',
        recommendation:
          'Remove non-compete clause or limit to trade secret protection only.',
      });
    }
  }

  // Rule 2: Flag missing at-will language
  if (
    analysis.employmentTerms.type === 'at-will' ||
    !analysis.employmentTerms.type
  ) {
    const docText = allDocText;

    if (!docText.includes('at-will') && !docText.includes('at will')) {
      existingFlags.push({
        flag: 'missing-at-will-language',
        severity: 'high',
        description: 'At-will employment language is not clearly stated.',
        recommendation:
          'Add clear at-will employment clause to avoid implied contract claims.',
      });
    }
  }

  // Rule 3: Flag overly broad restrictive covenants
  if (analysis.restrictiveCovenants?.nonCompete?.exists) {
    const duration =
      analysis.restrictiveCovenants.nonCompete.duration?.toLowerCase() || '';
    const yearsMatch = duration.match(/(\d+)\s*year/);
    if (yearsMatch && parseInt(yearsMatch[1]!, 10) > 2) {
      existingFlags.push({
        flag: 'overly-broad-non-compete',
        severity: 'medium',
        description: `Non-compete duration of ${yearsMatch[1]} years may be unenforceable as overly broad.`,
        recommendation:
          'Consider limiting non-compete to 1-2 years for better enforceability.',
      });
    }
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}

/**
 * Merge employment analyses from chunked LLM calls.
 *
 * Merge rules:
 *  - employmentTerms: take first chunk's (document-level role/comp).
 *  - restrictiveCovenants / termination: first chunk that has them.
 *  - riskFlags: dedupe by `flag` (first occurrence wins).
 *  - confidence: minimum across chunks.
 *  - summary: join non-empty chunk summaries.
 */
function mergeEmploymentAnalyses(
  results: EmploymentAnalysisOutput[],
): EmploymentAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const seen = new Set<string>();
  const riskFlags: EmploymentAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      riskFlags.push(f);
    }
  }
  return {
    employmentTerms: results[0]!.employmentTerms,
    restrictiveCovenants: results.find((r) => r.restrictiveCovenants)
      ?.restrictiveCovenants,
    termination: results.find((r) => r.termination)?.termination,
    riskFlags,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
