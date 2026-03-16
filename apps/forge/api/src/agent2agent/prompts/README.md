# Legal Document Extraction Prompts

This directory contains LLM prompts for extracting structured information from legal documents.

**Phase 2 of Legal Department AI M1**: LLM Prompts for Legal Extraction

## Overview

These prompts are designed to work with the LLM service to extract and classify information from legal documents with high accuracy and structured output. Each prompt follows best practices for legal document analysis and includes:

- Detailed classification criteria
- JSON schema for structured output
- Confidence scoring guidelines
- Edge case handling
- Multi-page document support
- Example patterns and formats

## Prompts

### 1. Document Type Classification (`document-type-classification.prompt.ts`)

**Purpose**: Classify legal documents into standard types with confidence scores.

**Supported Types**:
- contract, nda, msa, pleading, motion, brief
- correspondence, memorandum, opinion, order
- notice, filing, invoice, other

**Key Features**:
- Primary classification with confidence score
- Alternative classifications for ambiguous documents
- Reasoning for classification decisions
- Multi-page document handling

**Usage**:
```typescript
import {
  DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT,
  buildDocumentTypeClassificationUserPrompt,
} from '@/agent2agent/prompts';

const systemPrompt = DOCUMENT_TYPE_CLASSIFICATION_SYSTEM_PROMPT;
const userPrompt = buildDocumentTypeClassificationUserPrompt(
  documentText.substring(0, 3000), // First 3000 chars
  pageCount
);

const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context,
    callerType: 'api',
    callerName: 'document-type-classification',
    temperature: 0.1,
  }
);
```

### 2. Section Detection (`section-detection.prompt.ts`)

**Purpose**: Identify document sections and clause boundaries with precise positional information.

**Section Types**:
- preamble, recitals, definitions, terms
- conditions, obligations, representations, warranties
- indemnification, termination, dispute_resolution
- miscellaneous, signature_block, exhibits, schedules

**Key Features**:
- Hierarchical section detection (levels 1-3)
- Clause boundary detection within sections
- Character position tracking (startIndex, endIndex)
- Structure type classification (formal, informal, mixed, unstructured)
- Numbering scheme detection

**Usage**:
```typescript
import {
  SECTION_DETECTION_SYSTEM_PROMPT,
  buildSectionDetectionUserPrompt,
} from '@/agent2agent/prompts';

const systemPrompt = SECTION_DETECTION_SYSTEM_PROMPT;
const userPrompt = buildSectionDetectionUserPrompt(fullDocumentText, pageCount);

const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context,
    callerType: 'api',
    callerName: 'section-detection',
    temperature: 0.1,
  }
);
```

### 3. Signature Detection (`signature-detection.prompt.ts`)

**Purpose**: Find signature blocks and extract signer information.

**Extracted Information**:
- Signing party name (company/entity)
- Signer name (individual)
- Signer title/role
- Signature date
- Execution status (whether signed)
- Character positions

**Key Features**:
- Multiple signature block detection
- Corporate vs. individual signatures
- Notarized signature handling
- Execution status determination
- Positional accuracy for text extraction

**Usage**:
```typescript
import {
  SIGNATURE_DETECTION_SYSTEM_PROMPT,
  buildSignatureDetectionUserPrompt,
} from '@/agent2agent/prompts';

const systemPrompt = SIGNATURE_DETECTION_SYSTEM_PROMPT;
const userPrompt = buildSignatureDetectionUserPrompt(fullDocumentText, pageCount);

const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context,
    callerType: 'api',
    callerName: 'signature-detection',
    temperature: 0.1,
  }
);
```

### 4. Date Extraction (`date-extraction.prompt.ts`)

**Purpose**: Extract and classify all dates with normalization to ISO 8601 format.

**Date Types**:
- document_date, effective_date, execution_date
- expiration_date, termination_date, renewal_date
- notice_period, deadline, milestone
- payment_date, filing_date, hearing_date

**Key Features**:
- ISO 8601 normalization (YYYY-MM-DD)
- Relative date detection and calculation
- Context extraction
- Multiple date format recognition
- Primary date identification (document, effective, expiration)

**Usage**:
```typescript
import {
  DATE_EXTRACTION_SYSTEM_PROMPT,
  buildDateExtractionUserPrompt,
} from '@/agent2agent/prompts';

const systemPrompt = DATE_EXTRACTION_SYSTEM_PROMPT;
const userPrompt = buildDateExtractionUserPrompt(fullDocumentText, pageCount);

const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context,
    callerType: 'api',
    callerName: 'date-extraction',
    temperature: 0.1,
  }
);
```

### 5. Party Extraction (`party-extraction.prompt.ts`)

**Purpose**: Extract contracting parties with type classification and role identification.

**Party Types**:
- individual, corporation, llc, partnership
- trust, government, nonprofit, other

**Party Roles**:
- buyer/seller, lessor/lessee, landlord/tenant
- licensor/licensee, employer/employee
- contractor/client, lender/borrower
- plaintiff/defendant, petitioner/respondent

**Key Features**:
- Full legal name extraction
- Party type classification
- Role detection from context
- Identifier extraction (address, registration number, jurisdiction)
- Primary party identification
- Alias detection

**Usage**:
```typescript
import {
  PARTY_EXTRACTION_SYSTEM_PROMPT,
  buildPartyExtractionUserPrompt,
} from '@/agent2agent/prompts';

const systemPrompt = PARTY_EXTRACTION_SYSTEM_PROMPT;
const userPrompt = buildPartyExtractionUserPrompt(
  fullDocumentText,
  documentType,
  pageCount
);

const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context,
    callerType: 'api',
    callerName: 'party-extraction',
    temperature: 0.1,
  }
);
```

## Common Patterns

### Structured Output Format

All prompts use JSON schema definitions for structured output:

```typescript
// Schema definition
export const PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    // ... field definitions
  },
  required: ['field1', 'field2'],
};

// System prompt
export const PROMPT_SYSTEM_PROMPT = `...`;

// User prompt builder
export function buildPromptUserPrompt(text: string, ...params): string {
  return `...`;
}
```

### Confidence Scoring

All prompts use consistent confidence scoring:

- **0.9-1.0**: High confidence, clear indicators
- **0.7-0.89**: Good confidence, some ambiguity
- **0.5-0.69**: Moderate confidence, uncertain
- **0.3-0.49**: Low confidence, weak indicators
- **0.0-0.29**: Very uncertain, minimal information

### LLM Service Integration

All prompts are designed to work with the LLM service:

```typescript
const response = await llmService.generateResponse(
  systemPrompt,
  userPrompt,
  {
    executionContext: context, // REQUIRED - for usage tracking
    callerType: 'api',
    callerName: 'prompt-name',
    temperature: 0.1, // Low for consistency
  }
);
```

## Response Parsing

LLM responses should be parsed with error handling:

```typescript
// Remove markdown code blocks if present
let cleanResponse = response.trim();
if (cleanResponse.startsWith('```')) {
  cleanResponse = cleanResponse
    .replace(/```json?\n?/g, '')
    .replace(/```\n?$/g, '');
}

// Parse JSON
const parsed = JSON.parse(cleanResponse);

// Validate and use
```

## ExecutionContext Flow

All prompts follow ExecutionContext patterns:

- ✅ ExecutionContext passed to LLM service
- ✅ Usage tracked automatically by LLM service
- ✅ Observability events emitted automatically
- ✅ Costs calculated automatically

## Best Practices

1. **Temperature**: Use low temperature (0.1) for consistent extraction
2. **Text Length**: Optimize prompt length based on extraction type
   - Classification: First 3000 chars usually sufficient
   - Section/Signature/Date/Party: Full document recommended
3. **Error Handling**: Always include fallback parsing and validation
4. **Confidence Scores**: Include confidence in all extractions
5. **Edge Cases**: Handle incomplete, ambiguous, or malformed documents
6. **Positional Accuracy**: Use character indices for precise text extraction

## Testing

Each prompt should be tested with:
- Standard documents (well-formed)
- Edge cases (incomplete, ambiguous)
- Multi-page documents
- Different document types
- Various formatting styles

## Future Enhancements

Potential improvements for future phases:
- Multi-language support
- Domain-specific extraction (IP, employment, real estate)
- Clause-level analysis
- Risk assessment prompts
- Comparison prompts
- Amendment detection

## Related Services

These prompts are used by:
- `DocumentTypeClassificationService`
- `SectionDetectionService`
- `PartyExtractionService`
- `DateExtractionService` (to be implemented)
- `SignatureDetectionService` (to be implemented)

## File Statistics

- **Total Lines**: ~1,965
- **Average Lines per Prompt**: ~327
- **Prompts**: 5
- **Index File**: 1
- **Documentation**: 1 (this file)
