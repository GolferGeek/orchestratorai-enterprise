import { Injectable, Logger, Inject } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';

/**
 * Legal Metadata - Complete legal document intelligence
 *
 * This interface defines the comprehensive metadata extracted from legal documents.
 * It matches the structure expected by LangGraph and frontend components.
 */
export interface LegalMetadata {
  /** Document classification */
  documentType: {
    type: string;
    confidence: number;
    alternatives?: Array<{
      type: string;
      confidence: number;
    }>;
    reasoning?: string;
  };

  /** Detected sections and clauses */
  sections: {
    sections: Array<{
      title: string;
      type: string;
      startIndex: number;
      endIndex: number;
      content: string;
      confidence: number;
      clauses?: Array<{
        identifier?: string;
        title?: string;
        startIndex: number;
        endIndex: number;
        content: string;
        confidence: number;
      }>;
    }>;
    confidence: number;
    structureType: 'formal' | 'informal' | 'mixed' | 'unstructured';
  };

  /** Signature blocks and signatories */
  signatures: {
    signatures: Array<{
      partyName?: string;
      signerName?: string;
      signerTitle?: string;
      signatureDate?: string;
      startIndex: number;
      endIndex: number;
      content: string;
      confidence: number;
      detectionMethod: 'keyword' | 'pattern' | 'position';
    }>;
    confidence: number;
    partyCount: number;
  };

  /** Extracted dates */
  dates: {
    dates: Array<{
      originalText: string;
      normalizedDate: string;
      dateType: string;
      confidence: number;
      position: number;
      context?: string;
    }>;
    primaryDate?: {
      originalText: string;
      normalizedDate: string;
      dateType: string;
      confidence: number;
      position: number;
      context?: string;
    };
    confidence: number;
  };

  /** Extracted parties */
  parties: {
    parties: Array<{
      name: string;
      type: string;
      role?: string;
      position: number;
      context?: string;
      confidence: number;
      identifiers?: {
        address?: string;
        registrationNumber?: string;
        jurisdiction?: string;
      };
    }>;
    contractingParties?: Array<{
      name: string;
      type: string;
      role?: string;
      position: number;
      context?: string;
      confidence: number;
    }>;
    confidence: number;
    partyCount: number;
  };

  /** Overall confidence scoring */
  confidence: {
    overall: number;
    breakdown: {
      documentType: number;
      sections: number;
      signatures: number;
      dates: number;
      parties: number;
    };
    factors: {
      textQuality: number;
      structureClarity: number;
      completeness: number;
    };
  };

  /** Metadata extraction timestamp */
  extractedAt: string;
}

/**
 * Legal Intelligence Service
 *
 * Simplified M1 implementation that replaces 7 microservices with a single service
 * making one LLM call with structured output.
 *
 * **Previous Architecture (M1 original):**
 * - 7 separate services (DocumentType, Section, Signature, Date, Party, Confidence, Orchestrator)
 * - 5-6 sequential LLM calls
 * - Complex orchestration logic
 * - Higher latency and cost
 *
 * **Current Architecture (M1 refactored):**
 * - 1 service with 1 method
 * - 1 LLM call with structured JSON output
 * - Simple, fast, maintainable
 * - Same output interface (no breaking changes)
 *
 * **Usage:**
 * ```typescript
 * const metadata = await legalIntelligence.extractMetadata(
 *   documentText,
 *   context
 * );
 * ```
 *
 * **Benefits of Single-Call Approach:**
 * - Faster: 2-3s vs 5-15s
 * - Cheaper: 1 LLM call vs 5-6
 * - Simpler: 1 file vs 7 files
 * - Better: LLM sees full context, not fragmented
 */
@Injectable()
export class LegalIntelligenceService {
  private readonly logger = new Logger(LegalIntelligenceService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Extract comprehensive legal metadata from document text
   *
   * Makes a single LLM call requesting all metadata at once using structured output.
   *
   * @param documentText - Extracted document text
   * @param context - ExecutionContext for LLM tracking
   * @returns Complete legal metadata
   */
  async extractMetadata(
    documentText: string,
    context: ExecutionContext,
  ): Promise<LegalMetadata> {
    const startTime = Date.now();

    this.logger.log(
      `🧠 [LEGAL-INTELLIGENCE] Extracting metadata from document (${documentText.length} chars)`,
    );

    // Truncate very long documents to first 15000 chars for analysis
    const analysisText =
      documentText.length > 15000
        ? documentText.substring(0, 15000) + '\n\n[... document continues ...]'
        : documentText;

    const prompt = `You are a legal document analysis AI. Analyze the following legal document and extract comprehensive metadata in JSON format.

IMPORTANT: Return ONLY valid JSON. Do not include any explanatory text before or after the JSON.

Extract the following information:

1. **Document Type**: Classify the document (contract, nda, msa, agreement, pleading, motion, complaint, correspondence, memo, policy, other)
2. **Sections**: Identify major sections, articles, and clauses with their boundaries
3. **Signatures**: Find signature blocks, party names, signer names, titles, and dates
4. **Dates**: Extract all dates (effective date, expiration date, signature dates, filing dates) with ISO format
5. **Parties**: Identify all parties (individuals, companies, entities) with their roles and types

Return JSON in this exact structure:
{
  "documentType": {
    "type": "contract|nda|msa|agreement|pleading|motion|complaint|correspondence|memo|policy|other",
    "confidence": 0.0-1.0,
    "alternatives": [{"type": "...", "confidence": 0.0-1.0}],
    "reasoning": "brief explanation"
  },
  "sections": {
    "sections": [
      {
        "title": "Preamble",
        "type": "preamble|definitions|terms|obligations|warranties|liability|termination|general|signatures|other",
        "startIndex": 0,
        "endIndex": 500,
        "content": "excerpt of section text",
        "confidence": 0.0-1.0
      }
    ],
    "confidence": 0.0-1.0,
    "structureType": "formal|informal|mixed|unstructured"
  },
  "signatures": {
    "signatures": [
      {
        "partyName": "Acme Corp",
        "signerName": "John Doe",
        "signerTitle": "CEO",
        "signatureDate": "2024-01-15",
        "startIndex": 5000,
        "endIndex": 5200,
        "content": "signature block text",
        "confidence": 0.0-1.0,
        "detectionMethod": "keyword|pattern|position"
      }
    ],
    "confidence": 0.0-1.0,
    "partyCount": 2
  },
  "dates": {
    "dates": [
      {
        "originalText": "January 15, 2024",
        "normalizedDate": "2024-01-15",
        "dateType": "effective|expiration|signature|filing|execution|other",
        "confidence": 0.0-1.0,
        "position": 100,
        "context": "surrounding text"
      }
    ],
    "primaryDate": {...},
    "confidence": 0.0-1.0
  },
  "parties": {
    "parties": [
      {
        "name": "Acme Corporation",
        "type": "corporation|llc|partnership|individual|government|other",
        "role": "provider|customer|buyer|seller|plaintiff|defendant|lessor|lessee|other",
        "position": 50,
        "context": "surrounding text",
        "confidence": 0.0-1.0
      }
    ],
    "contractingParties": [first two parties],
    "confidence": 0.0-1.0,
    "partyCount": 2
  },
  "confidence": {
    "overall": 0.0-1.0,
    "breakdown": {
      "documentType": 0.0-1.0,
      "sections": 0.0-1.0,
      "signatures": 0.0-1.0,
      "dates": 0.0-1.0,
      "parties": 0.0-1.0
    },
    "factors": {
      "textQuality": 0.0-1.0,
      "structureClarity": 0.0-1.0,
      "completeness": 0.0-1.0
    }
  }
}

For unstructured or unclear documents:
- Set confidence scores lower
- Mark structureType as "unstructured"
- Use "other" for document type if uncertain
- Provide empty arrays for missing information

Document to analyze:

${analysisText}`;

    try {
      // Make single LLM call with structured JSON output
      const systemPrompt =
        'You are a legal document analysis AI. Return only valid JSON.';

      const response = await this.llmService.generateResponse(
        systemPrompt,
        prompt,
        {
          executionContext: context,
          temperature: 0.1,
        },
      );

      // Parse JSON response
      let metadata: LegalMetadata;
      try {
        // Extract content from response (handle both string and LLMResponse)
        const content =
          typeof response === 'string' ? response : response.content || '';

        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        // Normalize: merge with minimal metadata to ensure all nested fields exist
        metadata = this.normalizeMetadata(parsed);
      } catch (parseError) {
        this.logger.error(
          `❌ [LEGAL-INTELLIGENCE] Failed to parse LLM JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
        // Return minimal metadata on parse failure
        metadata = this.createMinimalMetadata();
      }

      // Add extraction timestamp
      metadata.extractedAt = new Date().toISOString();

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ [LEGAL-INTELLIGENCE] Metadata extracted in ${duration}ms - Type: ${metadata.documentType.type} (${(metadata.confidence.overall * 100).toFixed(0)}% confidence)`,
      );

      return metadata;
    } catch (error) {
      this.logger.error(
        `❌ [LEGAL-INTELLIGENCE] Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return minimal metadata on complete failure
      const metadata = this.createMinimalMetadata();
      metadata.extractedAt = new Date().toISOString();
      return metadata;
    }
  }

  /**
   * Normalize parsed LLM JSON to ensure all required nested fields exist.
   * LLMs (especially small models like qwen2.5:7b) may return incomplete JSON
   * missing required sub-objects. This merges with minimal defaults so all
   * consumers can safely access nested fields without null checks.
   */
  private normalizeMetadata(parsed: Record<string, unknown>): LegalMetadata {
    const minimal = this.createMinimalMetadata();
    const p = parsed as Partial<LegalMetadata>;

    return {
      documentType: {
        ...minimal.documentType,
        ...(p.documentType && typeof p.documentType === 'object'
          ? p.documentType
          : {}),
      },
      sections: {
        ...minimal.sections,
        ...(p.sections && typeof p.sections === 'object' ? p.sections : {}),
        sections: Array.isArray(
          (p.sections as Record<string, unknown>)?.sections,
        )
          ? ((p.sections as Record<string, unknown>)
              .sections as LegalMetadata['sections']['sections'])
          : [],
      },
      signatures: {
        ...minimal.signatures,
        ...(p.signatures && typeof p.signatures === 'object'
          ? p.signatures
          : {}),
        signatures: Array.isArray(
          (p.signatures as Record<string, unknown>)?.signatures,
        )
          ? ((p.signatures as Record<string, unknown>)
              .signatures as LegalMetadata['signatures']['signatures'])
          : [],
      },
      dates: {
        ...minimal.dates,
        ...(p.dates && typeof p.dates === 'object' ? p.dates : {}),
        dates: Array.isArray((p.dates as Record<string, unknown>)?.dates)
          ? ((p.dates as Record<string, unknown>)
              .dates as LegalMetadata['dates']['dates'])
          : [],
      },
      parties: {
        ...minimal.parties,
        ...(p.parties && typeof p.parties === 'object' ? p.parties : {}),
        parties: Array.isArray((p.parties as Record<string, unknown>)?.parties)
          ? ((p.parties as Record<string, unknown>)
              .parties as LegalMetadata['parties']['parties'])
          : [],
      },
      confidence: {
        ...minimal.confidence,
        ...(p.confidence && typeof p.confidence === 'object'
          ? p.confidence
          : {}),
        breakdown: {
          ...minimal.confidence.breakdown,
          ...((p.confidence as Record<string, unknown>)?.breakdown &&
          typeof (p.confidence as Record<string, unknown>).breakdown ===
            'object'
            ? ((p.confidence as Record<string, unknown>)
                .breakdown as LegalMetadata['confidence']['breakdown'])
            : {}),
        },
        factors: {
          ...minimal.confidence.factors,
          ...((p.confidence as Record<string, unknown>)?.factors &&
          typeof (p.confidence as Record<string, unknown>).factors === 'object'
            ? ((p.confidence as Record<string, unknown>)
                .factors as LegalMetadata['confidence']['factors'])
            : {}),
        },
      },
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Create minimal metadata for error cases
   */
  private createMinimalMetadata(): LegalMetadata {
    return {
      documentType: {
        type: 'other',
        confidence: 0.1,
        reasoning: 'Extraction failed',
      },
      sections: {
        sections: [],
        confidence: 0.1,
        structureType: 'unstructured',
      },
      signatures: {
        signatures: [],
        confidence: 0.1,
        partyCount: 0,
      },
      dates: {
        dates: [],
        confidence: 0.1,
      },
      parties: {
        parties: [],
        confidence: 0.1,
        partyCount: 0,
      },
      confidence: {
        overall: 0.1,
        breakdown: {
          documentType: 0.1,
          sections: 0.1,
          signatures: 0.1,
          dates: 0.1,
          parties: 0.1,
        },
        factors: {
          textQuality: 0.1,
          structureClarity: 0.1,
          completeness: 0.1,
        },
      },
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Get human-readable summary of extracted metadata
   */
  getSummary(metadata: LegalMetadata): string {
    const parts = [
      `Type: ${metadata.documentType.type}`,
      `Sections: ${metadata.sections.sections.length}`,
      `Signatures: ${metadata.signatures.signatures.length}`,
      `Dates: ${metadata.dates.dates.length}`,
      `Parties: ${metadata.parties.parties.length}`,
      `Confidence: ${(metadata.confidence.overall * 100).toFixed(0)}%`,
    ];
    return parts.join(', ');
  }
}
