/**
 * CitationGroundingService — hard citation verification against RAG sources.
 *
 * Extracted from legal-research research.node.ts soft-matching logic and
 * hardened for adversarial-brief where hallucinated counter-authority is
 * catastrophic. A citation that cannot be verified against RAG sources is
 * REJECTED (returns null), not merely flagged.
 *
 * Shared across:
 * - adversarial-brief (Red Team distinguishing-cases agent)
 * - legal-research (research node — replaces inline verification)
 */
import type { WorkflowRagService } from './workflow-rag.service';

export interface VerifiedCitation {
  text: string;
  source: string;
  documentId: string;
  chunkId: string;
  relevanceScore: number;
}

/**
 * Verify a citation against RAG sources. Returns a VerifiedCitation if
 * found, or null if the citation cannot be grounded.
 *
 * @param citationText - The citation text (e.g., "Smith v. Jones, 123 F.3d 456")
 * @param ragService - The workflow RAG service for querying
 * @param collection - The RAG collection slug (e.g., "law-contracts-hybrid")
 * @param orgSlug - The org slug for scoping the RAG query
 */
export async function verifyOrReject(
  citationText: string,
  ragService: WorkflowRagService,
  collection: string,
  orgSlug: string,
): Promise<VerifiedCitation | null> {
  if (!citationText.trim()) return null;

  try {
    const ragContext = await ragService.getContext({
      collectionSlug: collection,
      orgSlug,
      query: citationText,
      topK: 5,
    });

    if (!ragContext || !ragContext.trim()) return null;

    // Extract source names from RAG results (format: "[filename] content")
    const ragSources = extractRagSources(ragContext);

    // Try source name match first
    const citationSourceLower = citationText.toLowerCase();
    for (const source of ragSources) {
      if (
        citationSourceLower.includes(source) ||
        source.includes(citationSourceLower.slice(0, 50))
      ) {
        return {
          text: citationText,
          source,
          documentId: source,
          chunkId: '',
          relevanceScore: 1.0,
        };
      }
    }

    // Try content overlap: check if a significant portion of the citation
    // text appears in the RAG context
    const textSnippet = citationText.slice(0, 100).toLowerCase();
    if (
      textSnippet.length > 20 &&
      ragContext.toLowerCase().includes(textSnippet)
    ) {
      const firstSource = ragSources.values().next().value ?? 'unknown';
      return {
        text: citationText,
        source: firstSource,
        documentId: firstSource,
        chunkId: '',
        relevanceScore: 0.8,
      };
    }

    // Not found in RAG — reject
    return null;
  } catch {
    // RAG query failed — cannot verify, so reject
    return null;
  }
}

/**
 * Batch-verify citations, returning only those that pass verification.
 * Citations that fail are collected in the `stripped` array.
 */
export async function verifyBatch(
  citations: string[],
  ragService: WorkflowRagService,
  collection: string,
  orgSlug: string,
): Promise<{ verified: VerifiedCitation[]; stripped: string[] }> {
  const verified: VerifiedCitation[] = [];
  const stripped: string[] = [];

  for (const citation of citations) {
    const result = await verifyOrReject(
      citation,
      ragService,
      collection,
      orgSlug,
    );
    if (result) {
      verified.push(result);
    } else {
      stripped.push(citation);
    }
  }

  return { verified, stripped };
}

/**
 * Extract source document names from RAG context.
 * RAG context format: "[filename] content\n\n[filename2] content2"
 */
function extractRagSources(ragContext: string): Set<string> {
  const sources = new Set<string>();
  if (!ragContext) return sources;
  const matches = ragContext.matchAll(/\[([^\]]+)\]/g);
  for (const match of matches) {
    sources.add(match[1]!.toLowerCase());
  }
  return sources;
}
