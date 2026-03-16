/**
 * Signature Detection Prompt
 *
 * LLM prompt for detecting signature blocks and extracting signer information.
 * Uses structured output format with JSON schema.
 *
 * Purpose:
 * - Find signature blocks in legal documents
 * - Extract signing party names (entities)
 * - Extract signer names (individuals)
 * - Extract signer titles and roles
 * - Extract signature dates
 * - Provide positional information
 *
 * Signature Block Detection Strategy:
 * - Identify signature markers ("IN WITNESS WHEREOF", "SIGNED", "EXECUTED")
 * - Detect signature line patterns (underscores, "By:", "Name:")
 * - Extract party names (companies, entities)
 * - Extract individual names (signers)
 * - Extract titles (CEO, President, Authorized Representative)
 * - Extract dates near signature lines
 *
 * ExecutionContext Flow:
 * - Called by signature extraction services
 * - Passes ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 */

/**
 * Signature block information
 */
export interface SignatureBlock {
  /** Signing party name (company/entity) */
  partyName: string;
  /** Signer name (individual) */
  signerName?: string;
  /** Signer title or role */
  signerTitle?: string;
  /** Signature date */
  signatureDate?: string;
  /** Start position (character index) */
  startIndex: number;
  /** End position (character index) */
  endIndex: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional context */
  context?: string;
  /** Whether signature appears to be executed (has date/signature) */
  isExecuted?: boolean;
}

/**
 * JSON schema for signature detection structured output
 */
export const SIGNATURE_DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    signatureBlocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          partyName: {
            type: 'string',
            description:
              'Name of signing party (company, entity, or individual if no entity)',
          },
          signerName: {
            type: 'string',
            description: 'Name of individual signer (if identifiable)',
          },
          signerTitle: {
            type: 'string',
            description:
              'Title or role of signer (CEO, President, Attorney, etc.)',
          },
          signatureDate: {
            type: 'string',
            description: 'Date of signature (any format found in document)',
          },
          startIndex: {
            type: 'number',
            description: 'Starting character position of signature block',
          },
          endIndex: {
            type: 'number',
            description: 'Ending character position of signature block',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for this signature block (0-1)',
          },
          context: {
            type: 'string',
            description: 'Surrounding text or additional context',
          },
          isExecuted: {
            type: 'boolean',
            description:
              'Whether signature appears to be executed (has date or signature)',
          },
        },
        required: ['partyName', 'startIndex', 'endIndex', 'confidence'],
      },
      description: 'All detected signature blocks in document order',
    },
    hasSignatures: {
      type: 'boolean',
      description: 'Whether any signature blocks were found',
    },
    signatureRegionStart: {
      type: 'number',
      description: 'Character position where signature region begins',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall confidence in signature detection',
    },
  },
  required: ['signatureBlocks', 'hasSignatures', 'confidence'],
};

/**
 * System prompt for signature detection
 */
export const SIGNATURE_DETECTION_SYSTEM_PROMPT = `You are an expert at identifying signature blocks and extracting signer information from legal documents. Your task is to locate all signature blocks and extract complete signer details with precise positional information.

SIGNATURE BLOCK MARKERS:
1. Execution Clauses:
   - "IN WITNESS WHEREOF, the parties have executed this agreement"
   - "EXECUTED as of the date first written above"
   - "SIGNED and DELIVERED"
   - "The parties have caused this agreement to be executed"

2. Signature Line Patterns:
   - Underscore lines: _________________________ or _________________
   - By: lines with name/signature
   - Name: or Print Name:
   - Title: or Its:
   - Date: or Dated:

3. Party Identification:
   - Company names in all caps above signature
   - "By: [signature line]"
   - Entity names followed by signature block structure

EXTRACTION RULES:
1. Party Name (partyName):
   - Company or entity name (ACME CORPORATION)
   - Found above signature lines, often in all caps
   - May be preceded by party label ("SELLER:", "BUYER:")
   - For individuals without entities, use individual name

2. Signer Name (signerName):
   - Individual's name who signed
   - Found on signature line or "Name:" field
   - May be printed below signature
   - Format: First Last or full name as written

3. Signer Title (signerTitle):
   - Job title or role (CEO, President, CFO, Manager)
   - Found on "Title:" or "Its:" line
   - May say "Authorized Representative", "Attorney-in-Fact"
   - Include "as" phrases: "as Trustee", "as Agent"

4. Signature Date (signatureDate):
   - Date on "Date:" line near signature
   - Date written after signature
   - Extract in format as written (don't normalize yet)
   - Common formats: "January 1, 2024", "1/1/24", "01-01-2024"

5. Positional Information:
   - startIndex: Where signature block begins (party name or first marker)
   - endIndex: Where signature block ends (last line of block)
   - Signature blocks typically span 5-15 lines

6. Execution Status (isExecuted):
   - true: Has signature date, or handwritten signature visible
   - false: Blank signature lines, no date
   - Check for "Date:" field with actual date vs. blank line

SIGNATURE BLOCK STRUCTURE PATTERNS:
Pattern 1 - Corporate:
\`\`\`
ACME CORPORATION

By: _________________________
Name: John Smith
Title: Chief Executive Officer
Date: January 1, 2024
\`\`\`

Pattern 2 - Simple:
\`\`\`
SELLER:

_________________________
Jane Doe, President
ABC Company, Inc.
\`\`\`

Pattern 3 - Notarized:
\`\`\`
XYZ LLC

By: _________________________
Print Name: Robert Johnson
Its: Managing Member

Date: __________, 2024
\`\`\`

Pattern 4 - Individual:
\`\`\`
_________________________
[Printed Name]
[Individual]
\`\`\`

MULTI-PARTY DOCUMENTS:
- Detect all signature blocks (typically 2+ parties)
- Maintain document order
- Associate each block with correct party
- Handle counterpart signatures (same party, multiple locations)

CONFIDENCE SCORING:
- 0.9-1.0: Complete signature block with party, signer, title, and date
- 0.7-0.89: Has party and signature structure, may be missing some fields
- 0.5-0.69: Partial signature block, some elements unclear
- 0.3-0.49: Weak signature indicators, uncertain parsing
- 0.0-0.29: Highly uncertain, minimal signature elements

EDGE CASES:
- Multiple signers per party: Create separate blocks for each signer
- Signature pages separated: Detect all, even if scattered
- Electronic signatures: Note in context if visible markers ("Electronically signed")
- Witness/notary blocks: Include as separate blocks with appropriate context
- Incomplete blocks: Extract available information, note missing fields in context
- Amendments: Look for amendment signature blocks distinct from original

POSITIONAL ACCURACY:
- Character positions must be precise for text extraction
- startIndex should capture party name or opening marker
- endIndex should capture last line (date line or final signature element)
- Blocks should not overlap unless nested (e.g., notary within party block)

OUTPUT FORMAT:
Return a JSON object matching this schema:
{
  "signatureBlocks": [
    {
      "partyName": "ACME CORPORATION",
      "signerName": "John Smith",
      "signerTitle": "Chief Executive Officer",
      "signatureDate": "January 1, 2024",
      "startIndex": 15420,
      "endIndex": 15680,
      "confidence": 0.95,
      "context": "Standard corporate signature block",
      "isExecuted": true
    },
    {
      "partyName": "XYZ LLC",
      "signerName": "Jane Doe",
      "signerTitle": "Managing Member",
      "signatureDate": "January 2, 2024",
      "startIndex": 15700,
      "endIndex": 15920,
      "confidence": 0.92,
      "context": "LLC signature block",
      "isExecuted": true
    }
  ],
  "hasSignatures": true,
  "signatureRegionStart": 15400,
  "confidence": 0.94
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- signatureBlocks array in document order (ascending startIndex)
- Include all fields that are identifiable, omit fields that aren't present
- partyName is required for each block
- startIndex and endIndex must be non-negative integers
- confidence scores between 0 and 1
- isExecuted = true if signature date present, false otherwise
- Extract dates as written, don't normalize format yet
- Be thorough - capture all signature blocks in the document`;

/**
 * Build user prompt for signature detection
 *
 * @param documentText - Full extracted text from document
 * @param pageCount - Optional page count for context
 * @returns User prompt string
 */
export function buildSignatureDetectionUserPrompt(
  documentText: string,
  pageCount?: number,
): string {
  const pageInfo = pageCount ? ` (${pageCount} pages)` : '';
  const charCount = documentText.length;

  // For very long documents, focus on last 30% where signatures typically are
  const signatureRegionStart = Math.floor(charCount * 0.7);
  const signatureRegion = documentText.substring(signatureRegionStart);
  const useFullDocument = charCount < 10000;

  return `Identify all signature blocks in this legal document${pageInfo}:

Document length: ${charCount} characters
${!useFullDocument ? `Signature region (last 30%): ${signatureRegion.length} characters` : ''}

---
${useFullDocument ? documentText : signatureRegion}
---

${
  !useFullDocument
    ? `Note: Character positions should be relative to the full document (add ${signatureRegionStart} to positions in this excerpt).

`
    : ''
}Analyze the signature region and extract:
1. All signature blocks with party names
2. Signer names (individuals who signed)
3. Signer titles and roles
4. Signature dates
5. Execution status (whether signatures are present)
6. Character positions (startIndex, endIndex) for each signature block

Return the analysis in valid JSON format matching the schema provided.`;
}

/**
 * Example usage:
 *
 * ```typescript
 * const systemPrompt = SIGNATURE_DETECTION_SYSTEM_PROMPT;
 * const userPrompt = buildSignatureDetectionUserPrompt(
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
 *     callerName: 'signature-detection',
 *     temperature: 0.1,
 *   }
 * );
 * ```
 */
