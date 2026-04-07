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

export interface RealEstateAnalysisOutput {
  /** Property information */
  propertyInfo: {
    /** Property address */
    address?: string;
    /** Property description */
    description?: string;
    /** Property type */
    propertyType?:
      | 'commercial'
      | 'residential'
      | 'industrial'
      | 'land'
      | 'mixed-use'
      | 'other';
    /** Legal description */
    legalDescription?: string;
    details: string;
  };
  /** Lease terms (if lease document) */
  leaseTerms?: {
    /** Landlord */
    landlord?: string;
    /** Tenant */
    tenant?: string;
    /** Term/duration */
    term?: string;
    /** Rent amount */
    rent?: {
      baseRent: string;
      escalations?: string;
      additionalCharges?: string[];
    };
    /** Permitted use */
    permittedUse?: string;
    /** Renewal options */
    renewalOptions?: string;
    /** Security deposit */
    securityDeposit?: string;
    details: string;
  };
  /** Title issues (if title document) */
  titleIssues?: {
    /** Exceptions */
    exceptions: Array<{
      type: string;
      description: string;
      requiresAction: boolean;
    }>;
    /** Encumbrances */
    encumbrances: Array<{
      type: string;
      description: string;
      amount?: string;
    }>;
    /** Clear title */
    clearTitle: boolean;
    details: string;
  };
  /** Representations and warranties */
  warranties?: {
    propertyCondition?: string;
    environmentalCompliance?: string;
    zoningCompliance?: string;
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
 * Real Estate Agent Node - M10 Specialist
 *
 * Purpose: Analyze leases, purchase agreements, and title documents.
 *
 * M10 Playbook Rules:
 * - Flag title exceptions requiring action
 * - Flag missing property insurance requirements
 * - Flag unusual lease terms (e.g., > 20 year commercial lease)
 */
export function createRealEstateAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  ragService?: RagStorageService,
) {
  return async function realEstateAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Real Estate Agent: Analyzing property document',
      { step: 'real_estate_agent', progress: 40 },
    );

    try {
      const documentText = getDocumentText(state);
      if (!documentText) {
        return {
          error: 'No document content available for real estate analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context
      const ragContext = await queryCollectionForContext(
        ragService,
        ctx.orgSlug,
        'law-estate-planning-attributed',
        documentText,
      );

      const systemMessage = buildRealEstateAnalysisPrompt();

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Real Estate Agent: calling LLM for analysis...',
        { step: 'real_estate_agent_llm_call', progress: 45 },
      );

      let analysis: RealEstateAnalysisOutput;
      try {
        const run = await runSpecialistOverDocument<RealEstateAnalysisOutput>({
          llmClient,
          observability,
          state,
          documentText,
          systemMessage,
          callerName: `${AGENT_SLUG}:real-estate-agent`,
          temperature: 0.3,
          maxTokens: 3000,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`;
            }
            return msg;
          },
          parse: parseRealEstateAnalysis,
          merge: mergeRealEstateAnalyses,
          progressLabel: 'Real Estate Agent',
          progressStepPrefix: 'real_estate_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Real Estate Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Real Estate Agent: Analysis complete',
        { step: 'real_estate_agent_complete', progress: 60 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          realEstate: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Real Estate Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Real Estate Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

function buildRealEstateAnalysisPrompt(): string {
  return `You are a Real Estate Law Specialist AI. Analyze leases, purchase agreements, deeds, and title documents.

INSTRUCTIONS:
1. Extract property information (address, type, legal description)
2. For leases: Extract term, rent, permitted use, renewal options
3. For title documents: Identify exceptions, encumbrances, liens
4. Review warranties (property condition, environmental, zoning)
5. Flag any unusual terms or title issues requiring action

OUTPUT FORMAT (JSON only):
{
  "propertyInfo": {
    "address": "property address",
    "description": "property description",
    "propertyType": "commercial|residential|industrial|land|mixed-use|other",
    "legalDescription": "legal description if available",
    "details": "property details"
  },
  "leaseTerms": {
    "landlord": "landlord name",
    "tenant": "tenant name",
    "term": "lease duration",
    "rent": {
      "baseRent": "rent amount",
      "escalations": "rent escalation provisions",
      "additionalCharges": ["list of additional charges"]
    },
    "permittedUse": "permitted use description",
    "renewalOptions": "renewal terms",
    "securityDeposit": "security deposit amount",
    "details": "lease terms analysis"
  },
  "titleIssues": {
    "exceptions": [
      {
        "type": "easement|lien|covenant|other",
        "description": "exception description",
        "requiresAction": true/false
      }
    ],
    "encumbrances": [
      {
        "type": "mortgage|lien|judgment|other",
        "description": "encumbrance description",
        "amount": "amount if applicable"
      }
    ],
    "clearTitle": true/false,
    "details": "title analysis"
  },
  "warranties": {
    "propertyCondition": "condition warranties",
    "environmentalCompliance": "environmental warranties",
    "zoningCompliance": "zoning compliance",
    "details": "warranty analysis"
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
  return `Analyze real estate document:\n\n${buildBaseUserMessage(documentText, state)}`;
}

function parseRealEstateAnalysis(
  responseText: string,
): RealEstateAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    propertyInfo:
      (parsed.propertyInfo as RealEstateAnalysisOutput['propertyInfo']) || {
        details: 'No property information found',
      },
    leaseTerms: parsed.leaseTerms as RealEstateAnalysisOutput['leaseTerms'],
    titleIssues: parsed.titleIssues as RealEstateAnalysisOutput['titleIssues'],
    warranties: parsed.warranties as RealEstateAnalysisOutput['warranties'],
    riskFlags:
      (parsed.riskFlags as RealEstateAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Real estate analysis completed',
  };
}

function applyPlaybookRules(
  analysis: RealEstateAnalysisOutput,
): RealEstateAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag title exceptions requiring action
  if (analysis.titleIssues?.exceptions) {
    const actionableExceptions = analysis.titleIssues.exceptions.filter(
      (e) => e.requiresAction,
    );
    for (const exception of actionableExceptions) {
      existingFlags.push({
        flag: 'title-exception-requires-action',
        severity: 'high',
        description: `Title exception requires attention: ${exception.description}`,
        recommendation:
          'Address this title exception before closing. May require cure, insurance, or acceptance.',
      });
    }
  }

  // Rule 2: Flag unclear title
  if (analysis.titleIssues && analysis.titleIssues.clearTitle === false) {
    existingFlags.push({
      flag: 'unclear-title',
      severity: 'critical',
      description:
        'Title is not clear. Multiple exceptions or encumbrances identified.',
      recommendation:
        'Obtain title insurance. Review all exceptions with title company. May require cure before closing.',
    });
  }

  // Rule 3: Flag long commercial leases
  if (analysis.leaseTerms?.term) {
    const term = analysis.leaseTerms.term.toLowerCase();
    const yearsMatch = term.match(/(\d+)\s*year/);
    if (yearsMatch && parseInt(yearsMatch[1]!, 10) > 20) {
      existingFlags.push({
        flag: 'unusually-long-lease',
        severity: 'medium',
        description: `Lease term of ${yearsMatch[1]} years is unusually long for commercial property.`,
        recommendation:
          'Ensure flexibility provisions (subleasing, assignment, termination) are adequate for such a long commitment.',
      });
    }
  }

  // Rule 4: Flag missing insurance requirements
  const hasInsuranceReqs = analysis.leaseTerms?.details
    ?.toLowerCase()
    .includes('insurance');
  if (analysis.leaseTerms && !hasInsuranceReqs) {
    existingFlags.push({
      flag: 'missing-insurance-requirements',
      severity: 'medium',
      description: 'Lease does not clearly specify insurance requirements.',
      recommendation:
        'Add provisions for property insurance, liability insurance, and loss payee requirements.',
    });
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}

/**
 * Merge real-estate analyses from chunked LLM calls.
 *
 * Merge rules:
 *  - propertyInfo: take first chunk's (document-level address/type).
 *  - leaseTerms / warranties: first chunk that has them.
 *  - titleIssues: union exceptions/encumbrances; clearTitle = AND across chunks.
 *  - riskFlags: dedupe by `flag` (first occurrence wins).
 *  - confidence: minimum across chunks.
 *  - summary: join non-empty chunk summaries.
 */
function mergeRealEstateAnalyses(
  results: RealEstateAnalysisOutput[],
): RealEstateAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const exceptions: NonNullable<
    RealEstateAnalysisOutput['titleIssues']
  >['exceptions'] = [];
  const encumbrances: NonNullable<
    RealEstateAnalysisOutput['titleIssues']
  >['encumbrances'] = [];
  const seenEx = new Set<string>();
  const seenEnc = new Set<string>();
  let clearTitle = true;
  let titleSeen = false;
  const titleDetails: string[] = [];
  for (const r of results) {
    if (!r.titleIssues) continue;
    titleSeen = true;
    if (!r.titleIssues.clearTitle) clearTitle = false;
    for (const ex of r.titleIssues.exceptions ?? []) {
      const k = `${ex.type}|${ex.description}`;
      if (seenEx.has(k)) continue;
      seenEx.add(k);
      exceptions.push(ex);
    }
    for (const en of r.titleIssues.encumbrances ?? []) {
      const k = `${en.type}|${en.description}`;
      if (seenEnc.has(k)) continue;
      seenEnc.add(k);
      encumbrances.push(en);
    }
    if (r.titleIssues.details) titleDetails.push(r.titleIssues.details);
  }
  const seen = new Set<string>();
  const riskFlags: RealEstateAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      riskFlags.push(f);
    }
  }
  return {
    propertyInfo: results[0]!.propertyInfo,
    leaseTerms: results.find((r) => r.leaseTerms)?.leaseTerms,
    titleIssues: titleSeen
      ? {
          exceptions,
          encumbrances,
          clearTitle,
          details: titleDetails.join(' | '),
        }
      : undefined,
    warranties: results.find((r) => r.warranties)?.warranties,
    riskFlags,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
