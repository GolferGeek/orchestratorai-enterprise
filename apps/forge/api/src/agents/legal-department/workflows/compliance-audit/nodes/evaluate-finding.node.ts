/**
 * Regulatory Compliance Audit — Evaluate Finding Node.
 *
 * The core cross-reference engine. For each evaluation queue item:
 *
 * 1. Pop next item from evaluationQueue
 * 2. If policy-section: query framework RAG for related requirements,
 *    then query policy RAG for addressing policies
 * 3. If theme-question: query policy RAG with question text,
 *    then query framework RAG for specific requirement context
 * 4. Run specialist evaluation to assess compliance status
 * 5. Generate gap description and remediation recommendation
 * 6. Build ComplianceFinding and append to state.findings
 *
 * Uses callLLMMaybeWithReasoning() for evaluation (captures specialist reasoning).
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1
 */
import { v4 as uuidv4 } from 'uuid';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type {
  ComplianceFinding,
  ComplianceStatus,
  Severity,
  PolicyCitation,
} from '../compliance-audit.types';

interface EvaluationResult {
  status: ComplianceStatus;
  severity: Severity;
  frameworkSlug: string;
  requirementRef: string;
  requirementText: string;
  policyCitations: PolicyCitation[];
  gapDescription: string;
  remediationRecommendation: string;
}

export function createEvaluateFindingNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag: WorkflowRagService,
) {
  return async function evaluateFindingNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;
    const queue = [...state.evaluationQueue];
    const item = queue.shift();

    if (!item) {
      return { evaluationQueue: queue };
    }

    const itemId =
      item.type === 'policy-section' ? item.sectionId : item.questionId;

    try {
      let frameworkContext = '';
      let policyContext = '';
      let evaluationPrompt = '';

      if (item.type === 'policy-section') {
        // Query framework RAG with the policy section text to find related requirements
        for (const frameworkSlug of state.auditContext.frameworkSlugs) {
          const fwCtx = await workflowRag.getContext({
            collectionSlug: `framework-${frameworkSlug}`,
            orgSlug: ctx.orgSlug,
            query: item.sectionText,
            topK: 5,
          });
          if (fwCtx) frameworkContext += fwCtx;
        }

        // Query policy RAG to find other addressing policies for cross-reference
        if (state.policyCollectionSlug) {
          policyContext = await workflowRag.getContext({
            collectionSlug: state.policyCollectionSlug,
            orgSlug: ctx.orgSlug,
            query: item.sectionText,
            topK: 3,
          });
        }

        evaluationPrompt = buildPolicySectionPrompt(
          item.sectionText,
          item.complianceDomain,
          frameworkContext,
          policyContext,
          state.auditContext.frameworkSlugs,
        );
      } else {
        // theme-question: query policy RAG with the question
        if (state.policyCollectionSlug) {
          policyContext = await workflowRag.getContext({
            collectionSlug: state.policyCollectionSlug,
            orgSlug: ctx.orgSlug,
            query: item.questionText,
            topK: 5,
          });
        }

        // Query framework RAG for the specific requirement context
        frameworkContext = await workflowRag.getContext({
          collectionSlug: `framework-${item.frameworkSlug}`,
          orgSlug: ctx.orgSlug,
          query: item.questionText,
          topK: 3,
        });

        evaluationPrompt = buildThemeQuestionPrompt(
          item.questionText,
          item.themeName,
          item.frameworkSlug,
          frameworkContext,
          policyContext,
        );
      }

      // Run specialist evaluation
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: EVALUATION_SYSTEM_PROMPT,
        userMessage: evaluationPrompt,
        temperature: 0.1,
        callerName: 'compliance-audit:evaluate-finding',
      });

      const evalResult = parseEvaluationResponse(
        response.text,
        item.type === 'policy-section'
          ? (state.auditContext.frameworkSlugs[0] ?? 'unknown')
          : item.frameworkSlug,
      );

      const finding: ComplianceFinding = {
        id: uuidv4(),
        ...evalResult,
        specialistReasoning:
          response.thinkingContent ?? response.text.slice(0, 500),
        ...(item.type === 'theme-question'
          ? {
              themeId: item.themeId,
              themeName: item.themeName,
              questionId: item.questionId,
            }
          : {}),
      };

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Evaluated: ${evalResult.requirementRef} — ${evalResult.status}`,
        {
          step: 'ca_evaluate_finding',
          progress:
            25 +
            Math.round(
              ((state.evaluationsCompleted.length + 1) /
                Math.max(
                  state.evaluationsCompleted.length +
                    Object.keys(state.evaluationsFailed).length +
                    queue.length +
                    1,
                  1,
                )) *
                50,
            ),
          findingId: finding.id,
          status: evalResult.status,
          severity: evalResult.severity,
        },
      );

      return {
        evaluationQueue: queue,
        evaluationsCompleted: [...state.evaluationsCompleted, itemId],
        findings: [finding],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Evaluation failed for ${itemId}: ${msg}`,
        { step: 'ca_evaluate_failed', error: msg },
      );

      return {
        evaluationQueue: queue,
        evaluationsFailed: { [itemId]: msg },
      };
    }
  };
}

// ── Prompt Builders ─────────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are a compliance specialist evaluating organizational policies against regulatory framework requirements.

Your task is to assess compliance status and generate a structured finding.

Return a JSON object with these exact fields:
{
  "status": "compliant" | "partially-compliant" | "non-compliant" | "not-addressed" | "unable-to-evaluate",
  "severity": "critical" | "high" | "medium" | "low",
  "requirementRef": "e.g., GDPR Art. 5(1)(e) or HIPAA §164.312(a)(1)",
  "requirementText": "brief description of the specific regulatory requirement",
  "policyCitations": [
    {
      "sectionId": "identifier or empty string",
      "documentName": "document name",
      "sectionTitle": "section heading",
      "excerpt": "relevant excerpt from the policy (max 200 chars)"
    }
  ],
  "gapDescription": "what is missing or incomplete in the policy relative to the requirement",
  "remediationRecommendation": "specific, actionable recommendation to achieve compliance"
}

Compliance status definitions:
- compliant: The policy fully addresses the requirement with clear, specific provisions
- partially-compliant: The policy addresses the requirement but with gaps, ambiguity, or incomplete coverage
- non-compliant: The policy directly contradicts or fails to address a key aspect of the requirement
- not-addressed: No relevant policy content was found for this requirement
- unable-to-evaluate: Insufficient information to make a determination

Severity guidelines:
- critical: Fundamental rights, data breach obligations, criminal liability provisions
- high: Core compliance requirements, significant regulatory exposure
- medium: Important but not core requirements, moderate regulatory exposure
- low: Best practice recommendations, minor procedural requirements

Always cite specific policy text when available. If no relevant policy text is found, set policyCitations to an empty array and status to "not-addressed".`;

function buildPolicySectionPrompt(
  sectionText: string,
  complianceDomain: string,
  frameworkContext: string,
  policyContext: string,
  frameworkSlugs: string[],
): string {
  return `Evaluate this policy section against the regulatory framework requirements.

**Policy Section (domain: ${complianceDomain}):**
${sectionText}

**Regulatory Framework Requirements (${frameworkSlugs.join(', ').toUpperCase()}):**
${frameworkContext || 'No matching framework requirements found.'}

**Related Policy Context:**
${policyContext || 'No additional policy context available.'}

Assess how well this policy section addresses the matched regulatory requirements. Identify the most significant compliance gap (if any) and provide a specific remediation recommendation.`;
}

function buildThemeQuestionPrompt(
  questionText: string,
  themeName: string,
  frameworkSlug: string,
  frameworkContext: string,
  policyContext: string,
): string {
  return `Evaluate compliance with this specific requirement question.

**Framework:** ${frameworkSlug.toUpperCase()}
**Theme:** ${themeName}
**Question:** ${questionText}

**Regulatory Context:**
${frameworkContext || 'No specific regulatory text found for this question.'}

**Organization Policy Content:**
${policyContext || 'No relevant policy content found.'}

Assess whether the organization's policies adequately address this compliance question. If policy content was found, evaluate its sufficiency. If no policy content was found, mark as "not-addressed".`;
}

// ── Response Parser ─────────────────────────────────────────────────

function parseEvaluationResponse(
  responseText: string,
  defaultFrameworkSlug: string,
): EvaluationResult {
  try {
    const cleaned = stripMarkdownFences(responseText);
    const parsed = JSON.parse(cleaned) as Partial<EvaluationResult>;

    return {
      status: validateStatus(parsed.status)
        ? parsed.status
        : 'unable-to-evaluate',
      severity: validateSeverity(parsed.severity) ? parsed.severity : 'medium',
      frameworkSlug: defaultFrameworkSlug,
      requirementRef: parsed.requirementRef ?? 'Unknown requirement',
      requirementText: parsed.requirementText ?? '',
      policyCitations: Array.isArray(parsed.policyCitations)
        ? parsed.policyCitations.map((c) => ({
            sectionId: c.sectionId ?? '',
            documentName: c.documentName ?? '',
            sectionTitle: c.sectionTitle ?? '',
            excerpt: c.excerpt ?? '',
          }))
        : [],
      gapDescription: parsed.gapDescription ?? '',
      remediationRecommendation: parsed.remediationRecommendation ?? '',
    };
  } catch {
    return {
      status: 'unable-to-evaluate',
      severity: 'medium',
      frameworkSlug: defaultFrameworkSlug,
      requirementRef: 'Parse error',
      requirementText: 'Could not parse evaluation response',
      policyCitations: [],
      gapDescription: responseText.slice(0, 300),
      remediationRecommendation: '',
    };
  }
}

function validateStatus(s: unknown): s is ComplianceStatus {
  return (
    typeof s === 'string' &&
    [
      'compliant',
      'partially-compliant',
      'non-compliant',
      'not-addressed',
      'unable-to-evaluate',
    ].includes(s)
  );
}

function validateSeverity(s: unknown): s is Severity {
  return (
    typeof s === 'string' && ['critical', 'high', 'medium', 'low'].includes(s)
  );
}
