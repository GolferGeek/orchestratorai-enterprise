import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { LegalDocumentMetadata } from '../legal-department.state';

const CALLER_NAME = 'legal-department:intelligence';

const SYSTEM_PROMPT = `You are a legal document analysis engine. Your task is to extract structured metadata from legal document text with high precision.

Return ONLY valid JSON matching this exact structure — no markdown, no explanation, no code fences:

{
  "documentType": {
    "type": "string (e.g. contract, nda, employment_agreement, lease, terms_of_service, privacy_policy, corporate_resolution, patent, litigation_filing, regulatory_filing, unknown)",
    "confidence": "number 0.0-1.0",
    "alternatives": [{ "type": "string", "confidence": "number 0.0-1.0" }],
    "reasoning": "string explaining classification"
  },
  "sections": {
    "sections": [
      {
        "title": "string",
        "type": "string (e.g. recitals, definitions, obligations, payment, termination, liability, indemnification, governing_law, signatures, other)",
        "startIndex": "integer character position in document",
        "endIndex": "integer character position in document",
        "content": "string (excerpt, max 300 chars)",
        "confidence": "number 0.0-1.0",
        "clauses": [
          {
            "identifier": "string or null (e.g. 1.1, (a))",
            "title": "string or null",
            "startIndex": "integer",
            "endIndex": "integer",
            "content": "string (excerpt, max 200 chars)",
            "confidence": "number 0.0-1.0"
          }
        ]
      }
    ],
    "confidence": "number 0.0-1.0",
    "structureType": "formal | informal | mixed | unstructured"
  },
  "signatures": {
    "signatures": [
      {
        "partyName": "string or null",
        "signerName": "string or null",
        "signerTitle": "string or null",
        "signatureDate": "string ISO date or null",
        "startIndex": "integer",
        "endIndex": "integer",
        "content": "string (excerpt, max 200 chars)",
        "confidence": "number 0.0-1.0",
        "detectionMethod": "keyword | pattern | position"
      }
    ],
    "confidence": "number 0.0-1.0",
    "partyCount": "integer"
  },
  "dates": {
    "dates": [
      {
        "originalText": "string",
        "normalizedDate": "string ISO date (YYYY-MM-DD)",
        "dateType": "string (e.g. effective_date, execution_date, expiration_date, payment_date, deadline, other)",
        "confidence": "number 0.0-1.0",
        "position": "integer character position",
        "context": "string (surrounding text, max 100 chars)"
      }
    ],
    "primaryDate": "object matching date shape or null",
    "confidence": "number 0.0-1.0"
  },
  "parties": {
    "parties": [
      {
        "name": "string",
        "type": "string (individual | corporation | llc | partnership | government | trust | other)",
        "role": "string or null (e.g. licensor, licensee, employer, employee, buyer, seller, landlord, tenant, plaintiff, defendant)",
        "position": "integer character position of first occurrence",
        "context": "string (surrounding text, max 100 chars)",
        "confidence": "number 0.0-1.0",
        "identifiers": {
          "address": "string or null",
          "registrationNumber": "string or null",
          "jurisdiction": "string or null"
        }
      }
    ],
    "contractingParties": "array of exactly two primary contracting party objects or null",
    "confidence": "number 0.0-1.0"
  },
  "confidence": {
    "overall": "number 0.0-1.0",
    "breakdown": {
      "documentType": "number 0.0-1.0",
      "sections": "number 0.0-1.0",
      "signatures": "number 0.0-1.0",
      "dates": "number 0.0-1.0",
      "parties": "number 0.0-1.0"
    },
    "factors": {
      "textQuality": "number 0.0-1.0",
      "extractionMethod": "native",
      "completeness": "number 0.0-1.0",
      "patternMatchCount": "integer"
    }
  }
}

Rules:
- All integer positions are character offsets from the start of the document text.
- Confidence values must be numbers between 0.0 and 1.0, never strings.
- If a field cannot be determined, use null for optional fields and an empty array for array fields.
- structureType must be exactly one of: formal, informal, mixed, unstructured.
- detectionMethod must be exactly one of: keyword, pattern, position.
- extractionMethod must always be "native" for text input.
- Return ONLY the JSON object. No preamble, no postamble.`;

function buildUserMessage(filename: string, documentText: string): string {
  const truncated =
    documentText.length > 50000
      ? documentText.slice(0, 50000) + '\n[TRUNCATED]'
      : documentText;
  return `Filename: ${filename}\n\nDocument text:\n\n${truncated}`;
}

function clamp(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (isNaN(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeMetadata(
  raw: Record<string, unknown>,
): LegalDocumentMetadata {
  // documentType
  const rawDocType = (raw.documentType ?? {}) as Record<string, unknown>;
  const documentType: LegalDocumentMetadata['documentType'] = {
    type: typeof rawDocType.type === 'string' ? rawDocType.type : 'unknown',
    confidence: clamp(rawDocType.confidence),
    alternatives: Array.isArray(rawDocType.alternatives)
      ? rawDocType.alternatives
          .filter(
            (a): a is Record<string, unknown> =>
              a !== null && typeof a === 'object',
          )
          .map((a) => ({
            type: typeof a.type === 'string' ? a.type : 'unknown',
            confidence: clamp(a.confidence),
          }))
      : [],
    reasoning:
      typeof rawDocType.reasoning === 'string'
        ? rawDocType.reasoning
        : undefined,
  };

  // sections
  const rawSections = (raw.sections ?? {}) as Record<string, unknown>;
  const validStructureTypes = [
    'formal',
    'informal',
    'mixed',
    'unstructured',
  ] as const;
  type StructureType = (typeof validStructureTypes)[number];
  const structureType: StructureType = validStructureTypes.includes(
    rawSections.structureType as StructureType,
  )
    ? (rawSections.structureType as StructureType)
    : 'unstructured';

  const sections: LegalDocumentMetadata['sections'] = {
    sections: Array.isArray(rawSections.sections)
      ? rawSections.sections
          .filter(
            (s): s is Record<string, unknown> =>
              s !== null && typeof s === 'object',
          )
          .map((s) => ({
            title: typeof s.title === 'string' ? s.title : '',
            type: typeof s.type === 'string' ? s.type : 'other',
            startIndex: typeof s.startIndex === 'number' ? s.startIndex : 0,
            endIndex: typeof s.endIndex === 'number' ? s.endIndex : 0,
            content: typeof s.content === 'string' ? s.content : '',
            confidence: clamp(s.confidence),
            clauses: Array.isArray(s.clauses)
              ? s.clauses
                  .filter(
                    (c): c is Record<string, unknown> =>
                      c !== null && typeof c === 'object',
                  )
                  .map((c) => ({
                    identifier:
                      typeof c.identifier === 'string'
                        ? c.identifier
                        : undefined,
                    title: typeof c.title === 'string' ? c.title : undefined,
                    startIndex:
                      typeof c.startIndex === 'number' ? c.startIndex : 0,
                    endIndex: typeof c.endIndex === 'number' ? c.endIndex : 0,
                    content: typeof c.content === 'string' ? c.content : '',
                    confidence: clamp(c.confidence),
                  }))
              : undefined,
          }))
      : [],
    confidence: clamp(rawSections.confidence),
    structureType,
  };

  // signatures
  const rawSigs = (raw.signatures ?? {}) as Record<string, unknown>;
  const validDetectionMethods = ['keyword', 'pattern', 'position'] as const;
  type DetectionMethod = (typeof validDetectionMethods)[number];

  const signatures: LegalDocumentMetadata['signatures'] = {
    signatures: Array.isArray(rawSigs.signatures)
      ? rawSigs.signatures
          .filter(
            (s): s is Record<string, unknown> =>
              s !== null && typeof s === 'object',
          )
          .map((s) => {
            const method: DetectionMethod = validDetectionMethods.includes(
              s.detectionMethod as DetectionMethod,
            )
              ? (s.detectionMethod as DetectionMethod)
              : 'keyword';
            return {
              partyName:
                typeof s.partyName === 'string' ? s.partyName : undefined,
              signerName:
                typeof s.signerName === 'string' ? s.signerName : undefined,
              signerTitle:
                typeof s.signerTitle === 'string' ? s.signerTitle : undefined,
              signatureDate:
                typeof s.signatureDate === 'string'
                  ? s.signatureDate
                  : undefined,
              startIndex: typeof s.startIndex === 'number' ? s.startIndex : 0,
              endIndex: typeof s.endIndex === 'number' ? s.endIndex : 0,
              content: typeof s.content === 'string' ? s.content : '',
              confidence: clamp(s.confidence),
              detectionMethod: method,
            };
          })
      : [],
    confidence: clamp(rawSigs.confidence),
    partyCount:
      typeof rawSigs.partyCount === 'number'
        ? rawSigs.partyCount
        : Array.isArray(rawSigs.signatures)
          ? rawSigs.signatures.length
          : 0,
  };

  // dates
  const rawDates = (raw.dates ?? {}) as Record<string, unknown>;
  const normalizeDateEntry = (d: Record<string, unknown>) => ({
    originalText: typeof d.originalText === 'string' ? d.originalText : '',
    normalizedDate:
      typeof d.normalizedDate === 'string' ? d.normalizedDate : '',
    dateType: typeof d.dateType === 'string' ? d.dateType : 'other',
    confidence: clamp(d.confidence),
    position: typeof d.position === 'number' ? d.position : 0,
    context: typeof d.context === 'string' ? d.context : undefined,
  });

  const datesArray: LegalDocumentMetadata['dates']['dates'] = Array.isArray(
    rawDates.dates,
  )
    ? rawDates.dates
        .filter(
          (d): d is Record<string, unknown> =>
            d !== null && typeof d === 'object',
        )
        .map(normalizeDateEntry)
    : [];

  let primaryDate: LegalDocumentMetadata['dates']['primaryDate'];
  if (
    rawDates.primaryDate !== null &&
    typeof rawDates.primaryDate === 'object'
  ) {
    primaryDate = normalizeDateEntry(
      rawDates.primaryDate as Record<string, unknown>,
    );
  } else if (datesArray.length > 0) {
    primaryDate = datesArray[0];
  }

  const dates: LegalDocumentMetadata['dates'] = {
    dates: datesArray,
    primaryDate,
    confidence: clamp(rawDates.confidence),
  };

  // parties
  const rawParties = (raw.parties ?? {}) as Record<string, unknown>;
  const normalizePartyEntry = (p: Record<string, unknown>) => {
    const identifiers = p.identifiers as Record<string, unknown> | undefined;
    return {
      name: typeof p.name === 'string' ? p.name : '',
      type: typeof p.type === 'string' ? p.type : 'other',
      role: typeof p.role === 'string' ? p.role : undefined,
      position: typeof p.position === 'number' ? p.position : 0,
      context: typeof p.context === 'string' ? p.context : undefined,
      confidence: clamp(p.confidence),
      identifiers:
        identifiers && typeof identifiers === 'object'
          ? {
              address:
                typeof identifiers.address === 'string'
                  ? identifiers.address
                  : undefined,
              registrationNumber:
                typeof identifiers.registrationNumber === 'string'
                  ? identifiers.registrationNumber
                  : undefined,
              jurisdiction:
                typeof identifiers.jurisdiction === 'string'
                  ? identifiers.jurisdiction
                  : undefined,
            }
          : undefined,
    };
  };

  const partiesArray: LegalDocumentMetadata['parties']['parties'] =
    Array.isArray(rawParties.parties)
      ? rawParties.parties
          .filter(
            (p): p is Record<string, unknown> =>
              p !== null && typeof p === 'object',
          )
          .map(normalizePartyEntry)
      : [];

  let contractingParties: LegalDocumentMetadata['parties']['contractingParties'];
  if (
    Array.isArray(rawParties.contractingParties) &&
    rawParties.contractingParties.length >= 2
  ) {
    const cp = rawParties.contractingParties
      .slice(0, 2)
      .filter(
        (p): p is Record<string, unknown> =>
          p !== null && typeof p === 'object',
      )
      .map(normalizePartyEntry);
    if (cp.length === 2) {
      contractingParties = [
        cp[0]!,
        cp[1]!,
      ] as LegalDocumentMetadata['parties']['contractingParties'];
    }
  }

  const parties: LegalDocumentMetadata['parties'] = {
    parties: partiesArray,
    contractingParties,
    confidence: clamp(rawParties.confidence),
  };

  // confidence
  const rawConf = (raw.confidence ?? {}) as Record<string, unknown>;
  const rawBreakdown = (rawConf.breakdown ?? {}) as Record<string, unknown>;
  const rawFactors = (rawConf.factors ?? {}) as Record<string, unknown>;
  const validExtractionMethods = ['vision', 'ocr', 'native', 'none'] as const;
  type ExtractionMethod = (typeof validExtractionMethods)[number];
  const extractionMethod: ExtractionMethod = validExtractionMethods.includes(
    rawFactors.extractionMethod as ExtractionMethod,
  )
    ? (rawFactors.extractionMethod as ExtractionMethod)
    : 'native';

  const confidence: LegalDocumentMetadata['confidence'] = {
    overall: clamp(rawConf.overall),
    breakdown: {
      documentType: clamp(rawBreakdown.documentType),
      sections: clamp(rawBreakdown.sections),
      signatures: clamp(rawBreakdown.signatures),
      dates: clamp(rawBreakdown.dates),
      parties: clamp(rawBreakdown.parties),
    },
    factors: {
      textQuality: clamp(rawFactors.textQuality),
      extractionMethod,
      completeness: clamp(rawFactors.completeness),
      patternMatchCount:
        typeof rawFactors.patternMatchCount === 'number'
          ? rawFactors.patternMatchCount
          : 0,
    },
  };

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

@Injectable()
export class LegalIntelligenceService {
  private readonly logger = new Logger(LegalIntelligenceService.name);

  constructor(private readonly llmClient: LLMHttpClientService) {}

  async extractMetadata(
    context: ExecutionContext,
    documentText: string,
    filename: string,
  ): Promise<LegalDocumentMetadata> {
    this.logger.debug('Extracting legal metadata', {
      filename,
      textLength: documentText.length,
      conversationId: context.conversationId,
    });

    let rawJson: string;
    try {
      const response = await this.llmClient.callLLM({
        context,
        systemMessage: SYSTEM_PROMPT,
        userMessage: buildUserMessage(filename, documentText),
        temperature: 0.1,
        maxTokens: 4000,
        callerName: CALLER_NAME,
      });
      rawJson = response.text;
    } catch (err) {
      this.logger.error('LLM call failed during metadata extraction', {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err instanceof Error ? err : new Error(String(err));
    }

    let parsed: Record<string, unknown>;
    try {
      // Strip markdown code fences if the model returns them despite instructions
      const cleaned = rawJson
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (err) {
      this.logger.error(
        'Failed to parse LLM JSON response for metadata extraction',
        {
          filename,
          parseError: err instanceof Error ? err.message : String(err),
          rawSnippet: rawJson.slice(0, 200),
        },
      );
      throw new Error(
        `Failed to parse LLM metadata response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      return normalizeMetadata(parsed);
    } catch (err) {
      this.logger.error('Failed to normalize extracted metadata', {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
