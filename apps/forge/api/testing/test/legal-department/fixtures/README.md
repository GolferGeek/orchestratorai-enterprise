# Legal Department — Shared Test Fixtures

Professional-grade legal documents for testing both the **document-onboarding** and **contract-review** workflows. Each document is realistic, properly structured, and has documented properties so tests can make assertions against known values.

## Directory Structure

```
fixtures/
  index.ts                                    # Re-exports all fixtures
  contracts/
    mutual-nda.ts                             # Mutual NDA (12 articles, 5 known risks)
    master-service-agreement.ts               # MSA (15 sections, 5 known risks)
    software-license-agreement.ts             # SaaS license (12 sections, 5 known risks)
    commercial-lease.ts                       # Office lease (14 sections, 5 known risks)
  employment/
    employment-agreement.ts                   # Executive employment (12 sections, 5 known risks)
  privacy/
    data-processing-agreement.ts              # GDPR DPA (12 sections, 5 known risks)
  litigation/
    complaint-breach-of-contract.ts           # Federal complaint (NOT a contract)
  corporate/
    board-resolution.ts                       # Board resolution (NOT a contract)
```

## Usage

```typescript
import { MUTUAL_NDA, MASTER_SERVICE_AGREEMENT } from '../fixtures';

// Upload to the API
const buffer = Buffer.from(MUTUAL_NDA.text, 'utf-8');
const formData = new FormData();
formData.append('files', new Blob([buffer], { type: 'text/plain' }), MUTUAL_NDA.filename);

// Assert metadata extraction
expect(classifiedType).toContain(MUTUAL_NDA.documentType);
expect(parties).toContainEqual(expect.objectContaining({ name: MUTUAL_NDA.parties[0].name }));

// Assert risk calibration (contract-review)
const liabilityRisk = MUTUAL_NDA.knownRisks.unlimitedLiability;
expect(highRiskAnnotations).toContainEqual(
  expect.objectContaining({ riskLevel: liabilityRisk.expectedMinRisk })
);
```

## Fixture Properties

Every fixture exports a typed object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Full document content, ready to upload |
| `filename` | string | Suggested filename (e.g., `mutual-nda.txt`) |
| `mimeType` | string | MIME type (always `text/plain` for inline fixtures) |
| `documentType` | string | Expected classification (contract, lease, pleading, etc.) |
| `subType` | string | More specific type (nda, msa, complaint, resolution, etc.) |
| `parties` | array | Known parties with name, type, state/jurisdiction, role |
| `dates` | object | Known dates (effective, expiration, filing, etc.) |
| `signers` | array | Known signatories with name, title, party |
| `knownRisks` | object | (Contracts only) Expected risk findings with min risk level |

## Which Workflow Uses Which Fixtures

| Fixture | Document Onboarding | Contract Review |
|---------|:------------------:|:--------------:|
| Mutual NDA | yes | yes |
| Master Service Agreement | yes | yes |
| Software License Agreement | yes | yes |
| Commercial Lease | yes | yes |
| Employment Agreement | yes | yes |
| Data Processing Agreement | yes | yes |
| Complaint (Breach of Contract) | yes | **no** |
| Board Resolution | yes | **no** |

Litigation documents and corporate governance documents are NOT contracts — they should go through document-onboarding for metadata extraction but should NOT be sent through contract-review.

## Known Risk Summary

Each contract has 5 intentionally problematic clauses:

| Document | Critical Risks | High Risks | Medium Risks |
|----------|:-----------:|:--------:|:-----------:|
| Mutual NDA | 1 (unlimited liability) | 2 (indemnification, IP) | 2 (termination, arbitration) |
| MSA | 0 | 3 (IP, indemnification, non-compete) | 2 (liability cap, auto-renewal) |
| Software License | 0 | 3 (data usage, portability, modification) | 2 (price increase, SLA) |
| Commercial Lease | 0 | 3 (maintenance, cure rights, guarantee) | 2 (escalation, relocation) |
| Employment Agreement | 0 | 3 (non-compete, IP, arbitration costs) | 2 (non-solicitation, severance) |
| DPA | 2 (breach notification, fine cap) | 2 (sub-processors, data deletion) | 1 (audit costs) |

## Adding New Fixtures

1. Create the file in the appropriate subdirectory
2. Follow the existing pattern — export a single const with all metadata
3. Include `knownRisks` for any contract that goes through contract-review
4. Add the export to `index.ts`
5. Document the fixture in this README
