/**
 * Regulatory Compliance Audit — Ingest Policies Node.
 *
 * For each uploaded document: segment text into policy sections by topic
 * using LLM classification, assign compliance domains, and build
 * PolicySection[]. Also populates the evaluation queue for scan mode.
 *
 * RAG collection creation for the policy sections is deferred to Phase 2
 * when the cross-reference engine needs to query them.
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1
 */
import { v4 as uuidv4 } from 'uuid';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type {
  PolicySection,
  EvaluationQueueEntry,
} from '../compliance-audit.types';

interface SectionClassification {
  sections: Array<{
    title: string;
    text: string;
    complianceDomain: string;
  }>;
}

export function createIngestPoliciesNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function ingestPoliciesNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;
    const allSections: PolicySection[] = [];

    for (let i = 0; i < state.documents.length; i++) {
      const doc = state.documents[i]!;

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Segmenting document ${i + 1}/${state.documents.length}: ${doc.name}`,
        {
          step: 'ca_ingest_document',
          progress: 5 + Math.round((i / state.documents.length) * 20),
          documentName: doc.name,
        },
      );

      const sections = await classifyDocument(
        llmClient,
        ctx,
        doc.documentId,
        doc.name,
        doc.content,
      );

      allSections.push(...sections);
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Policy ingestion complete: ${allSections.length} sections from ${state.documents.length} documents`,
      {
        step: 'ca_ingest_complete',
        progress: 25,
        totalSections: allSections.length,
      },
    );

    // Build evaluation queue based on mode
    let evaluationQueue: EvaluationQueueEntry[];

    if (state.auditContext.mode === 'scan') {
      // Scan mode: one entry per policy section
      evaluationQueue = allSections.map((s) => ({
        type: 'policy-section' as const,
        sectionId: s.sectionId,
        sectionText: s.sectionText,
        complianceDomain: s.complianceDomain ?? 'general',
      }));
    } else {
      // Full Audit mode: build queue from theme config questions
      const { parseThemeConfigs } = await import('./theme-config-parser');
      evaluationQueue = parseThemeConfigs(
        state.auditContext.frameworkSlugs,
        state.auditContext.selectedThemes,
      );
    }

    return {
      policySections: allSections,
      evaluationQueue,
      status: 'evaluating',
    };
  };
}

async function classifyDocument(
  llmClient: LLMHttpClientService,
  ctx: ComplianceAuditState['executionContext'],
  documentId: string,
  documentName: string,
  content: string,
): Promise<PolicySection[]> {
  const systemMessage = `You are a compliance analyst. Your task is to segment a company policy document into distinct sections by topic and classify each section's compliance domain.

For each section, identify:
1. A descriptive title (e.g., "Data Retention Policy", "Employee Access Controls")
2. The full text of the section
3. The compliance domain it primarily relates to. Use one of these domains:
   - data-handling (data collection, storage, processing, sharing)
   - security (access controls, encryption, network security)
   - privacy (consent, data subject rights, privacy notices)
   - breach-notification (incident response, breach procedures)
   - employee-rights (employment law, workplace policies)
   - governance (corporate governance, oversight, reporting)
   - financial-controls (accounting, auditing, financial reporting)
   - risk-management (risk assessment, mitigation, monitoring)
   - general (doesn't fit other categories)

Return a JSON object with a "sections" array. Each section has: "title" (string), "text" (string), "complianceDomain" (string).

If the document is short or covers a single topic, return it as one section.`;

  const userMessage = `Segment and classify this policy document.

Document: ${documentName}

Content:
${content}`;

  const response = await callLLMMaybeWithReasoning(llmClient, {
    context: ctx,
    systemMessage,
    userMessage,
    temperature: 0.1,
    callerName: 'compliance-audit:ingest-policies',
  });

  let classification: SectionClassification;
  try {
    const cleaned = stripMarkdownFences(response.text);
    classification = JSON.parse(cleaned) as SectionClassification;
  } catch {
    // If classification fails, treat entire document as one section
    return [
      {
        sectionId: uuidv4(),
        documentId,
        documentName,
        sectionTitle: documentName,
        sectionText: content,
        complianceDomain: 'general',
      },
    ];
  }

  if (
    !classification.sections ||
    !Array.isArray(classification.sections) ||
    classification.sections.length === 0
  ) {
    return [
      {
        sectionId: uuidv4(),
        documentId,
        documentName,
        sectionTitle: documentName,
        sectionText: content,
        complianceDomain: 'general',
      },
    ];
  }

  return classification.sections.map((s) => ({
    sectionId: uuidv4(),
    documentId,
    documentName,
    sectionTitle: s.title || documentName,
    sectionText: s.text || content,
    complianceDomain: s.complianceDomain || 'general',
  }));
}
