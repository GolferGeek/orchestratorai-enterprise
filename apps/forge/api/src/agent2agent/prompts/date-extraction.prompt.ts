/**
 * Date Extraction Prompt
 *
 * LLM prompt for extracting and classifying dates from legal documents.
 * Uses structured output format with JSON schema.
 *
 * Purpose:
 * - Extract all dates mentioned in legal documents
 * - Classify dates by type (document date, effective date, expiration, etc.)
 * - Normalize dates to ISO 8601 format
 * - Identify date relationships and dependencies
 * - Provide positional information and context
 *
 * Date Types:
 * - document_date: Date the document was created/drafted
 * - effective_date: Date when agreement becomes effective
 * - execution_date: Date when document was signed/executed
 * - expiration_date: Date when agreement expires or terminates
 * - termination_date: Specific termination date if known
 * - renewal_date: Renewal or extension date
 * - notice_period: Notice period dates (termination notice, etc.)
 * - deadline: Performance deadlines, deliverable dates
 * - milestone: Project milestones or phase dates
 * - payment_date: Payment due dates
 * - filing_date: Court filing dates
 * - hearing_date: Hearing, trial, or appearance dates
 * - other: Other dates that don't fit categories
 *
 * ExecutionContext Flow:
 * - Called by date extraction services
 * - Passes ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 */

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
  | 'notice_period'
  | 'deadline'
  | 'milestone'
  | 'payment_date'
  | 'filing_date'
  | 'hearing_date'
  | 'other';

/**
 * Extracted date information
 */
export interface ExtractedDate {
  /** Original date string as found in document */
  originalText: string;
  /** Normalized ISO 8601 date (YYYY-MM-DD) */
  normalizedDate: string;
  /** Date type classification */
  type: DateType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Position in document (character index) */
  position: number;
  /** Surrounding context */
  context?: string;
  /** Whether date is relative (e.g., "30 days after") */
  isRelative?: boolean;
  /** Base date for relative dates */
  relativeToDate?: string;
  /** Additional notes or qualifiers */
  notes?: string;
}

/**
 * JSON schema for date extraction structured output
 */
export const DATE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    dates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          originalText: {
            type: 'string',
            description: 'Original date string as found in document',
          },
          normalizedDate: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'ISO 8601 date (YYYY-MM-DD)',
          },
          type: {
            type: 'string',
            enum: [
              'document_date',
              'effective_date',
              'execution_date',
              'expiration_date',
              'termination_date',
              'renewal_date',
              'notice_period',
              'deadline',
              'milestone',
              'payment_date',
              'filing_date',
              'hearing_date',
              'other',
            ],
            description: 'Classification of date type',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description:
              'Confidence score for extraction and classification (0-1)',
          },
          position: {
            type: 'number',
            description: 'Character position where date appears in document',
          },
          context: {
            type: 'string',
            description: 'Surrounding text providing context',
          },
          isRelative: {
            type: 'boolean',
            description:
              'Whether date is relative (e.g., "30 days after effective date")',
          },
          relativeToDate: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Base date for relative dates (ISO 8601)',
          },
          notes: {
            type: 'string',
            description: 'Additional notes, qualifiers, or conditions',
          },
        },
        required: [
          'originalText',
          'normalizedDate',
          'type',
          'confidence',
          'position',
        ],
      },
      description: 'All extracted dates in document order',
    },
    documentDate: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Primary document date (ISO 8601)',
    },
    effectiveDate: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Effective date if identified (ISO 8601)',
    },
    expirationDate: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Expiration date if identified (ISO 8601)',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall confidence in date extraction',
    },
  },
  required: ['dates', 'confidence'],
};

/**
 * System prompt for date extraction
 */
export const DATE_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting and classifying dates from legal documents. Your task is to identify all dates, normalize them to ISO 8601 format, classify them by type, and provide contextual information.

DATE TYPES AND PATTERNS:
1. document_date:
   - Opening line: "This Agreement dated as of January 1, 2024"
   - Preamble: "Dated: January 1, 2024"
   - Common phrases: "dated", "as of", "made this ___ day of"

2. effective_date:
   - "This Agreement shall be effective as of..."
   - "Effective Date means..."
   - "This Agreement becomes effective on..."
   - Often different from document date

3. execution_date:
   - Date on signature line
   - "Executed on...", "Signed on..."
   - Date when parties actually signed
   - May differ from document date and effective date

4. expiration_date:
   - "This Agreement expires on..."
   - "Term ending on..."
   - "Shall remain in effect until..."
   - End date of agreement term

5. termination_date:
   - Actual termination date if specified
   - "Terminated effective..."
   - In amendments: "Agreement terminated on..."

6. renewal_date:
   - "Automatically renews on..."
   - "Renewal date of..."
   - Extension dates

7. notice_period:
   - "...days prior notice"
   - "Notice must be given by..."
   - Deadlines for giving notice

8. deadline:
   - Performance deadlines
   - "Deliverable due by..."
   - "Completion date of..."

9. milestone:
   - Project milestones
   - Phase completion dates
   - "Phase 1 completion: ..."

10. payment_date:
    - "Payment due on..."
    - "Invoice date of..."
    - Billing cycles

11. filing_date:
    - Court filing dates
    - "Filed on..."
    - Docket dates

12. hearing_date:
    - "Hearing scheduled for..."
    - "Trial date:"
    - Court appearances

DATE FORMAT RECOGNITION:
1. Full dates:
   - "January 1, 2024"
   - "1st of January, 2024"
   - "01/01/2024", "01-01-2024"
   - "2024-01-01"

2. Partial dates:
   - "January 2024" → 2024-01-01
   - "Q1 2024" → 2024-01-01 (first day of quarter)

3. Relative dates:
   - "30 days after Effective Date"
   - "Within 60 days of execution"
   - "On the anniversary of..."
   - Mark as isRelative: true
   - Identify base date in relativeToDate

4. Conditional dates:
   - "Upon completion of..."
   - "When [condition] occurs"
   - Note condition in notes field

NORMALIZATION RULES:
1. ISO 8601 Format:
   - Always output as YYYY-MM-DD
   - Examples: "2024-01-01", "2023-12-31"

2. Day defaults:
   - "January 2024" → "2024-01-01" (first of month)
   - "Q2 2024" → "2024-04-01" (first day of quarter)

3. Year inference:
   - If year omitted and document has year: use document year
   - If ambiguous: note in notes field

4. Relative dates:
   - If base date is known: calculate and provide normalized date
   - If base date unknown: set isRelative: true, explain in notes

CONTEXT EXTRACTION:
- Capture 20-50 characters before and after date
- Include enough context to understand date purpose
- Example: "This Agreement is effective as of January 1, 2024 and shall..."

CONFIDENCE SCORING:
- 0.9-1.0: Clear date with explicit type indicators, unambiguous format
- 0.7-0.89: Date found, type inferred from context, standard format
- 0.5-0.69: Date found but type uncertain or format ambiguous
- 0.3-0.49: Possible date, weak indicators, unclear context
- 0.0-0.29: Very uncertain, may not be a date

EDGE CASES:
- Multiple dates of same type: Include all, note in context which is primary
- Conflicting dates: Include both, note conflict in notes
- Amended dates: Include both original and amended dates
- Ranges: "January 1-15, 2024" → Extract as two dates or note as range
- Ongoing: "ongoing", "perpetual" → Set notes, may omit normalized date
- TBD: "To be determined" → Note in notes, set low confidence

POSITIONAL ACCURACY:
- position: Character index where date appears (0-based)
- Use actual character count from provided text
- For relative dates, position of the relative phrase

OUTPUT FORMAT:
Return a JSON object matching this schema:
{
  "dates": [
    {
      "originalText": "January 1, 2024",
      "normalizedDate": "2024-01-01",
      "type": "effective_date",
      "confidence": 0.95,
      "position": 245,
      "context": "This Agreement shall be effective as of January 1, 2024 and shall continue",
      "isRelative": false,
      "notes": "Explicitly stated effective date in opening paragraph"
    },
    {
      "originalText": "30 days after the Effective Date",
      "normalizedDate": "2024-01-31",
      "type": "deadline",
      "confidence": 0.85,
      "position": 1450,
      "context": "Party A shall deliver the report within 30 days after the Effective Date",
      "isRelative": true,
      "relativeToDate": "2024-01-01",
      "notes": "Calculated from effective date of 2024-01-01"
    }
  ],
  "documentDate": "2024-01-01",
  "effectiveDate": "2024-01-01",
  "expirationDate": "2025-01-01",
  "confidence": 0.92
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- All normalizedDate fields must be valid ISO 8601 (YYYY-MM-DD)
- dates array in document order (ascending position)
- Include documentDate, effectiveDate, expirationDate at top level if identifiable
- confidence scores between 0 and 1
- Extract ALL dates, even if uncertain (with appropriate confidence)
- For relative dates, try to calculate normalized date if base is known
- Be thorough but precise with context extraction`;

/**
 * Build user prompt for date extraction
 *
 * @param documentText - Full extracted text from document
 * @param pageCount - Optional page count for context
 * @returns User prompt string
 */
export function buildDateExtractionUserPrompt(
  documentText: string,
  pageCount?: number,
): string {
  const pageInfo = pageCount ? ` (${pageCount} pages)` : '';
  const charCount = documentText.length;

  return `Extract and classify all dates from this legal document${pageInfo}:

Document length: ${charCount} characters

---
${documentText}
---

Analyze the document and extract:
1. All dates with original text and normalized ISO 8601 format
2. Date type classification (document_date, effective_date, expiration_date, etc.)
3. Context for each date
4. Relative dates and their base dates
5. Character positions for each date
6. Primary dates (document date, effective date, expiration date)

Return the analysis in valid JSON format matching the schema provided.`;
}

/**
 * Example usage:
 *
 * ```typescript
 * const systemPrompt = DATE_EXTRACTION_SYSTEM_PROMPT;
 * const userPrompt = buildDateExtractionUserPrompt(
 *   fullDocumentText,
 *   documentMetadata.pageCount
 * );
 *
 * const response = await llmService.generateResponse(
 *   systemPrompt,
 *   userPrompt,
 *   {
 *     executionContext: context,
 *     callerType: 'api',
 *     callerName: 'date-extraction',
 *     temperature: 0.1,
 *   }
 * );
 * ```
 */
