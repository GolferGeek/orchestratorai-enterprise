import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Detected document section
 */
export interface DocumentSection {
  /** Section title/heading */
  title: string;
  /** Section type */
  type: SectionType;
  /** Start position (character index) */
  startIndex: number;
  /** End position (character index) */
  endIndex: number;
  /** Section content */
  content: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected clauses within section */
  clauses?: DocumentClause[];
}

/**
 * Detected clause within a section
 */
export interface DocumentClause {
  /** Clause identifier (e.g., "2.1", "Article IV") */
  identifier?: string;
  /** Clause title */
  title?: string;
  /** Start position (character index) */
  startIndex: number;
  /** End position (character index) */
  endIndex: number;
  /** Clause content */
  content: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Section types
 */
export type SectionType =
  | 'preamble'
  | 'recitals'
  | 'definitions'
  | 'terms'
  | 'conditions'
  | 'obligations'
  | 'representations'
  | 'warranties'
  | 'indemnification'
  | 'termination'
  | 'dispute_resolution'
  | 'miscellaneous'
  | 'signature_block'
  | 'exhibits'
  | 'schedules'
  | 'other';

/**
 * Section detection result
 */
export interface SectionDetectionResult {
  /** Detected sections */
  sections: DocumentSection[];
  /** Overall confidence score */
  confidence: number;
  /** Document structure type */
  structureType: 'formal' | 'informal' | 'mixed' | 'unstructured';
}

/**
 * Section Detection Service
 *
 * Identifies document sections and clause boundaries using a hybrid approach:
 * 1. Pattern-based detection (headings, numbering, formatting)
 * 2. LLM-based semantic analysis for complex structures
 *
 * Detection Strategy:
 * - First pass: Use regex patterns to detect obvious section markers
 * - Second pass: Use LLM to identify semantic sections and validate
 * - Third pass: Detect clauses within sections
 * - Final: Merge results and resolve conflicts
 *
 * Supported Section Types:
 * - Preamble: Opening statements, introductory text
 * - Recitals: WHEREAS clauses, background information
 * - Definitions: Defined terms section
 * - Terms: Core contractual terms
 * - Conditions: Conditions precedent/subsequent
 * - Obligations: Party obligations and duties
 * - Representations & Warranties: Reps and warranties
 * - Indemnification: Indemnity provisions
 * - Termination: Termination and renewal provisions
 * - Dispute Resolution: Arbitration, mediation, jurisdiction
 * - Miscellaneous: Boilerplate provisions
 * - Signature Block: Execution and signatures
 * - Exhibits/Schedules: Attachments
 *
 * ExecutionContext Flow:
 * - Passes full ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 *
 * @example
 * ```typescript
 * const result = await sectionDetection.detectSections(
 *   extractedText,
 *   executionContext
 * );
 * // result: { sections: [...], confidence: 0.85, structureType: 'formal' }
 * ```
 */
@Injectable()
export class SectionDetectionService {
  private readonly logger = new Logger(SectionDetectionService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Detect sections and clauses in a legal document
   *
   * @param text - Extracted document text
   * @param context - ExecutionContext for LLM service
   * @returns SectionDetectionResult with sections and confidence
   */
  async detectSections(
    text: string,
    context: ExecutionContext,
  ): Promise<SectionDetectionResult> {
    this.logger.log(
      `📑 [SECTION-DETECT] Detecting sections (${text.length} chars)`,
    );

    // Phase 1: Pattern-based detection
    const patternSections = this.detectPatternSections(text);

    // Phase 2: LLM-based semantic analysis (for complex documents)
    let llmSections: DocumentSection[] = [];
    if (text.length > 500 && patternSections.length < 3) {
      // Use LLM for unstructured or poorly structured documents
      llmSections = await this.detectLLMSections(text, context);
    }

    // Phase 3: Merge and resolve conflicts
    const sections = this.mergeSections(patternSections, llmSections);

    // Phase 4: Detect clauses within sections
    for (const section of sections) {
      if (section.content.length > 200) {
        section.clauses = this.detectClauses(
          section.content,
          section.startIndex,
        );
      }
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(sections, text.length);

    // Determine structure type
    const structureType = this.determineStructureType(sections, text);

    this.logger.log(
      `📑 [SECTION-DETECT] Detection complete: ${sections.length} sections, confidence=${confidence.toFixed(2)}, structure=${structureType}`,
    );

    return { sections, confidence, structureType };
  }

  /**
   * Detect sections using pattern matching (headings, numbering, etc.)
   */
  private detectPatternSections(text: string): DocumentSection[] {
    const sections: DocumentSection[] = [];

    // Pattern 1: Numbered sections (e.g., "1. Definitions", "Article I")
    const numberedPattern =
      /^(\d+\.?|\b(?:Article|Section)\s+[IVX\d]+\.?)\s+([A-Z][^\n]{0,80})\n/gim;
    let match;

    while ((match = numberedPattern.exec(text)) !== null) {
      if (!match[2]) continue;

      const title = match[2].trim();
      const type = this.inferSectionType(title);
      const startIndex = match.index;

      sections.push({
        title,
        type,
        startIndex,
        endIndex: startIndex + match[0].length,
        content: '', // Will be filled later
        confidence: 0.8,
      });
    }

    // Pattern 2: ALL CAPS headings (e.g., "DEFINITIONS", "SIGNATURE BLOCK")
    const capsPattern = /^([A-Z][A-Z\s]{2,50})\n/gm;
    while ((match = capsPattern.exec(text)) !== null) {
      if (!match[1]) continue;

      const title = match[1].trim();
      const type = this.inferSectionType(title);
      const startIndex = match.index;

      // Avoid duplicates from numbered sections
      const isDuplicate = sections.some(
        (s) => Math.abs(s.startIndex - startIndex) < 10,
      );

      if (!isDuplicate) {
        sections.push({
          title,
          type,
          startIndex,
          endIndex: startIndex + match[0].length,
          content: '', // Will be filled later
          confidence: 0.7,
        });
      }
    }

    // Pattern 3: WHEREAS clauses (recitals)
    const whereasPattern = /\bWHEREAS\b/gi;
    if (whereasPattern.test(text)) {
      const firstWhereas = text.search(/\bWHEREAS\b/i);
      if (firstWhereas !== -1) {
        sections.push({
          title: 'Recitals',
          type: 'recitals',
          startIndex: firstWhereas,
          endIndex: firstWhereas + 7,
          content: '',
          confidence: 0.9,
        });
      }
    }

    // Pattern 4: Signature blocks
    const signaturePattern = /\b(?:IN WITNESS WHEREOF|SIGNED|EXECUTED)\b/gi;
    const signatureMatches = Array.from(text.matchAll(signaturePattern));
    if (signatureMatches.length > 0) {
      const lastMatch = signatureMatches[signatureMatches.length - 1];
      if (lastMatch) {
        sections.push({
          title: 'Signature Block',
          type: 'signature_block',
          startIndex: lastMatch.index || 0,
          endIndex: text.length,
          content: '',
          confidence: 0.85,
        });
      }
    }

    // Sort sections by start index
    sections.sort((a, b) => a.startIndex - b.startIndex);

    // Fill in content between sections
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const nextSection = sections[i + 1];

      if (!section) continue;

      const start = section.startIndex;
      const end = nextSection ? nextSection.startIndex : text.length;
      section.content = text.substring(start, end).trim();
      section.endIndex = end;
    }

    return sections;
  }

  /**
   * Detect sections using LLM semantic analysis
   */
  private async detectLLMSections(
    text: string,
    context: ExecutionContext,
  ): Promise<DocumentSection[]> {
    const systemPrompt = `You are an expert at analyzing legal document structure. Identify major sections in the document.

Return a JSON array of sections with:
{
  "title": "Section name",
  "type": "section_type",
  "startIndex": 0,
  "endIndex": 100,
  "confidence": 0.9
}

Valid section types: preamble, recitals, definitions, terms, conditions, obligations, representations, warranties, indemnification, termination, dispute_resolution, miscellaneous, signature_block, exhibits, schedules, other

Return ONLY valid JSON array, no markdown formatting.`;

    const userPrompt = `Identify the major sections in this legal document:\n\n${text.substring(0, 2000)}...`;

    try {
      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'section-detection',
          temperature: 0.1,
        },
      );

      const responseText =
        typeof response === 'string' ? response : response.content || '';
      const cleanResponse = responseText
        .replace(/```json?\n?/g, '')
        .replace(/```\n?$/g, '');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(cleanResponse);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.warn(
        `📑 [SECTION-DETECT] LLM detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Merge pattern-based and LLM-based sections
   */
  private mergeSections(
    patternSections: DocumentSection[],
    llmSections: DocumentSection[],
  ): DocumentSection[] {
    // For now, prefer pattern sections (more reliable)
    // TODO: Implement intelligent merging
    return patternSections.length > 0 ? patternSections : llmSections;
  }

  /**
   * Detect clauses within a section
   */
  private detectClauses(
    content: string,
    sectionStartIndex: number,
  ): DocumentClause[] {
    const clauses: DocumentClause[] = [];

    // Pattern: Numbered clauses (e.g., "2.1", "(a)", "i.")
    const clausePattern = /^(\(?\d+\.?\d*\)?|\([a-z]\)|\b[ivx]+\.)[\s]+/gim;
    let match;

    while ((match = clausePattern.exec(content)) !== null) {
      if (!match[1]) continue;

      const identifier = match[1];
      const startIndex = sectionStartIndex + match.index;

      clauses.push({
        identifier,
        startIndex,
        endIndex: startIndex + match[0].length,
        content: '', // Will be filled later
        confidence: 0.7,
      });
    }

    // Fill in content between clauses
    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i];
      const nextClause = clauses[i + 1];

      if (!clause) continue;

      const start = clause.startIndex - sectionStartIndex;
      const end = nextClause
        ? nextClause.startIndex - sectionStartIndex
        : content.length;
      clause.content = content.substring(start, end).trim();
      clause.endIndex = sectionStartIndex + end;
    }

    return clauses;
  }

  /**
   * Infer section type from title
   */
  private inferSectionType(title: string): SectionType {
    const lower = title.toLowerCase();

    if (lower.includes('definition')) return 'definitions';
    if (lower.includes('recital') || lower.includes('whereas'))
      return 'recitals';
    if (lower.includes('preamble') || lower.includes('introduction'))
      return 'preamble';
    if (lower.includes('term') && !lower.includes('termination'))
      return 'terms';
    if (lower.includes('condition')) return 'conditions';
    if (lower.includes('obligation') || lower.includes('duties'))
      return 'obligations';
    if (lower.includes('representation')) return 'representations';
    if (lower.includes('warrant')) return 'warranties';
    if (lower.includes('indemnif')) return 'indemnification';
    if (lower.includes('termination') || lower.includes('expiration'))
      return 'termination';
    if (lower.includes('dispute') || lower.includes('arbitration'))
      return 'dispute_resolution';
    if (lower.includes('miscellaneous') || lower.includes('general'))
      return 'miscellaneous';
    if (lower.includes('signature') || lower.includes('execution'))
      return 'signature_block';
    if (lower.includes('exhibit') || lower.includes('attachment'))
      return 'exhibits';
    if (lower.includes('schedule')) return 'schedules';

    return 'other';
  }

  /**
   * Calculate overall confidence based on sections detected
   */
  private calculateConfidence(
    sections: DocumentSection[],
    textLength: number,
  ): number {
    if (sections.length === 0) return 0;

    // Average section confidence
    const avgConfidence =
      sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length;

    // Coverage factor (how much of document is covered by sections)
    const coveredLength = sections.reduce(
      (sum, s) => sum + (s.endIndex - s.startIndex),
      0,
    );
    const coverage = coveredLength / textLength;

    // Combined score
    return avgConfidence * 0.7 + coverage * 0.3;
  }

  /**
   * Determine document structure type
   */
  private determineStructureType(
    sections: DocumentSection[],
    _text: string,
  ): 'formal' | 'informal' | 'mixed' | 'unstructured' {
    if (sections.length === 0) return 'unstructured';
    if (sections.length >= 5) return 'formal';
    if (sections.length >= 2) return 'informal';
    return 'mixed';
  }
}
