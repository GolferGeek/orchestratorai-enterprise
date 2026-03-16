import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  DocumentTypeClassificationService,
  DocumentTypeClassification,
} from './document-type-classification.service';
import {
  SectionDetectionService,
  SectionDetectionResult,
} from './section-detection.service';
import {
  SignatureDetectionService,
  SignatureDetectionResult,
} from './signature-detection.service';
import {
  DateExtractionService,
  DateExtractionResult,
} from './date-extraction.service';
import {
  PartyExtractionService,
  PartyExtractionResult,
} from './party-extraction.service';
import {
  ConfidenceScoringService,
  ConfidenceScore,
} from './confidence-scoring.service';

/**
 * Comprehensive legal metadata for a document
 */
export interface LegalMetadata {
  /** Document classification */
  documentType: DocumentTypeClassification;
  /** Detected sections and clauses */
  sections: SectionDetectionResult;
  /** Signature blocks and signatories */
  signatures: SignatureDetectionResult;
  /** Extracted dates */
  dates: DateExtractionResult;
  /** Extracted parties */
  parties: PartyExtractionResult;
  /** Overall confidence scoring */
  confidence: ConfidenceScore;
  /** Metadata extraction timestamp */
  extractedAt: string;
}

/**
 * Legal Metadata Service
 *
 * @deprecated This service has been replaced by LegalIntelligenceService.
 * The original M1 implementation used 7 microservices with 5-6 LLM calls.
 * The new implementation uses 1 service with 1 LLM call.
 *
 * **Why deprecated:**
 * - Over-engineered: 7 services for what should be 1
 * - Slow: 5-6 sequential LLM calls
 * - Complex: Hard to maintain and understand
 * - Expensive: Multiple API calls per document
 *
 * **Migration:**
 * Replace:
 * ```typescript
 * await legalMetadata.extractMetadata({ extractedText, ... }, context)
 * ```
 * With:
 * ```typescript
 * await legalIntelligence.extractMetadata(extractedText, context)
 * ```
 *
 * **Kept for:** Backward compatibility during transition. Will be removed in future release.
 *
 * @see LegalIntelligenceService for the simplified replacement
 *
 * Orchestrates all legal metadata extraction tasks and aggregates results
 * into a unified metadata structure. This is the main entry point for
 * extracting comprehensive legal metadata from documents.
 *
 * Orchestration Flow:
 * 1. Document Type Classification (determines document category)
 * 2. Section Detection (identifies structure and clauses)
 * 3. Signature Detection (finds signature blocks and parties)
 * 4. Date Extraction (extracts and normalizes dates)
 * 5. Party Extraction (identifies contracting parties)
 * 6. Confidence Scoring (evaluates extraction quality)
 *
 * Parallel Execution:
 * - Some extractions can run in parallel (dates, parties, signatures)
 * - Others depend on prior results (confidence scoring)
 * - Document type influences subsequent extraction strategies
 *
 * Multi-Page Documents:
 * - All services support multi-page documents
 * - Context continuity maintained across pages
 * - Results aggregated at document level
 *
 * ExecutionContext Flow:
 * - Receives ExecutionContext and passes to all extraction services
 * - LLM-based services (classification, sections, parties) use context
 * - Usage tracking automatic via LLM service integration
 *
 * Error Handling:
 * - Individual extraction failures don't block other extractions
 * - Failed extractions return low-confidence results
 * - Overall confidence reflects extraction quality
 *
 * @example
 * ```typescript
 * const metadata = await legalMetadata.extractMetadata(
 *   {
 *     extractedText: '...',
 *     extractionMethod: 'vision',
 *     ocrConfidence: 0.95,
 *   },
 *   executionContext
 * );
 * // metadata: {
 * //   documentType: { type: 'contract', confidence: 0.95, ... },
 * //   sections: { sections: [...], confidence: 0.85, ... },
 * //   signatures: { signatures: [...], confidence: 0.9, ... },
 * //   dates: { dates: [...], primaryDate: {...}, confidence: 0.88, ... },
 * //   parties: { parties: [...], contractingParties: [...], confidence: 0.87, ... },
 * //   confidence: { overall: 0.89, breakdown: {...}, factors: {...} }
 * // }
 * ```
 */
@Injectable()
export class LegalMetadataService {
  private readonly logger = new Logger(LegalMetadataService.name);

  constructor(
    private readonly documentTypeClassification: DocumentTypeClassificationService,
    private readonly sectionDetection: SectionDetectionService,
    private readonly signatureDetection: SignatureDetectionService,
    private readonly dateExtraction: DateExtractionService,
    private readonly partyExtraction: PartyExtractionService,
    private readonly confidenceScoring: ConfidenceScoringService,
  ) {}

  /**
   * Extract comprehensive legal metadata from a document
   *
   * @param params - Extraction parameters
   * @param params.extractedText - Document text from OCR/vision/native extraction
   * @param params.extractionMethod - Method used for text extraction
   * @param params.ocrConfidence - OCR confidence score (if applicable)
   * @param context - ExecutionContext for LLM service calls
   * @returns LegalMetadata with all extracted information
   */
  async extractMetadata(
    params: {
      extractedText: string;
      extractionMethod: 'vision' | 'ocr' | 'native' | 'none';
      ocrConfidence?: number;
    },
    context: ExecutionContext,
  ): Promise<LegalMetadata> {
    const { extractedText, extractionMethod, ocrConfidence } = params;

    this.logger.log(
      `🔍 [LEGAL-METADATA] Starting metadata extraction (${extractedText.length} chars, method=${extractionMethod})`,
    );

    const startTime = Date.now();

    // Phase 1: Document Type Classification (sequential - informs other extractions)
    this.logger.log(`🔍 [LEGAL-METADATA] Phase 1: Classifying document type`);
    const documentType = await this.documentTypeClassification.classify(
      extractedText,
      context,
    );
    this.logger.log(
      `🔍 [LEGAL-METADATA] Document type: ${documentType.type} (confidence=${documentType.confidence.toFixed(2)})`,
    );

    // Phase 2: Parallel extractions (dates, signatures, sections, parties)
    this.logger.log(
      `🔍 [LEGAL-METADATA] Phase 2: Running parallel extractions`,
    );

    const [sections, signatures, dates, parties] = await Promise.all([
      // Section detection (LLM-based for complex documents)
      this.sectionDetection
        .detectSections(extractedText, context)
        .catch((error) => {
          this.logger.error(
            `🔍 [LEGAL-METADATA] Section detection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            sections: [],
            confidence: 0.1,
            structureType: 'unstructured' as const,
          };
        }),

      // Signature detection (pattern-based, no LLM)
      Promise.resolve(
        this.signatureDetection.detectSignatures(extractedText),
      ).catch((error) => {
        this.logger.error(
          `🔍 [LEGAL-METADATA] Signature detection failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          signatures: [],
          confidence: 0.1,
          partyCount: 0,
        };
      }),

      // Date extraction (pattern-based, no LLM)
      Promise.resolve(this.dateExtraction.extractDates(extractedText)).catch(
        (error) => {
          this.logger.error(
            `🔍 [LEGAL-METADATA] Date extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            dates: [],
            confidence: 0.1,
          };
        },
      ),

      // Party extraction (hybrid: patterns + LLM)
      this.partyExtraction
        .extractParties(extractedText, context)
        .catch((error) => {
          this.logger.error(
            `🔍 [LEGAL-METADATA] Party extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            parties: [],
            confidence: 0.1,
          };
        }),
    ]);

    this.logger.log(
      `🔍 [LEGAL-METADATA] Parallel extractions complete: sections=${sections.sections.length}, signatures=${signatures.signatures.length}, dates=${dates.dates.length}, parties=${parties.parties.length}`,
    );

    // Phase 3: Confidence Scoring (sequential - depends on all results)
    this.logger.log(
      `🔍 [LEGAL-METADATA] Phase 3: Calculating confidence scores`,
    );
    const confidence = this.confidenceScoring.calculateConfidence({
      extractedText,
      extractionMethod,
      ocrConfidence,
      patternMatchCount: this.countPatternMatches(
        sections,
        signatures,
        dates,
        parties,
      ),
      missingFields: this.identifyMissingFields(
        documentType,
        sections,
        signatures,
        dates,
        parties,
      ),
      individualScores: {
        documentType: documentType.confidence,
        sections: sections.confidence,
        signatures: signatures.confidence,
        dates: dates.confidence,
        parties: parties.confidence,
      },
    });

    const elapsedTime = Date.now() - startTime;

    this.logger.log(
      `🔍 [LEGAL-METADATA] Metadata extraction complete: overall_confidence=${confidence.overall.toFixed(2)}, elapsed=${elapsedTime}ms`,
    );

    // Log confidence level
    const confidenceLevel = this.confidenceScoring.getConfidenceLevel(
      confidence.overall,
    );
    this.logger.log(
      `🔍 [LEGAL-METADATA] Confidence level: ${confidenceLevel.level} - ${confidenceLevel.description}`,
    );

    return {
      documentType,
      sections,
      signatures,
      dates,
      parties,
      confidence,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Count total pattern matches across all extractions
   */
  private countPatternMatches(
    sections: SectionDetectionResult,
    signatures: SignatureDetectionResult,
    dates: DateExtractionResult,
    parties: PartyExtractionResult,
  ): number {
    return (
      sections.sections.length +
      signatures.signatures.length +
      dates.dates.length +
      parties.parties.length
    );
  }

  /**
   * Identify missing or incomplete fields based on document type
   */
  private identifyMissingFields(
    documentType: DocumentTypeClassification,
    sections: SectionDetectionResult,
    signatures: SignatureDetectionResult,
    dates: DateExtractionResult,
    parties: PartyExtractionResult,
  ): string[] {
    const missing: string[] = [];

    // Contract-specific checks
    if (documentType.type === 'contract' || documentType.type === 'agreement') {
      if (parties.parties.length < 2) {
        missing.push('parties');
      }
      if (signatures.signatures.length === 0) {
        missing.push('signatures');
      }
      if (!dates.primaryDate) {
        missing.push('effectiveDate');
      }
      if (sections.sections.length < 3) {
        missing.push('sections');
      }
    }

    // Pleading-specific checks
    if (
      documentType.type === 'pleading' ||
      documentType.type === 'motion' ||
      documentType.type === 'brief'
    ) {
      if (parties.parties.length < 2) {
        missing.push('parties');
      }
      if (!dates.dates.some((d) => d.dateType === 'filing_date')) {
        missing.push('filingDate');
      }
    }

    // Correspondence checks
    if (documentType.type === 'correspondence') {
      if (!dates.primaryDate) {
        missing.push('date');
      }
      if (parties.parties.length === 0) {
        missing.push('parties');
      }
    }

    return missing;
  }

  /**
   * Get extraction summary for logging/debugging
   */
  getSummary(metadata: LegalMetadata): string {
    const summary = [
      `Document Type: ${metadata.documentType.type} (${(metadata.documentType.confidence * 100).toFixed(0)}%)`,
      `Sections: ${metadata.sections.sections.length}`,
      `Signatures: ${metadata.signatures.signatures.length}`,
      `Dates: ${metadata.dates.dates.length}`,
      `Parties: ${metadata.parties.parties.length}`,
      `Overall Confidence: ${(metadata.confidence.overall * 100).toFixed(0)}%`,
    ].join(' | ');

    return summary;
  }

  /**
   * Extract key facts for quick reference
   */
  getKeyFacts(metadata: LegalMetadata): {
    documentType: string;
    primaryDate?: string;
    parties: string[];
    signatures: number;
    confidence: string;
  } {
    return {
      documentType: metadata.documentType.type,
      primaryDate: metadata.dates.primaryDate?.normalizedDate,
      parties: metadata.parties.parties.map((p) => p.name),
      signatures: metadata.signatures.signatures.length,
      confidence: this.confidenceScoring.getConfidenceLevel(
        metadata.confidence.overall,
      ).level,
    };
  }
}
