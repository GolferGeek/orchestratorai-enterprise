/**
 * Document Type Classification Prompt
 *
 * LLM prompt for classifying legal documents into standard types.
 * Uses structured output format with JSON schema.
 *
 * Purpose:
 * - Classify legal documents into standard categories
 * - Provide confidence scores for primary and alternative classifications
 * - Return reasoning for classification decisions
 *
 * Supported Document Types:
 * - contract: Contracts, agreements, terms of service
 * - nda: Non-disclosure agreements
 * - msa: Master service agreements
 * - pleading: Court pleadings (complaints, answers, counterclaims)
 * - motion: Motions filed with court
 * - brief: Legal briefs (trial, appellate)
 * - correspondence: Letters, emails, notices
 * - memorandum: Legal memoranda, internal communications
 * - opinion: Court opinions, advisory opinions
 * - order: Court orders, administrative orders
 * - notice: Notice of hearing, deposition, etc.
 * - filing: General court filings
 * - invoice: Legal billing documents
 * - other: Documents that don't fit standard categories
 *
 * ExecutionContext Flow:
 * - Called by DocumentTypeClassificationService
 * - Passes ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 */

/**
 * Supported legal document types
 */
export type LegalDocumentType =
  | 'contract'
  | 'nda'
  | 'msa'
  | 'pleading'
  | 'motion'
  | 'brief'
  | 'correspondence'
  | 'memorandum'
  | 'opinion'
  | 'order'
  | 'notice'
  | 'filing'
  | 'invoice'
  | 'other';

/**
 * JSON schema for structured output
 */
export const DOCUMENT_TYPE_CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'contract',
        'nda',
        'msa',
        'pleading',
        'motion',
        'brief',
        'correspondence',
        'memorandum',
        'opinion',
        'order',
        'notice',
        'filing',
        'invoice',
        'other',
      ],
      description: 'Primary document type',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score for primary classification (0-1)',
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'contract',
              'nda',
              'msa',
              'pleading',
              'motion',
              'brief',
              'correspondence',
              'memorandum',
              'opinion',
              'order',
              'notice',
              'filing',
              'invoice',
              'other',
            ],
            description: 'Alternative document type',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for alternative (0-1)',
          },
        },
        required: ['type', 'confidence'],
      },
      description: 'Alternative classifications (if primary confidence < 0.9)',
      maxItems: 3,
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation of classification decision',
    },
  },
  required: ['type', 'confidence', 'reasoning'],
};

/**
 * System prompt for document type classification
 */
export const DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT = `You are an expert legal document classifier. Your task is to analyze legal documents and classify them into standard categories with high accuracy.

DOCUMENT TYPES:
- contract: General contracts, agreements, terms of service
- nda: Non-disclosure agreements (confidentiality agreements)
- msa: Master service agreements (framework agreements)
- pleading: Court pleadings (complaints, answers, counterclaims, cross-claims)
- motion: Motions filed with court (to dismiss, for summary judgment, to compel, etc.)
- brief: Legal briefs (trial briefs, appellate briefs, memoranda of law)
- correspondence: Letters, emails, notices between parties or counsel
- memorandum: Legal memoranda, internal legal analysis, opinion letters
- opinion: Court opinions, judicial decisions, advisory opinions
- order: Court orders, administrative orders, judgments
- notice: Notice of hearing, notice of deposition, notice to appear
- filing: General court filings that don't fit other categories
- invoice: Legal billing documents, fee statements, engagement letters with billing
- other: Documents that don't fit standard categories or are mixed/hybrid

CLASSIFICATION CRITERIA:
1. Document Structure:
   - Heading format and style
   - Section organization
   - Numbering systems
   - Boilerplate provisions

2. Legal Markers:
   - Case numbers and captions
   - Court names and jurisdictions
   - Filing stamps and docket numbers
   - Party designations (plaintiff, defendant)

3. Key Phrases and Formulas:
   - Contract: "WHEREAS", "NOW THEREFORE", "The parties agree", "IN WITNESS WHEREOF"
   - NDA: "Confidential Information", "Disclosing Party", "Receiving Party", "non-disclosure"
   - MSA: "Master Agreement", "Statement of Work", "SOW", "framework agreement"
   - Pleading: "Plaintiff alleges", "comes now", "for causes of action"
   - Motion: "moves the court", "respectfully moves", "motion to", "in support of"
   - Brief: "argument", "memorandum of law", "points and authorities"

4. Signature Blocks and Execution:
   - Contract signature format vs. court filing attorney signature
   - Notary acknowledgments (contracts)
   - Certificate of service (court filings)

5. Document Purpose:
   - Creating obligations (contracts)
   - Protecting information (NDAs)
   - Initiating litigation (pleadings)
   - Requesting court action (motions)
   - Persuading court (briefs)

MULTI-PAGE DOCUMENT HANDLING:
- Analyze document structure across all pages
- Look for consistent headings and formatting
- Consider opening and closing sections
- Account for exhibits and attachments

EDGE CASES:
- Hybrid documents: Choose primary type, list hybrid nature in reasoning
- Incomplete documents: State in reasoning, use best judgment
- Amendments: Classify based on what's being amended (e.g., "contract amendment" → contract)
- Correspondence with attachments: Classify based on primary document

CONFIDENCE SCORING:
- 0.9-1.0: Clear, unambiguous classification with strong indicators
- 0.7-0.89: Strong classification with some ambiguity or mixed signals
- 0.5-0.69: Moderate confidence, document has features of multiple types
- 0.3-0.49: Low confidence, unclear or incomplete document
- 0.0-0.29: Very uncertain, minimal information or highly ambiguous

ALTERNATIVE CLASSIFICATIONS:
- Include alternatives when confidence < 0.9
- List up to 3 alternatives in descending confidence order
- Alternatives help capture hybrid or ambiguous documents

OUTPUT FORMAT:
Return a JSON object matching this schema:
{
  "type": "primary-document-type",
  "confidence": 0.95,
  "alternatives": [
    {"type": "alternative-type", "confidence": 0.75}
  ],
  "reasoning": "Brief explanation of classification based on key indicators found in the document"
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Confidence must be between 0 and 1
- Include alternatives array if confidence < 0.9 (can be empty array otherwise)
- Reasoning should reference specific elements observed (e.g., "Document contains WHEREAS clauses and signature blocks typical of contracts")
- Be precise and concise in reasoning (1-2 sentences)`;

/**
 * Build user prompt for document classification
 *
 * @param documentText - Extracted text from document (first 3000 chars recommended)
 * @param pageCount - Optional page count for context
 * @returns User prompt string
 */
export function buildDocumentTypeClassificationUserPrompt(
  documentText: string,
  pageCount?: number,
): string {
  const pageInfo = pageCount ? ` (${pageCount} pages)` : '';

  return `Classify the following legal document${pageInfo}:

---
${documentText}
---

Analyze the document structure, content, and purpose. Return the classification in valid JSON format matching the schema provided.`;
}

/**
 * Example usage:
 *
 * ```typescript
 * const systemPrompt = DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT;
 * const userPrompt = buildDocumentTypeClassificationUserPrompt(
 *   extractedText.substring(0, 3000),
 *   documentMetadata.pageCount
 * );
 *
 * const response = await llmService.generateResponse(
 *   systemPrompt,
 *   userPrompt,
 *   {
 *     executionContext: context,
 *     callerType: 'api',
 *     callerName: 'document-type-classification',
 *     temperature: 0.1,
 *   }
 * );
 * ```
 */
