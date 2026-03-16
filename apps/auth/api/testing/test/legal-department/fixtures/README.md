# Legal Department AI Test Fixtures

This directory contains test fixtures for Legal Department AI M1 tests.

## Overview

The test files use inline text-based fixtures instead of separate PDF files. This approach:
- Makes tests more maintainable (fixtures visible in test code)
- Avoids binary file management
- Enables easier test debugging
- Works with text extraction pipeline

## Test Documents

Each E2E test includes inline fixtures for:

### Document Type Classification Tests
- **NDA (Non-Disclosure Agreement)**: Contract classification test
- **MSA (Master Service Agreement)**: Agreement classification test
- **Complaint**: Pleading classification test
- **Motion to Dismiss**: Motion classification test
- **Unknown Document**: Unknown type handling test

### Section Detection Tests
- **Service Agreement**: Standard contract sections
- **Hierarchical Agreement**: Multi-level section nesting
- **Complaint**: Pleading-specific sections
- **Unstructured Letter**: Documents without clear sections

### Signature Detection Tests
- **Signed Contract**: Standard signature blocks
- **Detailed Signatures**: Signature blocks with full details
- **Three-Party Agreement**: Multiple signature blocks
- **Unsigned Draft**: Unsigned signature blocks

### Date Extraction Tests
- **Contract with Dates**: Effective date extraction
- **Multiple Date Formats**: Various date format handling
- **Lease Agreement**: Expiration and termination dates
- **Signature Dates**: Date extraction from signature blocks
- **Court Filing**: Filing date extraction

### Party Extraction Tests
- **Contract Preamble**: Party extraction from contract opening
- **Multi-Type Parties**: Different entity types (corp, LLC, individual)
- **Complaint**: Plaintiff and defendant extraction
- **Purchase Agreement**: Buyer and seller roles
- **Lease Agreement**: Lessor and lessee roles

### Integration Tests
- **Complete NDA**: Full legal metadata pipeline test (all M1 features)
- **Multi-Page MSA**: Context preservation across pages
- **Unknown Document**: Graceful handling of unknown types

## Creating New Fixtures

When adding new test fixtures:

1. **Keep them inline**: Define fixtures in test files for visibility
2. **Use realistic content**: Include actual legal document structure
3. **Test edge cases**: Include unusual but valid scenarios
4. **Document expected behavior**: Comment what each fixture tests

## External Files (Optional)

If you prefer to use actual PDF or DOCX files:

```bash
# Add sample documents
fixtures/
  sample-nda.pdf
  sample-msa.pdf
  sample-complaint.pdf
```

Then modify tests to read from files:

```typescript
const fs = require('fs');
const pdfContent = fs.readFileSync('fixtures/sample-nda.pdf');
const base64Data = pdfContent.toString('base64');
```

## Running Tests

Run all M1 legal intelligence tests:

```bash
# From apps/api directory
npm run test:e2e -- legal-department
```

Run specific test suites:

```bash
# Document type classification only
npm run test:e2e -- legal-department/document-type-classification.e2e-spec

# Section detection only
npm run test:e2e -- legal-department/section-detection.e2e-spec

# Signature detection only
npm run test:e2e -- legal-department/signature-detection.e2e-spec

# Date extraction only
npm run test:e2e -- legal-department/date-extraction.e2e-spec

# Party extraction only
npm run test:e2e -- legal-department/party-extraction.e2e-spec

# Full pipeline integration
npm run test:e2e -- legal-department/legal-metadata-pipeline.e2e-spec
```

## Test Coverage

M1 Acceptance Criteria Coverage:

- ✅ AC-1: Document type classification
- ✅ AC-2: Section detection
- ✅ AC-3: Signature detection
- ✅ AC-4: Date extraction
- ✅ AC-5: Party extraction
- ✅ AC-6: Confidence scoring
- ✅ AC-7: Multi-page document handling
- ✅ AC-8: Database storage (integration test)
- ✅ AC-9: LangGraph integration (integration test)
- ✅ AC-10: Frontend data structure (integration test)
- ✅ AC-11: Unknown document handling
- ✅ AC-12: All tests pass

## Notes

- Tests use real LLM calls (no mocking per E2E testing principles)
- Tests require running API and LangGraph services
- Tests use test user from `test-user.sql` seed
- Confidence thresholds may vary based on LLM model used
- Some tests may be flaky due to LLM non-determinism (use retry strategies)
