import { Injectable, Logger } from '@nestjs/common';
import { Chunk } from './chunking.service';

export interface HeadingEntry {
  level: number;
  text: string;
  charOffset: number;
}

export interface CrossRef {
  id: string;
  title: string;
  relationship: string;
}

export interface DocumentContext {
  documentId: string | null;
  documentTitle: string | null;
  documentType:
    | 'policy'
    | 'template'
    | 'checklist'
    | 'guide'
    | 'agreement'
    | 'procedure'
    | null;
  version: string | null;
  effectiveDate: string | null;
  headingIndex: HeadingEntry[];
  crossReferences: CrossRef[];
}

/**
 * Metadata Enrichment Service
 *
 * Pure text analysis service that enriches document chunks with structured
 * metadata for comprehensive RAG search. No LLM calls, no database calls.
 */
@Injectable()
export class MetadataEnrichmentService {
  private readonly logger = new Logger(MetadataEnrichmentService.name);

  /**
   * Enrich chunks with structured metadata derived from document analysis.
   * This is the only public method.
   */
  enrichChunks(chunks: Chunk[], fullText: string, filename: string): Chunk[] {
    if (!chunks.length || !fullText) {
      return chunks;
    }

    const ctx = this.analyzeDocument(fullText, filename);

    this.logger.debug(
      `Analyzed ${filename}: docId=${ctx.documentId}, version=${ctx.version}, ${ctx.headingIndex.length} headings, ${ctx.crossReferences.length} cross-refs`,
    );

    for (const chunk of chunks) {
      const trueOffset = this.resolveCharOffset(chunk, fullText);

      const metadata: Record<string, unknown> = {};

      if (ctx.documentId) {
        metadata['document_id'] = ctx.documentId;
      }
      if (ctx.documentType) {
        metadata['document_type'] = ctx.documentType;
      }
      if (ctx.version) {
        metadata['version'] = ctx.version;
      }

      const sectionPath = this.buildSectionPath(
        trueOffset,
        ctx.headingIndex,
      );
      if (sectionPath) {
        metadata['section_path'] = sectionPath;
      }

      const sectionHeading = this.findNearestHeading(
        trueOffset,
        ctx.headingIndex,
      );
      if (sectionHeading) {
        metadata['section_heading'] = sectionHeading;
      }

      const chunkCrossRefs = this.filterCrossRefsInChunk(
        chunk.content,
        ctx.crossReferences,
      );
      if (chunkCrossRefs.length > 0) {
        metadata['cross_references'] = chunkCrossRefs;
      }

      const keywords = this.extractKeywords(chunk.content);
      if (keywords.length > 0) {
        metadata['keywords'] = keywords;
      }

      chunk.metadata = { ...chunk.metadata, ...metadata };
    }

    this.logger.debug(`Enriched ${chunks.length} chunks for ${filename}`);

    return chunks;
  }

  // ── Document Analysis ─────────────────────────────────────────────

  private analyzeDocument(
    fullText: string,
    filename: string,
  ): DocumentContext {
    const documentId = this.extractDocumentId(fullText, filename);
    return {
      documentId,
      documentTitle: this.extractDocumentTitle(fullText),
      documentType: this.classifyDocumentType(fullText, filename),
      version: this.extractVersion(fullText, filename),
      effectiveDate: this.extractEffectiveDate(fullText),
      headingIndex: this.buildHeadingIndex(fullText),
      crossReferences: this.extractCrossReferences(fullText, documentId),
    };
  }

  // ── Extraction Methods ────────────────────────────────────────────

  private extractDocumentId(text: string, filename: string): string | null {
    const match = text.match(
      /\*\*(?:Document ID|Policy Number|DPA Number|Document Number|Agreement ID):\*\*\s*([A-Z][\w-]+)/,
    );
    if (match) {
      return match[1]!;
    }

    // Fallback: derive from filename
    const base = filename.replace(/\.[^.]+$/, '');
    if (base) {
      return base.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
    }

    return null;
  }

  private extractDocumentTitle(text: string): string | null {
    const match = text.match(/^#\s+(.+)$/m);
    return match ? match[1]!.trim() : null;
  }

  private extractVersion(text: string, filename: string): string | null {
    const contentMatch = text.match(
      /\*\*(?:Version|Template Version|Rev|Revision):\*\*\s*([\d.]+)/,
    );
    if (contentMatch) {
      return contentMatch[1]!;
    }

    const filenameMatch = filename.match(/-v(\d+(?:\.\d+)?)/i);
    if (filenameMatch) {
      return filenameMatch[1]!;
    }

    return null;
  }

  private extractEffectiveDate(text: string): string | null {
    const match = text.match(
      /\*\*(?:Effective Date|Date|Last Updated|Revision Date):\*\*\s*(.+?)[\n|]/,
    );
    return match ? match[1]!.trim() : null;
  }

  private classifyDocumentType(
    text: string,
    filename: string,
  ): DocumentContext['documentType'] {
    const title = this.extractDocumentTitle(text) || '';
    const combined = `${title} ${filename}`.toLowerCase();

    if (/policy|standard/.test(combined)) return 'policy';
    if (/template|notice|letter/.test(combined)) return 'template';
    if (/checklist/.test(combined)) return 'checklist';
    if (/guide|manual|handbook/.test(combined)) return 'guide';
    if (/agreement|contract|dpa|nda|msa|sow|license/.test(combined))
      return 'agreement';
    if (/procedure|process|workflow|playbook/.test(combined))
      return 'procedure';

    return null;
  }

  private buildHeadingIndex(text: string): HeadingEntry[] {
    const headings: HeadingEntry[] = [];
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      headings.push({
        level: match[1]!.length,
        text: match[2]!.trim(),
        charOffset: match.index,
      });
    }

    return headings.sort((a, b) => a.charOffset - b.charOffset);
  }

  private extractCrossReferences(
    text: string,
    ownDocId: string | null,
  ): CrossRef[] {
    const seen = new Set<string>();
    const refs: CrossRef[] = [];

    const addRef = (id: string, title: string, relationship: string) => {
      if (seen.has(id)) return;
      if (ownDocId && id === ownDocId) return;
      seen.add(id);
      refs.push({ id, title, relationship });
    };

    // Pattern 1: bracketed IDs like [HR-001] or [DPA-100-GDPR]
    const bracketedRegex = /\[([A-Z]{2,5}-\d{3}(?:-\w+)?)\]/g;
    let match: RegExpExecArray | null;
    while ((match = bracketedRegex.exec(text)) !== null) {
      addRef(match[1]!, match[1]!, 'referenced');
    }

    // Pattern 2: markdown links to .md files
    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      const linkTitle = match[1]!;
      const linkPath = match[2]!;
      const id = linkPath
        .replace(/^.*\//, '')
        .replace(/\.md$/, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-');
      addRef(id, linkTitle, 'linked');
    }

    // Pattern 3: "See:" / "Refer to:" patterns
    const seeRegex =
      /(?:See|Refer to|Reference|Per)\s*(?:the\s+)?([A-Z][^.;,\n\[]{5,60})\s*\[([A-Z][\w-]+)\]/g;
    while ((match = seeRegex.exec(text)) !== null) {
      addRef(match[2]!, match[1]!.trim(), 'see-also');
    }

    // Pattern 4: Cross-References or Related Documents section
    const sectionStartRegex =
      /^##\s+(?:Cross-References|Related Documents)\s*$/m;
    const sectionStartMatch = sectionStartRegex.exec(text);
    let sectionMatch: RegExpMatchArray | null = null;
    if (sectionStartMatch) {
      const afterHeading = text.substring(
        sectionStartMatch.index! + sectionStartMatch[0].length,
      );
      const nextSectionIdx = afterHeading.search(/^##\s/m);
      const sectionContent =
        nextSectionIdx >= 0
          ? afterHeading.substring(0, nextSectionIdx)
          : afterHeading;
      sectionMatch = [sectionContent, sectionContent] as unknown as RegExpMatchArray;
    }
    if (sectionMatch) {
      const sectionContent = sectionMatch[1]!;
      // Parse list items like "- [DOC-001] Title" or "- Title [DOC-001]"
      const listRegex =
        /[-*]\s+(?:\[([A-Z][\w-]+)\]\s*(.+)|(.+?)\s*\[([A-Z][\w-]+)\])/g;
      while ((match = listRegex.exec(sectionContent)) !== null) {
        const id = match[1] || match[4]!;
        const title = (match[2] || match[3] || id).trim();
        addRef(id, title, 'cross-reference');
      }
    }

    return refs;
  }

  // ── Per-Chunk Helpers ─────────────────────────────────────────────

  private buildSectionPath(
    charOffset: number,
    headingIndex: HeadingEntry[],
  ): string | null {
    if (!headingIndex.length) return null;

    // Find all headings before this offset
    const prior = headingIndex.filter((h) => h.charOffset <= charOffset);
    if (!prior.length) return null;

    // Build hierarchy: keep the most recent heading at each level
    const hierarchy: Map<number, string> = new Map();

    for (const heading of prior) {
      hierarchy.set(heading.level, heading.text);
      // Clear deeper levels when a higher-level heading appears
      for (const [level] of hierarchy) {
        if (level > heading.level) {
          hierarchy.delete(level);
        }
      }
    }

    // Sort by level and join
    const parts = Array.from(hierarchy.entries())
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text);

    return parts.length > 0 ? parts.join(' > ') : null;
  }

  private findNearestHeading(
    charOffset: number,
    headingIndex: HeadingEntry[],
  ): string | null {
    if (!headingIndex.length) return null;

    let nearest: HeadingEntry | null = null;
    for (const heading of headingIndex) {
      if (heading.charOffset <= charOffset) {
        nearest = heading;
      } else {
        break; // headings are sorted by offset
      }
    }

    return nearest ? nearest.text : null;
  }

  private resolveCharOffset(chunk: Chunk, fullText: string): number {
    const snippet = chunk.content.substring(0, 80);
    const searchStart = Math.max(0, chunk.charOffset - 500);
    const found = fullText.indexOf(snippet, searchStart);
    return found >= 0 ? found : chunk.charOffset;
  }

  private extractKeywords(chunkContent: string): string[] {
    const keywords = new Set<string>();

    // Extract bold terms
    const boldRegex = /\*\*"?([^*"]+)"?\*\*/g;
    let match: RegExpExecArray | null;
    while ((match = boldRegex.exec(chunkContent)) !== null) {
      const term = match[1]!.trim();
      // Skip labels like "Version:" — only keep terms that look like keywords
      if (term.length > 1 && term.length < 80 && !/:$/.test(term)) {
        keywords.add(term);
      }
    }

    // Extract capitalized defined terms that appear multiple times
    const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const termCounts = new Map<string, number>();
    while ((match = capitalizedRegex.exec(chunkContent)) !== null) {
      const term = match[1]!;
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
    for (const [term, count] of termCounts) {
      if (count >= 2) {
        keywords.add(term);
      }
    }

    return Array.from(keywords);
  }

  private filterCrossRefsInChunk(
    chunkContent: string,
    allCrossRefs: CrossRef[],
  ): CrossRef[] {
    return allCrossRefs.filter(
      (ref) =>
        chunkContent.includes(ref.id) || chunkContent.includes(ref.title),
    );
  }
}
