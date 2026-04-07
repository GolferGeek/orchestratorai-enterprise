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
 * Privacy Analysis Output Interface
 *
 * Structured output from the privacy specialist agent.
 * Used for GDPR/CCPA compliance and data protection analysis.
 */
export interface PrivacyAnalysisOutput {
  /** Data types and handling */
  dataHandling: {
    /** Types of personal data collected */
    dataTypes: string[];
    /** Purpose of data processing */
    purposes: string[];
    /** Data retention period */
    retentionPeriod?: string;
    /** Data location/storage */
    dataLocation?: string;
    details: string;
  };
  /** GDPR compliance */
  gdprCompliance?: {
    /** Is GDPR applicable */
    applicable: boolean;
    /** Legal basis for processing */
    legalBasis?: string;
    /** Data subject rights addressed */
    dataSubjectRights?: string[];
    /** Cross-border transfer mechanisms */
    crossBorderTransfers?: {
      applicable: boolean;
      mechanism?: string; // SCCs, BCRs, adequacy decision
      details: string;
    };
    /** Compliant status */
    compliant: boolean;
    details: string;
  };
  /** CCPA compliance */
  ccpaCompliance?: {
    /** Is CCPA applicable */
    applicable: boolean;
    /** Consumer rights addressed */
    consumerRights?: string[];
    /** Do Not Sell provision */
    doNotSell?: boolean;
    /** Compliant status */
    compliant: boolean;
    details: string;
  };
  /** Security measures */
  security?: {
    measures: string[];
    adequate: boolean;
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
 * Privacy Agent Node - M6 Specialist
 *
 * Purpose: Analyze privacy and data protection provisions (GDPR/CCPA).
 *
 * M6 Playbook Rules:
 * - Flag missing SCCs for EU data transfers
 * - Flag unclear data retention periods
 * - Flag missing data subject rights provisions
 */
export function createPrivacyAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  ragService?: RagStorageService,
) {
  return async function privacyAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Privacy Agent: Analyzing data protection compliance',
      { step: 'privacy_agent', progress: 40 },
    );

    try {
      const documentText = getDocumentText(state);
      if (!documentText) {
        return {
          error: 'No document content available for privacy analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context (two collections for privacy)
      const [ragContext1, ragContext2] = await Promise.all([
        queryCollectionForContext(
          ragService,
          ctx.orgSlug,
          'law-firm-policies-attributed',
          documentText,
        ),
        queryCollectionForContext(
          ragService,
          ctx.orgSlug,
          'law-contracts-hybrid',
          documentText,
        ),
      ]);
      const ragContext = [ragContext1, ragContext2]
        .filter(Boolean)
        .join('\n\n');

      const systemMessage = buildPrivacyAnalysisPrompt();

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Privacy Agent: calling LLM for analysis...',
        { step: 'privacy_agent_llm_call', progress: 45 },
      );

      let analysis: PrivacyAnalysisOutput;
      try {
        const run = await runSpecialistOverDocument<PrivacyAnalysisOutput>({
          llmClient,
          observability,
          state,
          documentText,
          systemMessage,
          callerName: `${AGENT_SLUG}:privacy-agent`,
          temperature: 0.3,
          maxTokens: 3000,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += `\n\n---\nRelevant Legal Reference Material:\n${ragContext}`;
            }
            return msg;
          },
          parse: parsePrivacyAnalysis,
          merge: mergePrivacyAnalyses,
          progressLabel: 'Privacy Agent',
          progressStepPrefix: 'privacy_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `Privacy Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Privacy Agent: Analysis complete',
        { step: 'privacy_agent_complete', progress: 60 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          privacy: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Privacy Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Privacy Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

function buildPrivacyAnalysisPrompt(): string {
  return `You are a Privacy and Data Protection Specialist AI. Analyze documents for GDPR/CCPA compliance and data protection provisions.

INSTRUCTIONS:
1. Identify types of personal data collected/processed
2. Determine purposes and legal basis for processing
3. Check GDPR compliance (if EU data involved)
4. Check CCPA compliance (if California consumers involved)
5. Identify cross-border data transfer mechanisms
6. Review security measures and data subject rights

OUTPUT FORMAT (JSON only):
{
  "dataHandling": {
    "dataTypes": ["list of personal data types"],
    "purposes": ["list of processing purposes"],
    "retentionPeriod": "how long data is kept",
    "dataLocation": "where data is stored",
    "details": "data handling analysis"
  },
  "gdprCompliance": {
    "applicable": true/false,
    "legalBasis": "consent|contract|legitimate-interest|etc",
    "dataSubjectRights": ["list of rights addressed"],
    "crossBorderTransfers": {
      "applicable": true/false,
      "mechanism": "SCCs|BCRs|adequacy-decision|none",
      "details": "transfer mechanism details"
    },
    "compliant": true/false,
    "details": "GDPR compliance analysis"
  },
  "ccpaCompliance": {
    "applicable": true/false,
    "consumerRights": ["list of rights addressed"],
    "doNotSell": true/false,
    "compliant": true/false,
    "details": "CCPA compliance analysis"
  },
  "security": {
    "measures": ["list of security measures"],
    "adequate": true/false,
    "details": "security analysis"
  },
  "riskFlags": [
    {
      "flag": "flag-name",
      "severity": "low|medium|high|critical",
      "description": "description",
      "recommendation": "recommendation"
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
  return `Analyze privacy and data protection provisions:\n\n${buildBaseUserMessage(documentText, state)}`;
}

function parsePrivacyAnalysis(responseText: string): PrivacyAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    dataHandling:
      (parsed.dataHandling as PrivacyAnalysisOutput['dataHandling']) || {
        dataTypes: [],
        purposes: [],
        details: 'No data handling information found',
      },
    gdprCompliance:
      parsed.gdprCompliance as PrivacyAnalysisOutput['gdprCompliance'],
    ccpaCompliance:
      parsed.ccpaCompliance as PrivacyAnalysisOutput['ccpaCompliance'],
    security: parsed.security as PrivacyAnalysisOutput['security'],
    riskFlags: (parsed.riskFlags as PrivacyAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'Privacy analysis completed',
  };
}

function applyPlaybookRules(
  analysis: PrivacyAnalysisOutput,
): PrivacyAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag missing SCCs for EU transfers
  if (
    analysis.gdprCompliance?.applicable &&
    analysis.gdprCompliance?.crossBorderTransfers?.applicable
  ) {
    const mechanism =
      analysis.gdprCompliance.crossBorderTransfers.mechanism?.toLowerCase() ||
      'none';
    if (
      mechanism === 'none' ||
      (!mechanism.includes('scc') &&
        !mechanism.includes('adequacy') &&
        !mechanism.includes('bcr'))
    ) {
      existingFlags.push({
        flag: 'missing-transfer-mechanism',
        severity: 'critical',
        description:
          'EU data transfers lack proper legal mechanism (SCCs, adequacy decision, or BCRs).',
        recommendation:
          'Implement Standard Contractual Clauses (SCCs) or other valid transfer mechanism.',
      });
    }
  }

  // Rule 2: Flag unclear retention period
  if (!analysis.dataHandling.retentionPeriod) {
    existingFlags.push({
      flag: 'unclear-retention-period',
      severity: 'medium',
      description: 'Data retention period is not clearly specified.',
      recommendation:
        'Define clear data retention periods in accordance with GDPR/CCPA requirements.',
    });
  }

  // Rule 3: Flag missing data subject rights
  if (
    analysis.gdprCompliance?.applicable &&
    (!analysis.gdprCompliance.dataSubjectRights ||
      analysis.gdprCompliance.dataSubjectRights.length === 0)
  ) {
    existingFlags.push({
      flag: 'missing-data-subject-rights',
      severity: 'high',
      description:
        'GDPR requires data subject rights provisions (access, rectification, erasure, etc.).',
      recommendation:
        'Add provisions addressing GDPR data subject rights (Articles 15-22).',
    });
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}

/**
 * Merge privacy analyses from chunked LLM calls.
 *
 * Merge rules:
 *  - dataHandling: union dataTypes/purposes; first non-empty for retention/location.
 *  - gdprCompliance / ccpaCompliance / security: first non-empty per chunk.
 *  - riskFlags: dedupe by `flag` (first occurrence wins).
 *  - confidence: minimum across chunks.
 *  - summary: join non-empty chunk summaries.
 */
function mergePrivacyAnalyses(
  results: PrivacyAnalysisOutput[],
): PrivacyAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const dataTypeSet = new Set<string>();
  const purposeSet = new Set<string>();
  let retention: string | undefined;
  let location: string | undefined;
  const detailsParts: string[] = [];
  for (const r of results) {
    for (const t of r.dataHandling?.dataTypes ?? []) dataTypeSet.add(t);
    for (const p of r.dataHandling?.purposes ?? []) purposeSet.add(p);
    if (!retention && r.dataHandling?.retentionPeriod)
      retention = r.dataHandling.retentionPeriod;
    if (!location && r.dataHandling?.dataLocation)
      location = r.dataHandling.dataLocation;
    if (r.dataHandling?.details) detailsParts.push(r.dataHandling.details);
  }
  const seenFlags = new Set<string>();
  const riskFlags: PrivacyAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seenFlags.has(key)) continue;
      seenFlags.add(key);
      riskFlags.push(f);
    }
  }
  return {
    dataHandling: {
      dataTypes: Array.from(dataTypeSet),
      purposes: Array.from(purposeSet),
      retentionPeriod: retention,
      dataLocation: location,
      details: detailsParts.join(' | '),
    },
    gdprCompliance: results.find((r) => r.gdprCompliance)?.gdprCompliance,
    ccpaCompliance: results.find((r) => r.ccpaCompliance)?.ccpaCompliance,
    security: results.find((r) => r.security)?.security,
    riskFlags,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
