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

/**
 * IP Analysis Output Interface
 *
 * Structured output from the IP specialist agent.
 * Used for intellectual property ownership, licensing, and rights analysis.
 */
export interface IpAnalysisOutput {
  /** IP ownership analysis */
  ownership: {
    /** Who owns the IP */
    owner: string;
    /** Type of ownership (exclusive, joint, etc.) */
    ownershipType: string;
    /** Work-for-hire status */
    workForHire?: {
      isWorkForHire: boolean;
      details: string;
    };
    /** Assignment clauses */
    assignments?: string[];
    /** Clarity of ownership */
    clear: boolean;
    details: string;
  };
  /** Licensing terms */
  licensing?: {
    /** Type of license */
    licenseType: string;
    /** Scope of license */
    scope: string;
    /** Exclusivity */
    exclusive: boolean;
    /** Territory */
    territory?: string;
    /** Term/duration */
    term?: string;
    /** Sublicensing rights */
    sublicensing?: string;
    details: string;
  };
  /** IP types covered */
  ipTypes: Array<{
    type: 'patent' | 'trademark' | 'copyright' | 'trade-secret' | 'other';
    description: string;
  }>;
  /** Warranties and representations */
  warranties?: {
    nonInfringement?: boolean;
    authority?: boolean;
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
 * IP Agent Node - M5 Specialist
 *
 * Purpose: Analyze intellectual property clauses, ownership, and licensing terms.
 *
 * This specialist node:
 * 1. Receives document text and legal metadata from state
 * 2. Calls LLM with structured output prompt for IP analysis
 * 3. Applies hardcoded playbook rules (flag missing work-for-hire, unclear ownership)
 * 4. Returns structured analysis in specialistOutputs.ip
 *
 * Follows M2 architecture principles:
 * - ONE LLM CALL with structured JSON output
 * - Simple playbook rules (hardcoded, not database)
 * - Demo-grade, not production
 */
export function createIpAgentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
) {
  return async function ipAgentNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'IP Agent: Analyzing intellectual property',
      { step: 'ip_agent', progress: 40 },
    );

    try {
      const documents = enumerateDocuments(state);

      if (documents.length === 0) {
        return {
          error: 'No document content available for IP analysis',
          status: 'failed',
        };
      }

      // Query RAG for relevant context (two collections for IP)
      const [ragContext1, ragContext2] = await Promise.all([
        workflowRag?.getContext({
          collectionSlug: 'law-contracts-hybrid',
          orgSlug: ctx.orgSlug,
          query: documents[0]!.content,
        }) ?? '',
        workflowRag?.getContext({
          collectionSlug: 'law-firm-policies-attributed',
          orgSlug: ctx.orgSlug,
          query: documents[0]!.content,
        }) ?? '',
      ]);
      const ragContext = [ragContext1, ragContext2]
        .filter(Boolean)
        .join('\n\n');

      const memory = await loadWorkflowMemory('document-onboarding');
      const systemMessage = buildIpAnalysisPrompt() + formatMemoryForPrompt(memory);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'IP Agent: calling LLM for analysis...',
        { step: 'ip_agent_llm_call', progress: 45 },
      );

      let analysis: IpAnalysisOutput;
      try {
        const run = await runSpecialistOverDocuments<IpAnalysisOutput>({
          llmClient,
          observability,
          state,
          documents,
          systemMessage,
          callerName: `${AGENT_SLUG}:ip-agent`,
          temperature: 0.3,
          maxTokens: 3000,
          buildUserMessage: (chunk, s) => {
            let msg = buildUserMessage(chunk, s);
            if (ragContext) {
              msg += ragContext;
            }
            return msg;
          },
          parse: parseIpAnalysis,
          merge: mergeIpAnalyses,
          progressLabel: 'IP Agent',
          progressStepPrefix: 'ip_agent',
        });
        analysis = run.result;
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        return {
          error: `IP Agent: Failed to parse LLM response: ${parseMsg}`,
          status: 'failed',
        };
      }

      analysis = applyPlaybookRules(analysis);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'IP Agent: Analysis complete',
        { step: 'ip_agent_complete', progress: 60 },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          ip: analysis,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `IP Agent failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `IP Agent: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

function buildIpAnalysisPrompt(): string {
  return `You are an Intellectual Property (IP) Analysis Specialist AI. Your task is to analyze IP ownership, licensing, and rights in legal documents.

INSTRUCTIONS:
1. Identify who owns the intellectual property
2. Determine if there are work-for-hire provisions
3. Analyze licensing terms (if applicable)
4. Identify types of IP covered (patents, trademarks, copyrights, trade secrets)
5. Check for IP warranties and representations
6. Flag any unclear ownership or problematic terms

OUTPUT FORMAT:
Respond with a JSON object in EXACTLY this format:
{
  "ownership": {
    "owner": "party name who owns the IP",
    "ownershipType": "exclusive|joint|shared|unclear",
    "workForHire": {
      "isWorkForHire": true/false,
      "details": "work-for-hire provisions"
    },
    "assignments": ["list of IP assignment clauses"],
    "clear": true/false,
    "details": "ownership analysis details"
  },
  "licensing": {
    "licenseType": "perpetual|term-limited|subscription|other",
    "scope": "description of what is licensed",
    "exclusive": true/false,
    "territory": "geographic scope",
    "term": "duration of license",
    "sublicensing": "allowed|not-allowed|restricted",
    "details": "licensing terms analysis"
  },
  "ipTypes": [
    {
      "type": "patent|trademark|copyright|trade-secret|other",
      "description": "description of this IP type"
    }
  ],
  "warranties": {
    "nonInfringement": true/false,
    "authority": true/false,
    "details": "warranty analysis"
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
  "summary": "2-3 sentence summary of IP analysis"
}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.`;
}

function buildUserMessage(
  documentText: string,
  state: LegalDepartmentState,
): string {
  return `Analyze the intellectual property provisions in the following document:\n\n${buildBaseUserMessage(documentText, state)}`;
}

function parseIpAnalysis(responseText: string): IpAnalysisOutput {
  const jsonStr = stripMarkdownFences(responseText);

  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    ownership: (parsed.ownership as IpAnalysisOutput['ownership']) || {
      owner: 'unknown',
      ownershipType: 'unclear',
      clear: false,
      details: 'Could not determine ownership',
    },
    licensing: parsed.licensing as IpAnalysisOutput['licensing'],
    ipTypes: (parsed.ipTypes as IpAnalysisOutput['ipTypes']) || [],
    warranties: parsed.warranties as IpAnalysisOutput['warranties'],
    riskFlags: (parsed.riskFlags as IpAnalysisOutput['riskFlags']) || [],
    confidence: (parsed.confidence as number) || 0.7,
    summary: (parsed.summary as string) || 'IP analysis completed',
  };
}

/**
 * Apply hardcoded playbook rules to the analysis
 *
 * M5 Playbook Rules:
 * 1. Flag if ownership is unclear
 * 2. Flag if no work-for-hire provision (for employment/contractor agreements)
 * 3. Flag if no non-infringement warranty
 */
function applyPlaybookRules(analysis: IpAnalysisOutput): IpAnalysisOutput {
  const existingFlags = [...analysis.riskFlags];

  // Rule 1: Flag unclear ownership
  if (!analysis.ownership.clear) {
    existingFlags.push({
      flag: 'unclear-ip-ownership',
      severity: 'high',
      description: 'IP ownership is unclear or ambiguous in the agreement.',
      recommendation:
        'Add clear IP ownership or assignment clause to avoid future disputes.',
    });
  }

  // Rule 2: Flag missing work-for-hire
  if (
    analysis.ownership.workForHire &&
    !analysis.ownership.workForHire.isWorkForHire
  ) {
    // Only flag if this looks like an employment/contractor document
    if (
      analysis.ipTypes.some((ip) =>
        ['copyright', 'patent', 'trade-secret'].includes(ip.type),
      )
    ) {
      existingFlags.push({
        flag: 'no-work-for-hire',
        severity: 'medium',
        description:
          'No work-for-hire provision found. Created IP may not automatically belong to company.',
        recommendation:
          'Add work-for-hire clause to ensure company owns IP created by employees/contractors.',
      });
    }
  }

  // Rule 3: Flag missing non-infringement warranty
  if (analysis.warranties && analysis.warranties.nonInfringement === false) {
    existingFlags.push({
      flag: 'no-non-infringement-warranty',
      severity: 'medium',
      description:
        'No non-infringement warranty provided by licensor/assignor.',
      recommendation:
        'Request non-infringement warranty to protect against IP claims from third parties.',
    });
  }

  // Rule 4: Flag overly broad license scope
  if (analysis.licensing) {
    const scope = analysis.licensing.scope?.toLowerCase() || '';
    if (
      scope.includes('all') ||
      scope.includes('unlimited') ||
      scope.includes('unrestricted')
    ) {
      existingFlags.push({
        flag: 'broad-license-scope',
        severity: 'low',
        description:
          'License scope is very broad. Consider if narrower scope is appropriate.',
        recommendation:
          'Review if license scope should be limited to specific use cases or fields.',
      });
    }
  }

  return {
    ...analysis,
    riskFlags: existingFlags,
  };
}

/**
 * Merge IP analyses from chunked LLM calls.
 *
 * Merge rules:
 *  - ownership: take first chunk's (document-level property).
 *  - licensing: first non-empty chunk's licensing block.
 *  - ipTypes: union by `type` (first description wins per type).
 *  - warranties: first non-empty chunk's warranties block.
 *  - riskFlags: dedupe by `flag` (first occurrence wins).
 *  - confidence: minimum across chunks.
 *  - summary: join non-empty chunk summaries.
 */
function mergeIpAnalyses(results: IpAnalysisOutput[]): IpAnalysisOutput {
  if (results.length === 1) return results[0]!;
  const ownership = results[0]!.ownership;
  const licensing = results.find((r) => r.licensing)?.licensing;
  const warranties = results.find((r) => r.warranties)?.warranties;
  const seenTypes = new Set<string>();
  const ipTypes: IpAnalysisOutput['ipTypes'] = [];
  for (const r of results) {
    for (const t of r.ipTypes ?? []) {
      if (seenTypes.has(t.type)) continue;
      seenTypes.add(t.type);
      ipTypes.push(t);
    }
  }
  const seenFlags = new Set<string>();
  const riskFlags: IpAnalysisOutput['riskFlags'] = [];
  for (const r of results) {
    for (const f of r.riskFlags ?? []) {
      const key = f.flag.trim().toLowerCase();
      if (seenFlags.has(key)) continue;
      seenFlags.add(key);
      riskFlags.push(f);
    }
  }
  return {
    ownership,
    licensing,
    ipTypes,
    warranties,
    riskFlags,
    confidence: Math.min(...results.map((r) => r.confidence ?? 0)),
    summary: results
      .map((r) => r.summary)
      .filter(Boolean)
      .join('\n\n'),
  };
}
