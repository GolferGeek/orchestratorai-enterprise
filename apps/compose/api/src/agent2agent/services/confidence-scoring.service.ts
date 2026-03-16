import { Injectable, Logger } from '@nestjs/common';

/**
 * Confidence scores for extracted data
 */
export interface ConfidenceScore {
  /** Overall confidence score (0-1) */
  overall: number;
  /** Confidence breakdown by extraction type */
  breakdown: {
    /** Document type classification confidence */
    documentType?: number;
    /** Section detection confidence */
    sections?: number;
    /** Signature detection confidence */
    signatures?: number;
    /** Date extraction confidence */
    dates?: number;
    /** Party extraction confidence */
    parties?: number;
  };
  /** Factors affecting confidence */
  factors: {
    /** Text quality (0-1) */
    textQuality: number;
    /** Extraction method used */
    extractionMethod: 'vision' | 'ocr' | 'native' | 'none';
    /** Document completeness (0-1) */
    completeness: number;
    /** Pattern matches found */
    patternMatchCount: number;
  };
}

/**
 * Confidence Scoring Service
 *
 * Provides confidence scoring for all legal metadata extractions.
 * Evaluates extraction quality based on multiple factors:
 * - Text quality (OCR confidence, character distribution)
 * - Extraction method (vision > native > OCR)
 * - Pattern matching (number and quality of matches)
 * - Document completeness (missing sections, incomplete data)
 *
 * Confidence Levels:
 * - 0.9-1.0: High confidence (reliable extraction)
 * - 0.7-0.89: Medium confidence (needs review)
 * - 0.5-0.69: Low confidence (significant review needed)
 * - 0-0.49: Very low confidence (manual intervention required)
 *
 * @example
 * ```typescript
 * const score = confidenceScoring.calculateConfidence({
 *   extractedText: '...',
 *   extractionMethod: 'vision',
 *   ocrConfidence: 0.95,
 *   patternMatchCount: 12,
 *   missingFields: ['effectiveDate'],
 * });
 * // score: { overall: 0.87, breakdown: { ... }, factors: { ... } }
 * ```
 */
@Injectable()
export class ConfidenceScoringService {
  private readonly logger = new Logger(ConfidenceScoringService.name);

  /**
   * Calculate overall confidence score for extraction results
   *
   * @param params - Parameters for confidence calculation
   * @returns ConfidenceScore with overall and breakdown scores
   */
  calculateConfidence(params: {
    /** Extracted text content */
    extractedText: string;
    /** Extraction method used */
    extractionMethod: 'vision' | 'ocr' | 'native' | 'none';
    /** OCR confidence score (if applicable) */
    ocrConfidence?: number;
    /** Number of pattern matches found */
    patternMatchCount: number;
    /** Missing or incomplete fields */
    missingFields?: string[];
    /** Individual confidence scores */
    individualScores?: {
      documentType?: number;
      sections?: number;
      signatures?: number;
      dates?: number;
      parties?: number;
    };
  }): ConfidenceScore {
    this.logger.log(
      `🎯 [CONFIDENCE] Calculating confidence (method=${params.extractionMethod}, patterns=${params.patternMatchCount})`,
    );

    // Calculate text quality score
    const textQuality = this.calculateTextQuality(
      params.extractedText,
      params.extractionMethod,
      params.ocrConfidence,
    );

    // Calculate extraction method score (vision > native > OCR)
    const methodScore = this.calculateMethodScore(params.extractionMethod);

    // Calculate completeness score
    const completeness = this.calculateCompleteness(
      params.patternMatchCount,
      params.missingFields || [],
    );

    // Calculate pattern match score
    const patternScore = this.calculatePatternScore(params.patternMatchCount);

    // Calculate overall score (weighted average)
    const overall = this.calculateOverallScore({
      textQuality,
      methodScore,
      completeness,
      patternScore,
    });

    const score: ConfidenceScore = {
      overall,
      breakdown: params.individualScores || {},
      factors: {
        textQuality,
        extractionMethod: params.extractionMethod,
        completeness,
        patternMatchCount: params.patternMatchCount,
      },
    };

    this.logger.log(
      `🎯 [CONFIDENCE] Score calculated: ${overall.toFixed(2)} (text=${textQuality.toFixed(2)}, method=${methodScore.toFixed(2)}, complete=${completeness.toFixed(2)}, patterns=${patternScore.toFixed(2)})`,
    );

    return score;
  }

  /**
   * Calculate text quality score based on extraction method and content
   */
  private calculateTextQuality(
    text: string,
    method: 'vision' | 'ocr' | 'native' | 'none',
    ocrConfidence?: number,
  ): number {
    // Base score from extraction method
    let score = 0;
    if (method === 'vision') {
      score = 0.95; // Vision models are highly accurate
    } else if (method === 'native') {
      score = 1.0; // Native text extraction is perfect
    } else if (method === 'ocr') {
      score = ocrConfidence || 0.7; // Use OCR confidence if available
    } else {
      score = 0.5; // No extraction
    }

    // Adjust based on text characteristics
    if (text.length < 100) {
      score *= 0.8; // Short text is less reliable
    }

    // Check for garbled text (high rate of special characters)
    const specialCharRate =
      (text.match(/[^\w\s.,;:!?-]/g) || []).length / text.length;
    if (specialCharRate > 0.1) {
      score *= 0.7; // High special char rate suggests poor extraction
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate score based on extraction method
   */
  private calculateMethodScore(
    method: 'vision' | 'ocr' | 'native' | 'none',
  ): number {
    const methodScores: Record<typeof method, number> = {
      native: 1.0,
      vision: 0.95,
      ocr: 0.75,
      none: 0.5,
    };
    return methodScores[method];
  }

  /**
   * Calculate completeness score
   */
  private calculateCompleteness(
    patternMatchCount: number,
    missingFields: string[],
  ): number {
    // Start with pattern match contribution
    const patternContribution = Math.min(1.0, patternMatchCount / 10);

    // Penalize missing fields
    const missingPenalty = missingFields.length * 0.1;

    const score = Math.max(0, patternContribution - missingPenalty);
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate pattern match score
   */
  private calculatePatternScore(patternMatchCount: number): number {
    // Logarithmic scale - diminishing returns after 10 matches
    if (patternMatchCount === 0) return 0;
    if (patternMatchCount >= 20) return 1.0;

    return Math.log10(patternMatchCount + 1) / Math.log10(21);
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(factors: {
    textQuality: number;
    methodScore: number;
    completeness: number;
    patternScore: number;
  }): number {
    // Weighted average
    const weights = {
      textQuality: 0.3,
      methodScore: 0.2,
      completeness: 0.3,
      patternScore: 0.2,
    };

    const overall =
      factors.textQuality * weights.textQuality +
      factors.methodScore * weights.methodScore +
      factors.completeness * weights.completeness +
      factors.patternScore * weights.patternScore;

    return Math.max(0, Math.min(1, overall));
  }

  /**
   * Get confidence level description
   */
  getConfidenceLevel(score: number): {
    level: 'high' | 'medium' | 'low' | 'very-low';
    description: string;
  } {
    if (score >= 0.9) {
      return {
        level: 'high',
        description: 'High confidence - Reliable extraction',
      };
    } else if (score >= 0.7) {
      return {
        level: 'medium',
        description: 'Medium confidence - Review recommended',
      };
    } else if (score >= 0.5) {
      return {
        level: 'low',
        description: 'Low confidence - Significant review needed',
      };
    } else {
      return {
        level: 'very-low',
        description: 'Very low confidence - Manual intervention required',
      };
    }
  }
}
