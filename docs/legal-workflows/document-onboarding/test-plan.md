# Test Plan: Document Onboarding

## Objective

Verify that Document Onboarding can classify unfamiliar legal documents, extract metadata, route to appropriate legal specialists, synthesize cross-domain findings, pause for human review, and produce a useful final report.

## Test document set

| Scenario | File | Primary purpose |
| --- | --- | --- |
| 1 | `test-documents/scenario-01-saas-msa-high-risk.md` | Commercial contract with privacy, IP, security, liability, and indemnity issues |
| 2 | `test-documents/scenario-02-separation-agreement.md` | Employment separation agreement with release, restrictive covenant, and confidentiality issues |
| 3 | `test-documents/scenario-03-commercial-lease.md` | Real-estate lease with environmental, insurance, assignment, CAM, and casualty issues |

## Scenario 1: SaaS MSA

### Expected routing

- Contract specialist
- Privacy specialist
- IP specialist
- Compliance specialist
- Corporate specialist if assignment, change-of-control, or authority issues are detected

### Expected findings

- Broad vendor right to change service terms
- Customer data use for product improvement without clear limits
- Security commitments weaker than enterprise expectations
- Liability cap too low for confidentiality, data breach, and IP claims
- Indemnity asymmetry
- Auto-renewal and termination mechanics that may create operational risk
- Ambiguous ownership of configurations, integrations, and derivative work

## Scenario 2: Separation agreement

### Expected routing

- Employment specialist
- Litigation specialist
- Contract specialist
- Compliance specialist if statutory release language is reviewed

### Expected findings

- Release scope and carveouts
- Age-related review and revocation period if applicable
- Confidentiality and non-disparagement language
- Restrictive covenant enforceability concerns
- Return-of-property and data-removal obligations
- Payment timing and tax treatment concerns
- Mutuality gaps in release or non-disparagement obligations

## Scenario 3: Commercial lease

### Expected routing

- Real-estate specialist
- Contract specialist
- Compliance specialist
- Litigation specialist if default, remedies, or indemnity issues are material

### Expected findings

- CAM audit rights and operating expense exclusions
- Assignment and subletting restrictions
- Environmental representations and indemnity
- Insurance obligations and waiver of subrogation
- Casualty/condemnation termination rights
- Maintenance responsibilities
- Renewal option mechanics
- Default cure periods and landlord remedies

## Packet test

Upload all three test documents together.

### Expected behavior

- The workflow should recognize that the upload is a mixed legal packet.
- Findings should remain document-specific where appropriate.
- The synthesis should not collapse all risks into one generic summary.
- The human review gate should present enough context for a reviewer to approve or modify the output.

## Pass criteria

- The workflow shows visible stage progress.
- Metadata includes document type, parties, dates, and relevant structural signals.
- Specialist routing matches the document content.
- The synthesized report identifies cross-domain issues.
- The report includes prioritized risks and practical next steps.
- Human review occurs before final output.

## Fail criteria

- The workflow treats every document as the same type.
- Specialist findings are generic and not tied to document language.
- No human review gate appears.
- Final output lacks priority, risk level, or recommended next action.
- Multi-document uploads lose document-specific analysis.
