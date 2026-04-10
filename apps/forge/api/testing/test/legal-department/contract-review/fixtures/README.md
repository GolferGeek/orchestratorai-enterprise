# Contract Review Test Fixtures

All test fixtures use inline text content — no binary files (PDFs, DOCX) are
committed to the repository. This follows the same convention as the
document-onboarding fixtures.

## Available Fixtures

### NDA (mutual-nda.ts)
A mutual non-disclosure agreement between two parties with 12 standard
clauses. Used to validate clause segmentation accuracy, specialist risk
calibration, and redline output completeness.

### MSA (master-service-agreement.ts)
A master service agreement with broader clause coverage including IP,
indemnification, termination, and force majeure.

## Usage

```typescript
import { MUTUAL_NDA_TEXT, MUTUAL_NDA_CLAUSE_COUNT } from './fixtures/mutual-nda';
```
