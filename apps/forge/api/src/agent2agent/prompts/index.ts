/**
 * Legal Extraction Prompts
 *
 * Centralized exports for all legal document extraction prompts.
 * These prompts are used by extraction services to leverage LLMs
 * for structured information extraction from legal documents.
 *
 * Phase 2: LLM Prompts for Legal Extraction (M1)
 *
 * Prompts included:
 * 1. Document Type Classification - Classify legal documents into types
 * 2. Section Detection - Identify sections and clause boundaries
 * 3. Signature Detection - Find signature blocks and extract signer info
 * 4. Date Extraction - Extract and classify dates
 * 5. Party Extraction - Extract contracting parties and roles
 *
 * Usage Pattern:
 * ```typescript
 * import {
 *   DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT,
 *   buildDocumentTypeClassificationUserPrompt,
 * } from '@/agent2agent/prompts';
 *
 * const systemPrompt = DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT;
 * const userPrompt = buildDocumentTypeClassificationUserPrompt(documentText);
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

// Document Type Classification
export {
  type LegalDocumentType,
  DOCUMENT_TYPE_CLASSIFICATION_SCHEMA,
  DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT,
  buildDocumentTypeClassificationUserPrompt,
} from './document-type-classification.prompt';

// Section Detection
export {
  type SectionType,
  type StructureType,
  SECTION_DETECTION_SCHEMA,
  SECTION_DETECTION_SYSTEM_PROMPT,
  buildSectionDetectionUserPrompt,
} from './section-detection.prompt';

// Signature Detection
export {
  type SignatureBlock,
  SIGNATURE_DETECTION_SCHEMA,
  SIGNATURE_DETECTION_SYSTEM_PROMPT,
  buildSignatureDetectionUserPrompt,
} from './signature-detection.prompt';

// Date Extraction
export {
  type DateType,
  type ExtractedDate,
  DATE_EXTRACTION_SCHEMA,
  DATE_EXTRACTION_SYSTEM_PROMPT,
  buildDateExtractionUserPrompt,
} from './date-extraction.prompt';

// Party Extraction
export {
  type PartyType,
  type PartyRole,
  type ExtractedParty,
  PARTY_EXTRACTION_SCHEMA,
  PARTY_EXTRACTION_SYSTEM_PROMPT,
  buildPartyExtractionUserPrompt,
} from './party-extraction.prompt';
