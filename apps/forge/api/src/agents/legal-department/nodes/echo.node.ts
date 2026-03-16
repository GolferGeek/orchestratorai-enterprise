import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';

const AGENT_SLUG = 'legal-department';

/**
 * Echo Node - M1 Document Analysis Node
 *
 * Purpose: Display legal document metadata and user message through LLM.
 *
 * This node (Phase 5, M1):
 * 1. Checks if legal metadata exists in state
 * 2. Formats legal metadata nicely for display
 * 3. Calls LLM service with user message and metadata context
 * 4. Returns formatted response with metadata summary
 * 5. Emits observability events
 *
 * Legal metadata includes:
 * - Document type and confidence
 * - Detected sections and structure
 * - Signature blocks and parties
 * - Extracted dates
 * - Contracting parties
 * - Overall confidence scores
 */
export function createEchoNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function echoNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Processing legal department request with metadata analysis',
      { step: 'echo', progress: 50 },
    );

    try {
      // Check if we have legal metadata
      const hasMetadata = !!state.legalMetadata;

      // Build system message with metadata context
      let systemMessage = `You are a Legal Department AI assistant.`;

      if (hasMetadata && state.legalMetadata) {
        const metadata = state.legalMetadata;

        // Format metadata summary
        const metadataSummary = formatLegalMetadata(metadata);

        systemMessage = `You are a Legal Department AI assistant.

I have analyzed the uploaded legal document and extracted the following metadata:

${metadataSummary}

Please respond to the user's message with this context in mind. If they ask about the document, reference the extracted metadata. Be professional and helpful.`;
      } else {
        // No document - provide enhanced legal guidance
        systemMessage = `You are a Legal Department AI assistant providing general legal information.

IMPORTANT DISCLAIMERS (include when relevant):
- This is general legal information, not legal advice
- Laws vary by jurisdiction - always verify local requirements
- For specific legal matters, consult a licensed attorney

RESPONSE STRUCTURE:
When answering legal questions, use this framework:
1. **Issue**: Identify the legal question or topic
2. **General Principles**: Explain relevant legal concepts
3. **Key Considerations**: Discuss factors that typically apply
4. **Jurisdictional Notes**: Mention where laws commonly vary
5. **Next Steps**: Suggest practical actions if applicable

LEGAL FRAMEWORKS TO APPLY:
- **Contract Law**: offer, acceptance, consideration, capacity, legality, mutual assent
- **Corporate Law**: fiduciary duties, liability shields, governance requirements, business judgment rule
- **IP Law**: copyright (original works), trademark (brand identity), patent (inventions), trade secrets
- **Privacy Law**: consent requirements, data minimization, purpose limitation, breach notification
- **Employment Law**: at-will vs. cause termination, discrimination protections, wage/hour rules

RESPONSE GUIDELINES:
- Be professional and helpful
- Cite general legal principles when applicable
- Acknowledge uncertainty rather than speculate
- Keep responses focused and practical
- If a question is too vague, ask for clarification

If the user uploads a document in a future request, you will have access to:
- Document type classification
- Detected sections and clauses
- Signature blocks and parties
- Extracted dates and key terms
- Risk analysis and recommendations`;
      }

      // Emit pre-LLM event to keep SSE alive through Cloudflare
      await observability.emitProgress(
        ctx,
        ctx.taskId,
        'Echo: Calling LLM for document analysis',
        { step: 'echo_llm_call', progress: 55, specialist: 'echo' },
      );

      // Call LLM service via API endpoint
      // Pass full ExecutionContext capsule - never cherry-pick fields
      const response = await llmClient.callLLM({
        context: ctx, // Full ExecutionContext
        systemMessage,
        userMessage: state.userMessage,
        callerName: AGENT_SLUG,
        temperature: 0.7,
        maxTokens: 2000,
      });

      await observability.emitProgress(
        ctx,
        ctx.taskId,
        'Legal department response generated',
        { step: 'echo_complete', progress: 90 },
      );

      // Format final response with metadata summary
      let finalResponse = response.text;

      if (hasMetadata && state.legalMetadata) {
        const quickSummary = formatQuickSummary(state.legalMetadata);
        finalResponse = `${response.text}\n\n---\n\n${quickSummary}`;
      }

      return {
        response: finalResponse,
        status: 'completed',
        legalMetadata: state.legalMetadata, // Include raw metadata in response
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.taskId,
        `Echo node failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: errorMessage,
        status: 'failed',
      };
    }
  };
}

/**
 * Format legal metadata for LLM context
 */
function formatLegalMetadata(
  metadata: LegalDepartmentState['legalMetadata'],
): string {
  if (!metadata) return 'No metadata available';

  const parts: string[] = [];

  // Document Type
  parts.push(
    `**Document Type**: ${metadata.documentType.type} (${(metadata.documentType.confidence * 100).toFixed(0)}% confidence)`,
  );

  if (
    metadata.documentType.alternatives &&
    metadata.documentType.alternatives.length > 0
  ) {
    const alternatives = metadata.documentType.alternatives
      .map((alt) => `${alt.type} (${(alt.confidence * 100).toFixed(0)}%)`)
      .join(', ');
    parts.push(`  - Alternative types: ${alternatives}`);
  }

  // Sections
  if (metadata.sections.sections.length > 0) {
    parts.push(
      `\n**Sections Detected**: ${metadata.sections.sections.length} sections (${metadata.sections.structureType} structure)`,
    );
    metadata.sections.sections.slice(0, 5).forEach((section) => {
      parts.push(
        `  - ${section.title} (${section.type}, ${(section.confidence * 100).toFixed(0)}% confidence)`,
      );
    });
    if (metadata.sections.sections.length > 5) {
      parts.push(
        `  - ... and ${metadata.sections.sections.length - 5} more sections`,
      );
    }
  }

  // Parties
  if (metadata.parties.parties.length > 0) {
    parts.push(
      `\n**Parties Identified**: ${metadata.parties.parties.length} parties`,
    );

    if (metadata.parties.contractingParties) {
      const [party1, party2] = metadata.parties.contractingParties;
      parts.push(`  - Primary contracting parties:`);
      if (party1) {
        parts.push(
          `    - ${party1.name} (${party1.type}${party1.role ? `, ${party1.role}` : ''})`,
        );
      }
      if (party2) {
        parts.push(
          `    - ${party2.name} (${party2.type}${party2.role ? `, ${party2.role}` : ''})`,
        );
      }
    } else {
      metadata.parties.parties.slice(0, 3).forEach((party) => {
        parts.push(
          `  - ${party.name} (${party.type}${party.role ? `, ${party.role}` : ''}, ${(party.confidence * 100).toFixed(0)}% confidence)`,
        );
      });
    }
  }

  // Signatures
  if (metadata.signatures.signatures.length > 0) {
    parts.push(
      `\n**Signatures Detected**: ${metadata.signatures.signatures.length} signature blocks`,
    );
    metadata.signatures.signatures.forEach((sig) => {
      const sigParts: string[] = [];
      if (sig.partyName) sigParts.push(sig.partyName);
      if (sig.signerName) sigParts.push(`signed by ${sig.signerName}`);
      if (sig.signerTitle) sigParts.push(`(${sig.signerTitle})`);
      if (sig.signatureDate) sigParts.push(`on ${sig.signatureDate}`);
      parts.push(`  - ${sigParts.join(' ')}`);
    });
  }

  // Dates
  if (metadata.dates.dates.length > 0) {
    parts.push(`\n**Dates Extracted**: ${metadata.dates.dates.length} dates`);

    if (metadata.dates.primaryDate) {
      parts.push(
        `  - Primary date: ${metadata.dates.primaryDate.normalizedDate} (${metadata.dates.primaryDate.dateType})`,
      );
    }

    metadata.dates.dates.slice(0, 3).forEach((date) => {
      if (
        metadata.dates.primaryDate &&
        date.normalizedDate === metadata.dates.primaryDate.normalizedDate
      ) {
        return; // Skip primary date since we already showed it
      }
      parts.push(
        `  - ${date.normalizedDate} (${date.dateType}, ${(date.confidence * 100).toFixed(0)}% confidence)`,
      );
    });

    if (metadata.dates.dates.length > 4) {
      parts.push(`  - ... and ${metadata.dates.dates.length - 4} more dates`);
    }
  }

  // Overall Confidence
  parts.push(
    `\n**Overall Extraction Confidence**: ${(metadata.confidence.overall * 100).toFixed(0)}%`,
  );
  parts.push(
    `  - Extraction method: ${metadata.confidence.factors.extractionMethod}`,
  );
  parts.push(
    `  - Text quality: ${(metadata.confidence.factors.textQuality * 100).toFixed(0)}%`,
  );
  parts.push(
    `  - Completeness: ${(metadata.confidence.factors.completeness * 100).toFixed(0)}%`,
  );

  return parts.join('\n');
}

/**
 * Format quick metadata summary for final response
 */
function formatQuickSummary(
  metadata: LegalDepartmentState['legalMetadata'],
): string {
  if (!metadata) return '';

  const parts: string[] = [];

  parts.push('📊 **Document Analysis Summary**');
  parts.push(
    `- Type: ${metadata.documentType.type} (${(metadata.documentType.confidence * 100).toFixed(0)}% confidence)`,
  );
  parts.push(`- Sections: ${metadata.sections.sections.length}`);
  parts.push(`- Parties: ${metadata.parties.parties.length}`);
  parts.push(`- Signatures: ${metadata.signatures.signatures.length}`);
  parts.push(`- Dates: ${metadata.dates.dates.length}`);
  parts.push(
    `- Overall Confidence: ${(metadata.confidence.overall * 100).toFixed(0)}%`,
  );

  return parts.join('\n');
}
