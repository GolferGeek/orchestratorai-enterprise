import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Extracted party information
 */
export interface ExtractedParty {
  /** Party name */
  name: string;
  /** Party type (individual, corporation, llc, etc.) */
  type: PartyType;
  /** Party role (buyer, seller, lessor, etc.) */
  role?: PartyRole;
  /** Position in document (character index) */
  position: number;
  /** Context (surrounding text) */
  context?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional identifiers (address, registration number, etc.) */
  identifiers?: {
    address?: string;
    registrationNumber?: string;
    jurisdiction?: string;
  };
}

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
  | 'plaintiff'
  | 'defendant'
  | 'party'
  | 'other';

/**
 * Party extraction result
 */
export interface PartyExtractionResult {
  /** All extracted parties */
  parties: ExtractedParty[];
  /** Primary contracting parties (first two parties mentioned) */
  contractingParties?: [ExtractedParty, ExtractedParty];
  /** Overall confidence score */
  confidence: number;
}

/**
 * Party Extraction Service
 *
 * Extracts party names and roles from legal documents using hybrid approach:
 * 1. Pattern-based extraction (entity suffixes, preamble parsing)
 * 2. LLM-based semantic extraction (for complex documents)
 *
 * Extraction Strategy:
 * - Phase 1: Extract from preamble ("This Agreement is between X and Y")
 * - Phase 2: Pattern matching (entity names with suffixes: Inc., LLC, Corp.)
 * - Phase 3: Signature block parsing (party names above signatures)
 * - Phase 4: LLM extraction (for complex or unstructured documents)
 * - Phase 5: Deduplicate and score confidence
 *
 * Party Patterns:
 * - Preamble: "between [Party A] and [Party B]"
 * - Entity suffixes: Inc., Corp., LLC, LLP, Ltd., LP
 * - Individual names: Title + First + Last (Mr., Ms., Dr., etc.)
 * - Government entities: "United States", "State of", "County of"
 *
 * Role Detection:
 * - Explicit labels: "Buyer:", "Seller:", "Lessor:", "Lessee:"
 * - Context inference: "Party A shall purchase" -> Buyer
 * - Document type: Employment agreement -> Employer/Employee
 *
 * ExecutionContext Flow:
 * - Passes full ExecutionContext to LLM service
 * - LLM service tracks usage automatically
 *
 * @example
 * ```typescript
 * const result = await partyExtraction.extractParties(
 *   extractedText,
 *   executionContext
 * );
 * // result: {
 * //   parties: [
 * //     { name: 'Acme Corp', type: 'corporation', role: 'seller', confidence: 0.9, ... }
 * //   ],
 * //   contractingParties: [party1, party2],
 * //   confidence: 0.85
 * // }
 * ```
 */
@Injectable()
export class PartyExtractionService {
  private readonly logger = new Logger(PartyExtractionService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Extract parties from legal document text
   *
   * @param text - Extracted document text
   * @param context - ExecutionContext for LLM service
   * @returns PartyExtractionResult with all parties and contracting parties
   */
  async extractParties(
    text: string,
    context: ExecutionContext,
  ): Promise<PartyExtractionResult> {
    this.logger.log(
      `👥 [PARTY-EXTRACT] Extracting parties (${text.length} chars)`,
    );

    const parties: ExtractedParty[] = [];

    // Phase 1: Extract from preamble
    this.extractFromPreamble(text, parties);

    // Phase 2: Pattern-based extraction
    this.extractEntityNames(text, parties);

    // Phase 3: Extract from signature blocks
    this.extractFromSignatures(text, parties);

    // Phase 4: LLM extraction (if needed)
    if (parties.length < 2) {
      const llmParties = await this.extractWithLLM(text, context);
      parties.push(...llmParties);
    }

    // Phase 5: Deduplicate and enrich
    const uniqueParties = this.deduplicateParties(parties);

    // Identify contracting parties
    const contractingParties = this.identifyContractingParties(uniqueParties);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(uniqueParties);

    this.logger.log(
      `👥 [PARTY-EXTRACT] Extraction complete: ${uniqueParties.length} parties, confidence=${confidence.toFixed(2)}`,
    );

    return { parties: uniqueParties, contractingParties, confidence };
  }

  /**
   * Extract parties from preamble section
   */
  private extractFromPreamble(text: string, parties: ExtractedParty[]): void {
    // Pattern: "This Agreement is between [Party A] and [Party B]"
    const preamblePatterns = [
      /(?:this\s+agreement|this\s+contract)\s+(?:is\s+)?(?:made\s+)?(?:and\s+entered\s+into\s+)?between\s+([^,]+?)\s+(?:and|&)\s+([^,\n.]+)/gi,
      /between\s+([A-Z][^,]+?)\s+\("?\w+?"?\)\s+and\s+([A-Z][^,\n.]+?)\s+\("?\w+?"?\)/gi,
    ];

    for (const pattern of preamblePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const [, party1Raw, party2Raw] = match;

        if (!party1Raw || !party2Raw) continue;

        // Clean party names
        const party1 = this.cleanPartyName(party1Raw);
        const party2 = this.cleanPartyName(party2Raw);

        if (party1) {
          parties.push({
            name: party1,
            type: this.inferPartyType(party1),
            position: match.index || 0,
            confidence: 0.9,
          });
        }

        if (party2) {
          parties.push({
            name: party2,
            type: this.inferPartyType(party2),
            position: (match.index || 0) + party1Raw.length,
            confidence: 0.9,
          });
        }
      }
    }
  }

  /**
   * Extract entity names using pattern matching
   */
  private extractEntityNames(text: string, parties: ExtractedParty[]): void {
    // Pattern: Entity name with suffix (e.g., "Acme Corporation")
    const entityPattern =
      /\b([A-Z][A-Za-z\s&,'.-]+?\s+(?:Inc\.?|Corp\.?|LLC|LLP|Ltd\.?|LP|Limited|Corporation|Company))\b/g;
    let match;

    while ((match = entityPattern.exec(text)) !== null) {
      if (!match[1]) continue;

      const name = this.cleanPartyName(match[1]);

      if (name) {
        parties.push({
          name,
          type: this.inferPartyType(name),
          position: match.index,
          confidence: 0.8,
        });
      }
    }
  }

  /**
   * Extract parties from signature blocks
   */
  private extractFromSignatures(text: string, parties: ExtractedParty[]): void {
    // Find signature region (last 20% of document)
    const signatureStart = Math.floor(text.length * 0.8);
    const signatureRegion = text.substring(signatureStart);

    // Pattern: Company name in all caps followed by signature lines
    const signaturePattern =
      /^([A-Z][A-Z\s&,.']+(?:INC\.?|CORP\.?|LLC|LLP|LTD\.?)?)\s*$/gm;
    let match;

    while ((match = signaturePattern.exec(signatureRegion)) !== null) {
      if (!match[1]) continue;

      const name = this.cleanPartyName(match[1]);

      if (name && name.split(' ').length >= 2) {
        // At least 2 words
        parties.push({
          name,
          type: this.inferPartyType(name),
          position: signatureStart + match.index,
          confidence: 0.75,
        });
      }
    }
  }

  /**
   * Extract parties using LLM semantic analysis
   */
  private async extractWithLLM(
    text: string,
    context: ExecutionContext,
  ): Promise<ExtractedParty[]> {
    const systemPrompt = `You are an expert at extracting party information from legal documents.

Extract all parties mentioned in the document. For each party, identify:
- name: Full legal name
- type: individual, corporation, llc, partnership, trust, government, other
- role: buyer, seller, lessor, lessee, etc. (if identifiable)

Return a JSON array:
[
  {
    "name": "Party Name",
    "type": "corporation",
    "role": "seller",
    "confidence": 0.9
  }
]

Return ONLY valid JSON array, no markdown formatting.`;

    const userPrompt = `Extract all parties from this legal document:\n\n${text.substring(0, 2000)}...`;

    try {
      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'party-extraction',
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

      return Array.isArray(parsed)
        ? (
            parsed as Array<{
              name: string;
              type: string;
              role: string;
              confidence?: number;
            }>
          ).map((p) => ({
            name: p.name,
            type: this.validatePartyType(p.type),
            role: this.validatePartyRole(p.role),
            position: 0, // LLM doesn't provide position
            confidence: p.confidence || 0.7,
          }))
        : [];
    } catch (error) {
      this.logger.warn(
        `👥 [PARTY-EXTRACT] LLM extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Clean and normalize party name
   */
  private cleanPartyName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^(a|an|the)\s+/i, '') // Remove articles
      .replace(/\([^)]*\)/g, '') // Remove parenthetical notes
      .trim();
  }

  /**
   * Infer party type from name
   */
  private inferPartyType(name: string): PartyType {
    const lower = name.toLowerCase();

    if (
      lower.includes('inc') ||
      lower.includes('corp') ||
      lower.includes('corporation')
    ) {
      return 'corporation';
    }
    if (lower.includes('llc') || lower.includes('l.l.c')) {
      return 'llc';
    }
    if (
      lower.includes('llp') ||
      lower.includes('lp') ||
      lower.includes('partnership')
    ) {
      return 'partnership';
    }
    if (lower.includes('trust')) {
      return 'trust';
    }
    if (
      lower.includes('united states') ||
      lower.includes('state of') ||
      lower.includes('county of') ||
      lower.includes('city of')
    ) {
      return 'government';
    }

    // Check if individual (has title or common name pattern)
    const individualTitles = ['mr.', 'ms.', 'mrs.', 'dr.', 'prof.'];
    if (individualTitles.some((title) => lower.includes(title))) {
      return 'individual';
    }

    // Default to corporation for entity names with caps
    return name === name.toUpperCase() ? 'corporation' : 'other';
  }

  /**
   * Validate party type against allowed values
   */
  private validatePartyType(type: string): PartyType {
    const validTypes: PartyType[] = [
      'individual',
      'corporation',
      'llc',
      'partnership',
      'trust',
      'government',
      'other',
    ];
    return validTypes.includes(type as PartyType)
      ? (type as PartyType)
      : 'other';
  }

  /**
   * Validate party role against allowed values
   */
  private validatePartyRole(role: string | undefined): PartyRole | undefined {
    if (!role) return undefined;

    const validRoles: PartyRole[] = [
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
      'plaintiff',
      'defendant',
      'party',
      'other',
    ];
    return validRoles.includes(role as PartyRole)
      ? (role as PartyRole)
      : undefined;
  }

  /**
   * Deduplicate parties (same name, similar position)
   */
  private deduplicateParties(parties: ExtractedParty[]): ExtractedParty[] {
    const seen = new Map<string, ExtractedParty>();

    for (const party of parties) {
      // Normalize name for comparison
      const normalizedName = party.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Keep the one with higher confidence
      const existing = seen.get(normalizedName);
      if (!existing || party.confidence > existing.confidence) {
        seen.set(normalizedName, party);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.position - b.position);
  }

  /**
   * Identify the two primary contracting parties
   */
  private identifyContractingParties(
    parties: ExtractedParty[],
  ): [ExtractedParty, ExtractedParty] | undefined {
    if (parties.length < 2) return undefined;

    // Sort by position (parties mentioned earlier are more likely to be primary)
    const sorted = [...parties].sort((a, b) => a.position - b.position);

    const first = sorted[0];
    const second = sorted[1];

    if (!first || !second) return undefined;

    return [first, second];
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(parties: ExtractedParty[]): number {
    if (parties.length === 0) return 0;

    // Average confidence
    const avgConfidence =
      parties.reduce((sum, p) => sum + p.confidence, 0) / parties.length;

    // Boost if we found at least 2 parties
    const countBoost = parties.length >= 2 ? 0.1 : 0;

    return Math.min(1.0, avgConfidence + countBoost);
  }
}
