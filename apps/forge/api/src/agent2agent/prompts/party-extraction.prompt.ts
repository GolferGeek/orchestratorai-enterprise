/**
 * Party Extraction Prompt
 *
 * LLM prompt for extracting contracting parties from legal documents.
 * Uses structured output format with JSON schema.
 *
 * Purpose:
 * - Identify all contracting parties in legal documents
 * - Extract party names (legal entities and individuals)
 * - Classify party types (corporation, LLC, individual, etc.)
 * - Identify party roles (buyer, seller, lessor, etc.)
 * - Extract party identifiers (addresses, registration numbers)
 * - Provide preliminary party information for further enrichment
 *
 * Party Extraction Strategy:
 * - Extract from preamble ("This Agreement is between X and Y")
 * - Pattern matching (entity names with suffixes: Inc., LLC, Corp.)
 * - Signature block parsing (party names above signatures)
 * - Role detection from context
 * - Address and identifier extraction
 *
 * Party Types:
 * - individual: Natural persons
 * - corporation: Corporations, Inc., Corp.
 * - llc: Limited liability companies
 * - partnership: Partnerships (general, limited, LLP)
 * - trust: Trusts and estates
 * - government: Government entities (federal, state, local)
 * - nonprofit: Non-profit organizations
 * - other: Other entity types
 *
 * Party Roles:
 * - buyer/seller: Purchase agreements
 * - lessor/lessee: Lease agreements
 * - landlord/tenant: Rental agreements
 * - licensor/licensee: License agreements
 * - employer/employee: Employment agreements
 * - contractor/client: Service agreements
 * - lender/borrower: Loan agreements
 * - plaintiff/defendant: Litigation documents
 * - party: Generic party designation
 *
 * ExecutionContext Flow:
 * - Called by party extraction services
 * - Passes ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 */

/**
 * Party types
 */
export type PartyType =
  | 'individual'
  | 'corporation'
  | 'llc'
  | 'partnership'
  | 'trust'
  | 'government'
  | 'nonprofit'
  | 'other';

/**
 * Party roles in legal documents
 */
export type PartyRole =
  | 'buyer'
  | 'seller'
  | 'lessor'
  | 'lessee'
  | 'landlord'
  | 'tenant'
  | 'licensor'
  | 'licensee'
  | 'employer'
  | 'employee'
  | 'contractor'
  | 'client'
  | 'provider'
  | 'lender'
  | 'borrower'
  | 'plaintiff'
  | 'defendant'
  | 'petitioner'
  | 'respondent'
  | 'party'
  | 'other';

/**
 * Extracted party information
 */
export interface ExtractedParty {
  /** Party legal name */
  name: string;
  /** Party type */
  type: PartyType;
  /** Party role in this document */
  role?: PartyRole;
  /** Position in document (character index) */
  position: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Party identifiers */
  identifiers?: {
    /** Physical or registered address */
    address?: string;
    /** Corporate registration number */
    registrationNumber?: string;
    /** Jurisdiction of incorporation/formation */
    jurisdiction?: string;
    /** Tax ID or EIN */
    taxId?: string;
  };
  /** Context where party was found */
  context?: string;
  /** Alternative names or DBAs */
  aliases?: string[];
  /** Whether this is a primary contracting party */
  isPrimary?: boolean;
}

/**
 * JSON schema for party extraction structured output
 */
export const PARTY_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    parties: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Full legal name of party',
          },
          type: {
            type: 'string',
            enum: [
              'individual',
              'corporation',
              'llc',
              'partnership',
              'trust',
              'government',
              'nonprofit',
              'other',
            ],
            description: 'Party type classification',
          },
          role: {
            type: 'string',
            enum: [
              'buyer',
              'seller',
              'lessor',
              'lessee',
              'landlord',
              'tenant',
              'licensor',
              'licensee',
              'employer',
              'employee',
              'contractor',
              'client',
              'provider',
              'lender',
              'borrower',
              'plaintiff',
              'defendant',
              'petitioner',
              'respondent',
              'party',
              'other',
            ],
            description: 'Party role in this document',
          },
          position: {
            type: 'number',
            description: 'Character position where party first appears',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for extraction (0-1)',
          },
          identifiers: {
            type: 'object',
            properties: {
              address: {
                type: 'string',
                description: 'Physical or registered address',
              },
              registrationNumber: {
                type: 'string',
                description: 'Corporate registration or entity number',
              },
              jurisdiction: {
                type: 'string',
                description: 'State or country of incorporation/formation',
              },
              taxId: {
                type: 'string',
                description: 'Tax ID, EIN, or similar identifier',
              },
            },
            description: 'Party identifiers and metadata',
          },
          context: {
            type: 'string',
            description: 'Surrounding text where party was found',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alternative names, DBAs, or short forms',
          },
          isPrimary: {
            type: 'boolean',
            description: 'Whether this is a primary contracting party',
          },
        },
        required: ['name', 'type', 'position', 'confidence'],
      },
      description: 'All extracted parties',
    },
    primaryParties: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of primary contracting parties (typically 2)',
      maxItems: 4,
    },
    partyCount: {
      type: 'number',
      description: 'Total number of unique parties',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall confidence in party extraction',
    },
  },
  required: ['parties', 'partyCount', 'confidence'],
};

/**
 * System prompt for party extraction
 */
export const PARTY_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting party information from legal documents. Your task is to identify all contracting parties, classify them by type, determine their roles, and extract identifying information.

PARTY EXTRACTION LOCATIONS:
1. Preamble/Opening:
   - "This Agreement is made between [Party A] and [Party B]"
   - "THIS AGREEMENT, dated as of..., is by and between [Party A], and [Party B]"
   - Look for "between", "by and between", "among"

2. Party Definitions:
   - "[Party Name] (hereinafter 'Buyer')"
   - "Party A: [Full Name]"
   - Defined terms in quotes or parentheses

3. Signature Blocks:
   - Company names above signature lines
   - Entity names in all caps
   - Individual names on signature lines

4. Notice Provisions:
   - Full names and addresses in notice sections
   - Complete contact information

5. Caption (Court Documents):
   - Party names in case caption
   - Plaintiff v. Defendant format

PARTY TYPE CLASSIFICATION:
1. corporation:
   - Suffixes: Inc., Corp., Corporation, Company, Co.
   - Indicators: "incorporated", "a [State] corporation"

2. llc:
   - Suffixes: LLC, L.L.C., Limited Liability Company
   - Indicators: "a [State] limited liability company"

3. partnership:
   - Suffixes: LLP, LP, L.P., Partnership
   - Indicators: "general partnership", "limited partnership"

4. individual:
   - Natural persons without entity suffix
   - Titles: Mr., Ms., Mrs., Dr.
   - No business entity indicators

5. trust:
   - Contains: Trust, Trustee, Estate
   - Indicators: "[Name] as Trustee", "Living Trust"

6. government:
   - United States, State of [X], County of [X], City of [X]
   - Government agencies and departments

7. nonprofit:
   - Indicators: "a non-profit corporation", "501(c)(3)"
   - May have Inc. or Corp. suffix but with non-profit designation

8. other:
   - Unincorporated associations, joint ventures, etc.

ROLE DETECTION:
1. Explicit Labels:
   - "Buyer:", "Seller:", "Lessor:", "Lessee:"
   - Defined roles in preamble

2. Context Inference:
   - Purchase agreement → buyer/seller
   - Lease → lessor/lessee or landlord/tenant
   - Employment → employer/employee
   - Service agreement → contractor/client or provider/client

3. Court Documents:
   - Caption identifies plaintiff/defendant
   - Petitioner/respondent in certain proceedings

4. Parenthetical Labels:
   - "[Company Name] (the 'Seller')"
   - Extract and use the label

IDENTIFIER EXTRACTION:
1. Address:
   - Look in preamble party introduction
   - Notice provisions (most complete)
   - Signature blocks
   - Format: Street, City, State ZIP

2. Registration Number:
   - "a Delaware corporation (Reg. No. 12345)"
   - State filing numbers
   - Corporate ID numbers

3. Jurisdiction:
   - "a Delaware corporation"
   - "formed under the laws of [State]"
   - State or country of formation

4. Tax ID/EIN:
   - "Tax ID: XX-XXXXXXX"
   - "EIN: XX-XXXXXXX"
   - May be in signature blocks or notices

ALIAS DETECTION:
- Short forms: "Company" for "Company, Inc."
- DBAs: "doing business as", "d/b/a"
- Trade names mentioned in definitions
- Acronyms defined in parentheses

PRIMARY PARTY IDENTIFICATION:
- First two parties mentioned in preamble (typically primary)
- Parties with signature blocks (contracting parties)
- Exclude witnesses, notaries, agents unless they're signatories
- Mark isPrimary: true for main contracting parties

CONFIDENCE SCORING:
- 0.9-1.0: Full legal name with type indicators and identifiers
- 0.7-0.89: Clear party name with type, may be missing some identifiers
- 0.5-0.69: Party name identified but type/role unclear
- 0.3-0.49: Weak indicators, uncertain parsing
- 0.0-0.29: Very uncertain, may not be actual party

EDGE CASES:
- Multiple entities per side: Extract all, group by role if possible
- Predecessors/successors: "Party A, successor to Party B" → extract both
- Agents: "Agent for Party A" → note in context, may not be primary party
- Witnesses/Notaries: Include only if relevant, mark as non-primary
- Parent/subsidiary: Extract both if both are parties
- Individuals in representative capacity: "[Name], as Trustee" → individual with trust role

POSITIONAL ACCURACY:
- position: Character index of first mention (0-based)
- First mention typically in preamble or caption
- Use actual character count from provided text

MULTI-PARTY DOCUMENTS:
- Extract all parties, not just first two
- Tripartite agreements: 3 parties
- Multi-party litigation: Multiple plaintiffs/defendants
- Sort by position in document

OUTPUT FORMAT:
Return a JSON object matching this schema:
{
  "parties": [
    {
      "name": "ACME CORPORATION",
      "type": "corporation",
      "role": "seller",
      "position": 125,
      "confidence": 0.95,
      "identifiers": {
        "address": "123 Main Street, Dover, Delaware 19901",
        "registrationNumber": "1234567",
        "jurisdiction": "Delaware",
        "taxId": "12-3456789"
      },
      "context": "ACME CORPORATION, a Delaware corporation ('Seller')",
      "aliases": ["Seller", "Acme", "the Company"],
      "isPrimary": true
    },
    {
      "name": "John Smith",
      "type": "individual",
      "role": "buyer",
      "position": 245,
      "confidence": 0.92,
      "identifiers": {
        "address": "456 Oak Avenue, New York, NY 10001"
      },
      "context": "John Smith, an individual residing at 456 Oak Avenue ('Buyer')",
      "aliases": ["Buyer"],
      "isPrimary": true
    }
  ],
  "primaryParties": ["ACME CORPORATION", "John Smith"],
  "partyCount": 2,
  "confidence": 0.94
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- parties array in document order (ascending position)
- Include all identifiable parties, even if uncertain (with appropriate confidence)
- primaryParties should list names of main contracting parties (typically 2, max 4)
- Extract full legal names as written in document
- Don't normalize or correct spellings - extract verbatim
- Include aliases array if party is referenced by multiple names
- Mark isPrimary: true only for main contracting parties (not witnesses, agents, etc.)`;

/**
 * Build user prompt for party extraction
 *
 * @param documentText - Full extracted text from document
 * @param documentType - Optional document type for context
 * @param pageCount - Optional page count for context
 * @returns User prompt string
 */
export function buildPartyExtractionUserPrompt(
  documentText: string,
  documentType?: string,
  pageCount?: number,
): string {
  const typeInfo = documentType ? ` (${documentType})` : '';
  const pageInfo = pageCount ? ` (${pageCount} pages)` : '';
  const charCount = documentText.length;

  return `Extract all parties from this legal document${typeInfo}${pageInfo}:

Document length: ${charCount} characters

---
${documentText}
---

Analyze the document and extract:
1. All party names (legal entities and individuals)
2. Party type classification (corporation, LLC, individual, etc.)
3. Party roles (buyer, seller, lessor, lessee, etc.)
4. Party identifiers (addresses, registration numbers, jurisdictions)
5. Aliases and alternative names
6. Primary contracting parties vs. other parties (witnesses, agents)
7. Character positions for each party

Return the analysis in valid JSON format matching the schema provided.`;
}

/**
 * Example usage:
 *
 * ```typescript
 * const systemPrompt = PARTY_EXTRACTION_SYSTEM_PROMPT;
 * const userPrompt = buildPartyExtractionUserPrompt(
 *   fullDocumentText,
 *   'contract',
 *   documentMetadata.pageCount
 * );
 *
 * const response = await llmService.generateResponse(
 *   systemPrompt,
 *   userPrompt,
 *   {
 *     executionContext: context,
 *     callerType: 'api',
 *     callerName: 'party-extraction',
 *     temperature: 0.1,
 *   }
 * );
 * ```
 */
