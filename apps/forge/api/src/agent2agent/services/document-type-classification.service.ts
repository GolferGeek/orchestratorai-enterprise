import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Document type classification result
 */
export interface DocumentTypeClassification {
  /** Primary document type */
  type: LegalDocumentType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Alternative types with confidence */
  alternatives?: Array<{
    type: LegalDocumentType;
    confidence: number;
  }>;
  /** Reasoning for classification */
  reasoning?: string;
}

/**
 * Supported legal document types
 */
export type LegalDocumentType =
  | 'contract'
  | 'agreement'
  | 'pleading'
  | 'motion'
  | 'brief'
  | 'correspondence'
  | 'memo'
  | 'opinion'
  | 'order'
  | 'notice'
  | 'filing'
  | 'invoice'
  | 'other';

/**
 * Document Type Classification Service
 *
 * Uses LLM to classify legal documents into standard categories.
 * Provides primary classification with confidence score and alternative types.
 *
 * Classification Strategy:
 * 1. Analyze document structure and key phrases
 * 2. Identify legal document markers (case numbers, signatures, etc.)
 * 3. Consider document context and formatting
 * 4. Return primary type with confidence and alternatives
 *
 * Supported Document Types:
 * - Contracts/Agreements: Employment, service, purchase, lease, etc.
 * - Pleadings: Complaints, answers, counterclaims
 * - Motions: Motion to dismiss, motion for summary judgment, etc.
 * - Briefs: Trial briefs, appellate briefs, memoranda
 * - Correspondence: Letters, emails, notices
 * - Memos: Legal memoranda, internal communications
 * - Opinions: Court opinions, advisory opinions
 * - Orders: Court orders, administrative orders
 * - Notices: Notice of hearing, notice of deposition, etc.
 * - Filings: Various court filings
 * - Invoices: Legal billing documents
 * - Other: Unclassified or mixed types
 *
 * ExecutionContext Flow:
 * - Passes full ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 * - Observability events emitted automatically
 *
 * @example
 * ```typescript
 * const classification = await documentTypeClassification.classify(
 *   extractedText,
 *   executionContext
 * );
 * // classification: { type: 'contract', confidence: 0.95, alternatives: [...] }
 * ```
 */
@Injectable()
export class DocumentTypeClassificationService {
  private readonly logger = new Logger(DocumentTypeClassificationService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Classify a legal document by analyzing its content
   *
   * @param text - Extracted document text
   * @param context - ExecutionContext for LLM service
   * @returns DocumentTypeClassification with primary type and alternatives
   */
  async classify(
    text: string,
    context: ExecutionContext,
  ): Promise<DocumentTypeClassification> {
    this.logger.log(
      `📋 [DOC-TYPE] Classifying document (${text.length} chars)`,
    );

    // Build classification prompt
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(text);

    try {
      // Call LLM service with ExecutionContext
      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'document-type-classification',
          temperature: 0.1, // Low temperature for consistent classification
        },
      );

      // Parse LLM response
      const responseText =
        typeof response === 'string' ? response : response.content || '';
      const classification = this.parseClassification(responseText);

      this.logger.log(
        `📋 [DOC-TYPE] Classification complete: ${classification.type} (confidence=${classification.confidence.toFixed(2)})`,
      );

      return classification;
    } catch (error) {
      this.logger.error(
        `📋 [DOC-TYPE] Classification failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return fallback classification
      return {
        type: 'other',
        confidence: 0.1,
        reasoning: `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Build system prompt for classification
   */
  private buildSystemPrompt(): string {
    return `You are an expert legal document classifier. Your task is to analyze legal documents and classify them into standard categories.

DOCUMENT TYPES:
- contract: Contracts, agreements, terms of service
- agreement: Formal agreements (employment, service, purchase, lease)
- pleading: Court pleadings (complaints, answers, counterclaims)
- motion: Motions filed with court (to dismiss, for summary judgment, etc.)
- brief: Legal briefs (trial briefs, appellate briefs, memoranda)
- correspondence: Letters, emails, notices between parties
- memo: Legal memoranda, internal communications
- opinion: Court opinions, advisory opinions
- order: Court orders, administrative orders
- notice: Notice of hearing, notice of deposition, etc.
- filing: General court filings
- invoice: Legal billing documents, fee statements
- other: Documents that don't fit standard categories

CLASSIFICATION CRITERIA:
1. Document structure (headings, sections, formatting)
2. Legal markers (case numbers, court names, party names)
3. Key phrases (WHEREAS, THEREFORE, NOW THEREFORE)
4. Signature blocks and execution clauses
5. Filing metadata (caption, case number, court)
6. Document purpose and context

OUTPUT FORMAT:
Return a JSON object with:
{
  "type": "primary-type",
  "confidence": 0.95,
  "alternatives": [
    {"type": "alternative-type", "confidence": 0.80}
  ],
  "reasoning": "Brief explanation of classification"
}

IMPORTANT:
- Confidence should be between 0 and 1
- Include alternatives if confidence < 0.9
- Provide reasoning for classification
- Return ONLY valid JSON, no markdown formatting`;
  }

  /**
   * Build user prompt with document text
   */
  private buildUserPrompt(text: string): string {
    // Use first 3000 chars for classification (sufficient for most documents)
    const excerpt = text.length > 3000 ? text.substring(0, 3000) + '...' : text;

    return `Classify the following legal document:

---
${excerpt}
---

Analyze the document and return the classification in JSON format.`;
  }

  /**
   * Parse LLM response into classification result
   */
  private parseClassification(response: string): DocumentTypeClassification {
    try {
      // Remove markdown code blocks if present
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/```json?\n?/g, '')
          .replace(/```\n?$/g, '');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(cleanResponse);

      // Extract alternatives safely
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const rawAlternatives = parsed.alternatives;
      const alternatives = Array.isArray(rawAlternatives)
        ? (rawAlternatives as Array<{ type: string; confidence: number }>)
            .map((alt) => ({
              type: this.validateDocumentType(alt.type),
              confidence: Math.max(0, Math.min(1, alt.confidence || 0)),
            }))
            .slice(0, 3) // Limit to top 3 alternatives
        : undefined;

      // Validate and normalize
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        type: this.validateDocumentType(parsed.type),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        alternatives,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        reasoning: parsed.reasoning || undefined,
      };
    } catch (error) {
      this.logger.warn(
        `📋 [DOC-TYPE] Failed to parse LLM response, using heuristics: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback to heuristic classification
      return this.heuristicClassification(response);
    }
  }

  /**
   * Validate document type against allowed values
   */
  private validateDocumentType(type: string): LegalDocumentType {
    const validTypes: LegalDocumentType[] = [
      'contract',
      'agreement',
      'pleading',
      'motion',
      'brief',
      'correspondence',
      'memo',
      'opinion',
      'order',
      'notice',
      'filing',
      'invoice',
      'other',
    ];

    return validTypes.includes(type as LegalDocumentType)
      ? (type as LegalDocumentType)
      : 'other';
  }

  /**
   * Fallback heuristic classification using keyword matching
   */
  private heuristicClassification(text: string): DocumentTypeClassification {
    const lower = text.toLowerCase();

    // Contract indicators
    if (
      lower.includes('whereas') ||
      lower.includes('now therefore') ||
      lower.includes('this agreement') ||
      lower.includes('the parties agree')
    ) {
      return {
        type: 'contract',
        confidence: 0.7,
        reasoning: 'Heuristic: contract keywords detected',
      };
    }

    // Pleading indicators
    if (
      lower.includes('plaintiff') ||
      lower.includes('defendant') ||
      lower.includes('complaint') ||
      lower.includes('answer')
    ) {
      return {
        type: 'pleading',
        confidence: 0.7,
        reasoning: 'Heuristic: pleading keywords detected',
      };
    }

    // Motion indicators
    if (lower.includes('motion to') || lower.includes('moves the court')) {
      return {
        type: 'motion',
        confidence: 0.7,
        reasoning: 'Heuristic: motion keywords detected',
      };
    }

    // Order indicators
    if (
      lower.includes('it is ordered') ||
      lower.includes('it is hereby ordered')
    ) {
      return {
        type: 'order',
        confidence: 0.7,
        reasoning: 'Heuristic: order keywords detected',
      };
    }

    // Default to 'other' with low confidence
    return {
      type: 'other',
      confidence: 0.3,
      reasoning: 'Heuristic: no clear indicators found',
    };
  }
}
