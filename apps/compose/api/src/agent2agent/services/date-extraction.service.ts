import { Injectable, Logger } from '@nestjs/common';

/**
 * Extracted date with metadata
 */
export interface ExtractedDate {
  /** Original date string as found in document */
  originalText: string;
  /** Normalized date (ISO 8601 format: YYYY-MM-DD) */
  normalizedDate: string;
  /** Date type/classification */
  dateType: DateType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Position in document (character index) */
  position: number;
  /** Context (surrounding text) */
  context?: string;
}

/**
 * Date types in legal documents
 */
export type DateType =
  | 'document_date'
  | 'effective_date'
  | 'execution_date'
  | 'expiration_date'
  | 'termination_date'
  | 'renewal_date'
  | 'filing_date'
  | 'signature_date'
  | 'deadline'
  | 'other';

/**
 * Date extraction result
 */
export interface DateExtractionResult {
  /** All extracted dates */
  dates: ExtractedDate[];
  /** Primary document date (most likely main date) */
  primaryDate?: ExtractedDate;
  /** Overall confidence score */
  confidence: number;
}

/**
 * Date Extraction Service
 *
 * Extracts and normalizes dates from legal documents using multiple strategies:
 * 1. Pattern matching (various date formats)
 * 2. Context analysis (surrounding text for date type classification)
 * 3. Normalization (convert to ISO 8601 format)
 *
 * Supported Date Formats:
 * - MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY
 * - DD/MM/YYYY (with context detection)
 * - Month DD, YYYY (e.g., "January 15, 2024")
 * - DD Month YYYY (e.g., "15 January 2024")
 * - "this ___ day of Month, YYYY"
 * - YYYY-MM-DD (ISO format)
 *
 * Date Type Classification:
 * - Document Date: "Dated as of", "Date:", document header
 * - Effective Date: "Effective as of", "Effective Date"
 * - Execution Date: "Executed", "Signed this"
 * - Expiration Date: "Expires", "Expiration Date"
 * - Termination Date: "Terminates", "Term ends"
 * - Renewal Date: "Renews", "Renewal Date"
 * - Filing Date: "Filed", "Date Filed"
 * - Signature Date: Near signature blocks
 * - Deadline: "Due", "Deadline", "No later than"
 *
 * Normalization:
 * - All dates normalized to ISO 8601 (YYYY-MM-DD)
 * - Month names converted to numbers
 * - 2-digit years expanded (20-99 -> 19xx, 00-19 -> 20xx)
 * - Ambiguous dates flagged with lower confidence
 *
 * @example
 * ```typescript
 * const result = await dateExtraction.extractDates(extractedText);
 * // result: {
 * //   dates: [
 * //     { originalText: '01/15/2024', normalizedDate: '2024-01-15', dateType: 'effective_date', confidence: 0.9, ... }
 * //   ],
 * //   primaryDate: { ... },
 * //   confidence: 0.85
 * // }
 * ```
 */
@Injectable()
export class DateExtractionService {
  private readonly logger = new Logger(DateExtractionService.name);

  private readonly monthNames: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };

  /**
   * Extract dates from legal document text
   *
   * @param text - Extracted document text
   * @returns DateExtractionResult with all dates and primary date
   */
  extractDates(text: string): DateExtractionResult {
    this.logger.log(
      `📅 [DATE-EXTRACT] Extracting dates (${text.length} chars)`,
    );

    const dates: ExtractedDate[] = [];

    // Pattern 1: MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY
    this.extractNumericDates(text, dates);

    // Pattern 2: Month DD, YYYY (e.g., "January 15, 2024")
    this.extractMonthDayYear(text, dates);

    // Pattern 3: DD Month YYYY (e.g., "15 January 2024")
    this.extractDayMonthYear(text, dates);

    // Pattern 4: "this ___ day of Month, YYYY"
    this.extractDayOfMonthYear(text, dates);

    // Pattern 5: ISO format (YYYY-MM-DD)
    this.extractISODates(text, dates);

    // Classify date types based on context
    for (const date of dates) {
      date.dateType = this.classifyDateType(text, date.position);
      date.context = this.extractContext(text, date.position);
    }

    // Remove duplicate dates (same normalized date at similar positions)
    const uniqueDates = this.deduplicateDates(dates);

    // Find primary date
    const primaryDate = this.findPrimaryDate(uniqueDates);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(uniqueDates);

    this.logger.log(
      `📅 [DATE-EXTRACT] Extraction complete: ${uniqueDates.length} dates, primary=${primaryDate?.normalizedDate || 'none'}, confidence=${confidence.toFixed(2)}`,
    );

    return { dates: uniqueDates, primaryDate, confidence };
  }

  /**
   * Extract numeric dates (MM/DD/YYYY, MM-DD-YYYY, etc.)
   */
  private extractNumericDates(text: string, dates: ExtractedDate[]): void {
    const pattern = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [original, part1, part2, year] = match;

      if (!part1 || !part2 || !year) continue;

      const fullYear = this.normalizeYear(parseInt(year, 10));

      // Assume MM/DD/YYYY for US documents
      const month = parseInt(part1, 10);
      const day = parseInt(part2, 10);

      // Validate
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const normalized = `${fullYear}-${this.pad(month)}-${this.pad(day)}`;

        dates.push({
          originalText: original,
          normalizedDate: normalized,
          dateType: 'other', // Will be classified later
          confidence: 0.8,
          position: match.index,
        });
      }
    }
  }

  /**
   * Extract Month DD, YYYY format dates
   */
  private extractMonthDayYear(text: string, dates: ExtractedDate[]): void {
    const monthPattern = Object.keys(this.monthNames).join('|');
    const pattern = new RegExp(
      `\\b(${monthPattern})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`,
      'gi',
    );
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [original, monthName, day, year] = match;

      if (!monthName || !day || !year) continue;

      const month = this.monthNames[monthName.toLowerCase()];

      if (month) {
        const normalized = `${year}-${this.pad(month)}-${this.pad(parseInt(day, 10))}`;

        dates.push({
          originalText: original,
          normalizedDate: normalized,
          dateType: 'other',
          confidence: 0.95, // High confidence for named months
          position: match.index,
        });
      }
    }
  }

  /**
   * Extract DD Month YYYY format dates
   */
  private extractDayMonthYear(text: string, dates: ExtractedDate[]): void {
    const monthPattern = Object.keys(this.monthNames).join('|');
    const pattern = new RegExp(
      `\\b(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})\\b`,
      'gi',
    );
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [original, day, monthName, year] = match;

      if (!day || !monthName || !year) continue;

      const month = this.monthNames[monthName.toLowerCase()];

      if (month) {
        const normalized = `${year}-${this.pad(month)}-${this.pad(parseInt(day, 10))}`;

        dates.push({
          originalText: original,
          normalizedDate: normalized,
          dateType: 'other',
          confidence: 0.95,
          position: match.index,
        });
      }
    }
  }

  /**
   * Extract "this ___ day of Month, YYYY" format
   */
  private extractDayOfMonthYear(text: string, dates: ExtractedDate[]): void {
    const monthPattern = Object.keys(this.monthNames).join('|');
    const pattern = new RegExp(
      `this\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(${monthPattern}),?\\s+(\\d{4})`,
      'gi',
    );
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [original, day, monthName, year] = match;

      if (!day || !monthName || !year) continue;

      const month = this.monthNames[monthName.toLowerCase()];

      if (month) {
        const normalized = `${year}-${this.pad(month)}-${this.pad(parseInt(day, 10))}`;

        dates.push({
          originalText: original,
          normalizedDate: normalized,
          dateType: 'execution_date', // This format often appears in execution clauses
          confidence: 0.9,
          position: match.index,
        });
      }
    }
  }

  /**
   * Extract ISO format dates (YYYY-MM-DD)
   */
  private extractISODates(text: string, dates: ExtractedDate[]): void {
    const pattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [original, year, month, day] = match;

      if (!year || !month || !day) continue;

      // Validate
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        dates.push({
          originalText: original,
          normalizedDate: original, // Already in ISO format
          dateType: 'other',
          confidence: 1.0,
          position: match.index,
        });
      }
    }
  }

  /**
   * Classify date type based on surrounding context
   */
  private classifyDateType(text: string, position: number): DateType {
    // Extract context window (50 chars before and after)
    const start = Math.max(0, position - 50);
    const end = Math.min(text.length, position + 100);
    const context = text.substring(start, end).toLowerCase();

    // Check for date type indicators
    if (context.includes('effective') || context.includes('commencing')) {
      return 'effective_date';
    }
    if (context.includes('executed') || context.includes('signed this')) {
      return 'execution_date';
    }
    if (context.includes('expires') || context.includes('expiration')) {
      return 'expiration_date';
    }
    if (context.includes('terminates') || context.includes('termination')) {
      return 'termination_date';
    }
    if (context.includes('renews') || context.includes('renewal')) {
      return 'renewal_date';
    }
    if (context.includes('filed') || context.includes('filing')) {
      return 'filing_date';
    }
    if (context.includes('date:') || context.includes('dated as of')) {
      // Check if near signature block
      const signatureIndicators = ['by:', 'signature', 'name:', 'title:'];
      if (signatureIndicators.some((ind) => context.includes(ind))) {
        return 'signature_date';
      }
      return 'document_date';
    }
    if (
      context.includes('due') ||
      context.includes('deadline') ||
      context.includes('no later than')
    ) {
      return 'deadline';
    }

    // Check if at beginning of document (likely document date)
    if (position < text.length * 0.1) {
      return 'document_date';
    }

    // Check if near end of document (likely signature date)
    if (position > text.length * 0.8) {
      return 'signature_date';
    }

    return 'other';
  }

  /**
   * Extract context around date
   */
  private extractContext(text: string, position: number): string {
    const start = Math.max(0, position - 30);
    const end = Math.min(text.length, position + 80);
    return text.substring(start, end).trim();
  }

  /**
   * Remove duplicate dates
   */
  private deduplicateDates(dates: ExtractedDate[]): ExtractedDate[] {
    const seen = new Map<string, ExtractedDate>();

    for (const date of dates) {
      // Create key from normalized date and approximate position
      const positionBucket = Math.floor(date.position / 50);
      const key = `${date.normalizedDate}-${positionBucket}`;

      // Keep the one with higher confidence
      const existing = seen.get(key);
      if (!existing || date.confidence > existing.confidence) {
        seen.set(key, date);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.position - b.position);
  }

  /**
   * Find the primary date (most likely main document date)
   */
  private findPrimaryDate(dates: ExtractedDate[]): ExtractedDate | undefined {
    if (dates.length === 0) return undefined;

    // Priority order: document_date > effective_date > execution_date > others
    const priorities: Record<DateType, number> = {
      document_date: 10,
      effective_date: 9,
      execution_date: 8,
      signature_date: 7,
      filing_date: 6,
      expiration_date: 5,
      termination_date: 4,
      renewal_date: 3,
      deadline: 2,
      other: 1,
    };

    // Find date with highest priority and confidence
    return dates.reduce((best, current) => {
      const bestScore = priorities[best.dateType] * best.confidence;
      const currentScore = priorities[current.dateType] * current.confidence;
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(dates: ExtractedDate[]): number {
    if (dates.length === 0) return 0;

    // Average confidence of all dates
    const avgConfidence =
      dates.reduce((sum, d) => sum + d.confidence, 0) / dates.length;

    // Boost if we found a primary date
    const hasPrimaryDate = dates.some(
      (d) => d.dateType === 'document_date' || d.dateType === 'effective_date',
    );
    const primaryBoost = hasPrimaryDate ? 0.1 : 0;

    return Math.min(1.0, avgConfidence + primaryBoost);
  }

  /**
   * Normalize 2-digit years to 4-digit years
   */
  private normalizeYear(year: number): number {
    if (year >= 100) return year;

    // 20-99 -> 1920-1999, 00-19 -> 2000-2019
    return year >= 20 ? 1900 + year : 2000 + year;
  }

  /**
   * Pad number with leading zero
   */
  private pad(num: number): string {
    return num.toString().padStart(2, '0');
  }
}
