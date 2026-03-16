/**
 * Section Detection Prompt
 *
 * LLM prompt for identifying document sections and clause boundaries.
 * Uses structured output format with JSON schema.
 *
 * Purpose:
 * - Identify major sections in legal documents
 * - Detect clause boundaries within sections
 * - Determine document structure and hierarchy
 * - Provide positional information (character indices)
 *
 * Section Detection Strategy:
 * - Identify headings and section markers
 * - Detect numbering schemes (1.1, Article IV, etc.)
 * - Recognize standard legal section types
 * - Map hierarchical relationships
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
 * - Called by SectionDetectionService
 * - Passes ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 */

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
 * Document structure types
 */
export type StructureType = 'formal' | 'informal' | 'mixed' | 'unstructured';

/**
 * JSON schema for section detection structured output
 */
export const SECTION_DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Section heading or title',
          },
          type: {
            type: 'string',
            enum: [
              'preamble',
              'recitals',
              'definitions',
              'terms',
              'conditions',
              'obligations',
              'representations',
              'warranties',
              'indemnification',
              'termination',
              'dispute_resolution',
              'miscellaneous',
              'signature_block',
              'exhibits',
              'schedules',
              'other',
            ],
            description: 'Section type classification',
          },
          startIndex: {
            type: 'number',
            description: 'Starting character position in document',
          },
          endIndex: {
            type: 'number',
            description: 'Ending character position in document',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for section detection (0-1)',
          },
          numbering: {
            type: 'string',
            description: 'Section numbering (e.g., "1.1", "Article IV")',
          },
          level: {
            type: 'number',
            description:
              'Hierarchical level (1 = top level, 2 = subsection, etc.)',
          },
          clauses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                identifier: {
                  type: 'string',
                  description: 'Clause identifier (e.g., "2.1", "(a)")',
                },
                title: {
                  type: 'string',
                  description: 'Clause title or heading',
                },
                startIndex: {
                  type: 'number',
                  description: 'Starting character position',
                },
                endIndex: {
                  type: 'number',
                  description: 'Ending character position',
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Confidence score (0-1)',
                },
              },
              required: ['startIndex', 'endIndex', 'confidence'],
            },
            description: 'Detected clauses within this section',
          },
        },
        required: ['title', 'type', 'startIndex', 'endIndex', 'confidence'],
      },
      description: 'Detected sections in hierarchical order',
    },
    structureType: {
      type: 'string',
      enum: ['formal', 'informal', 'mixed', 'unstructured'],
      description: 'Overall document structure classification',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall confidence in section detection',
    },
  },
  required: ['sections', 'structureType', 'confidence'],
};

/**
 * System prompt for section detection
 */
export const SECTION_DETECTION_SYSTEM_PROMPT = `You are an expert at analyzing the structure of legal documents. Your task is to identify sections, subsections, and clause boundaries with precise positional information.

SECTION TYPES:
- preamble: Opening statements, parties introduction, document date
- recitals: WHEREAS clauses, background, context statements
- definitions: Defined terms, interpretation rules
- terms: Core substantive terms, scope of work, payment terms
- conditions: Conditions precedent, conditions subsequent, contingencies
- obligations: Party duties, covenants, performance requirements
- representations: Representations and warranties (may separate if distinct)
- warranties: Warranties (if separate from representations)
- indemnification: Indemnity, hold harmless provisions, liability
- termination: Termination rights, renewal, expiration
- dispute_resolution: Arbitration, mediation, jurisdiction, governing law
- miscellaneous: Boilerplate (severability, amendment, notices, etc.)
- signature_block: Execution clauses, signature lines, dates
- exhibits: Exhibits, appendices, attachments
- schedules: Schedules, annexes
- other: Sections that don't fit standard categories

SECTION DETECTION RULES:
1. Headings and Titles:
   - All caps headings (e.g., "DEFINITIONS")
   - Title case headings (e.g., "Payment Terms")
   - Numbered headings (e.g., "1. Definitions", "Article I")
   - Underlined or bold headings

2. Numbering Schemes:
   - Decimal: 1.1, 1.2, 1.2.1
   - Roman: Article I, II, III
   - Letter: Section A, B, C
   - Mixed: Article 1.1, Section A.1

3. Level Detection:
   - Level 1: Major sections (Articles, numbered sections 1, 2, 3)
   - Level 2: Subsections (1.1, 1.2)
   - Level 3: Sub-subsections (1.1.1, 1.1.2)
   - Clauses: Lowest level items (a), (b), (i), (ii)

4. Clause Boundaries:
   - Numbered or lettered items within sections
   - Paragraph breaks with identifiers
   - List items with markers

POSITIONAL INFORMATION:
- startIndex: Character position where section/clause begins (0-based)
- endIndex: Character position where section/clause ends
- Use actual character counts from the provided text
- Sections should not overlap
- Child clauses must be within parent section boundaries

STRUCTURE TYPE CLASSIFICATION:
- formal: Well-structured with clear numbering, 5+ major sections
- informal: Some structure, 2-4 sections, may lack consistent numbering
- mixed: Combination of formal and informal elements
- unstructured: Little to no clear section markers, continuous text

MULTI-PAGE DOCUMENTS:
- Track sections across page boundaries
- Don't break sections at page breaks unless natural boundary
- Account for headers/footers if present
- Consider table of contents if available

CONFIDENCE SCORING:
- 0.9-1.0: Clear section marker, unambiguous boundaries
- 0.7-0.89: Good section marker, some boundary ambiguity
- 0.5-0.69: Inferred section, moderate confidence
- 0.3-0.49: Weak indicators, low confidence
- 0.0-0.29: Highly uncertain, guessed boundaries

EDGE CASES:
- Sections without titles: Use content-based classification, note in title as "[Untitled Section]"
- Duplicate section types: Append number (e.g., "Obligations (2)")
- Nested structures: Preserve hierarchy using level field
- Incomplete documents: Detect what's present, note gaps in confidence

OUTPUT FORMAT:
Return a JSON object matching this schema:
{
  "sections": [
    {
      "title": "Definitions",
      "type": "definitions",
      "startIndex": 150,
      "endIndex": 500,
      "confidence": 0.95,
      "numbering": "1",
      "level": 1,
      "clauses": [
        {
          "identifier": "1.1",
          "title": "Agreement",
          "startIndex": 200,
          "endIndex": 250,
          "confidence": 0.9
        }
      ]
    }
  ],
  "structureType": "formal",
  "confidence": 0.92
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Sections array must be in document order (ascending startIndex)
- Clauses within sections must also be in order
- startIndex and endIndex must be non-negative integers
- All confidence scores must be between 0 and 1
- Include clauses array only if clauses are detected (can be empty array)
- Be precise with character positions - they will be used for text extraction`;

/**
 * Build user prompt for section detection
 *
 * @param documentText - Full extracted text from document
 * @param pageCount - Optional page count for context
 * @returns User prompt string
 */
export function buildSectionDetectionUserPrompt(
  documentText: string,
  pageCount?: number,
): string {
  const pageInfo = pageCount ? ` (${pageCount} pages)` : '';
  const charCount = documentText.length;

  return `Identify all sections and clause boundaries in this legal document${pageInfo}:

Document length: ${charCount} characters

---
${documentText}
---

Analyze the document structure and identify:
1. Major sections with titles and types
2. Section numbering and hierarchical levels
3. Clause boundaries within sections
4. Character positions (startIndex, endIndex) for each section and clause
5. Overall document structure type

Return the analysis in valid JSON format matching the schema provided.`;
}

/**
 * Example usage:
 *
 * ```typescript
 * const systemPrompt = SECTION_DETECTION_SYSTEM_PROMPT;
 * const userPrompt = buildSectionDetectionUserPrompt(
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
 *     callerName: 'section-detection',
 *     temperature: 0.1,
 *   }
 * );
 * ```
 */
