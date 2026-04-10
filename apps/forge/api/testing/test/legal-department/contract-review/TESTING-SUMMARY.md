# Contract Review — Testing Summary

## Overview

Comprehensive test suite validating that contract review produces legally sound analysis with properly calibrated risk assessments, complete redline output, and a reliable HITL review cycle.

## Test Fixture

All E2E tests use the **Mutual NDA** fixture (`fixtures/mutual-nda.ts`) — a contract between Acme Corporation and Widget Technologies LLC with 12 articles containing intentionally problematic clauses:

| Article | Known Risk | Expected Risk Level |
|---------|-----------|-------------------|
| 3 | One-sided indemnification (Widget only) | High |
| 5 | Overly broad IP assignment (all Widget IP, even unrelated) | High |
| 7 | Unlimited liability for Widget, $100 cap for Acme | Critical |
| 9 | Unilateral termination (Acme: any reason; Widget: 90-day cure) | Medium |
| 11 | Mandatory arbitration with class action waiver | Medium |

## Unit Tests (Jest — `npm test`)

Located in `apps/forge/api/src/agents/legal-department/workflows/contract-review/`:

### Graph Construction (`contract-review.graph.spec.ts`)
- Graph compiles without error
- Expected node names present (start, clo_routing, orchestrator, synthesis, hitl_checkpoint, report_generation, complete, handle_error)
- No echo node (contract-review skips echo)
- Checkpointer initialized

### Synthesis Node (`nodes/synthesis.node.spec.ts`) — 10 tests
- One ClauseSynthesis per clause map entry
- overallRisk = highest annotation risk for each clause
- Clauses with no annotations → acceptable
- Single annotation → uses finding directly (no LLM merge)
- Multiple annotations → LLM merge called
- Risk breakdown totals correct
- Document-level overallRisk = highest clause risk
- flaggedClauses count accurate
- orchestration.synthesis populated with keyFindings
- Fails clearly when clauseMap is missing
- Risk hierarchy validation (critical > high > medium > low > acceptable)

### HITL Checkpoint Node (`nodes/hitl-checkpoint.node.spec.ts`) — 10 tests
- Per-clause accept → hitlApproved=true, suggestedRedline preserved
- Per-clause reject → suggestedRedline cleared, hitlApproved=false
- Per-clause modify → reviewer's language replaces suggestedRedline
- Mixed decisions (accept + reject + modify)
- hitlApprovedAt timestamp recorded
- Nonexistent clauseIds ignored gracefully
- Standard approve/reject/modify decisions
- Modify merges editedOutputs
- Observability events emitted

### Report Generation Node (`nodes/report-generation.node.spec.ts`) — 9 tests
- Generates markdown risk assessment
- Risk breakdown passed to LLM prompt
- Flagged clauses included in prompt
- Document name and party info in prompt
- Fails when redlineOutput missing
- LLM response trimmed
- Observability events for start/complete
- LLM error → failed status + emitFailed
- Handles clean contract (no flagged clauses)

### Existing Unit Tests
- `nodes/specialists.spec.ts` — 8 specialist creation, annotation shape, LLM call validation
- `nodes/orchestrator.node.spec.ts` — specialist invocation, invalid clauseId stripping, failure handling, partial re-run

## E2E Tests (Jest E2E — `npm run test:e2e`)

Located in `apps/forge/api/testing/test/legal-department/contract-review/`:

### Clause Segmentation (`clause-segmentation.e2e-spec.ts`) — 10 tests
- Non-empty clause map produced
- Reasonable section/clause count (~12 for the NDA)
- Clause IDs follow `s{N}` / `s{N}-c{N}` convention
- Every entry has non-empty text (>10 chars)
- Entry types are valid (clause | section)
- Section paths are hierarchical (e.g., "1.2.3")
- Indemnification clauses captured (Article 3)
- IP clauses captured (Article 5)
- Liability clauses captured (Article 7)
- Defined terms extracted ("Confidential Information")
- clauseCount/sectionCount consistent with entries

### Specialist Findings & Risk Calibration (`specialist-findings.e2e-spec.ts`) — 10 tests
- All 8 specialists completed (none failed)
- Specialist outputs exist for each key
- Every annotation has valid ClauseAnnotation shape
- All clauseIds reference valid clause map entries
- ≥80% of high/critical findings include suggestedLanguage
- **Risk calibration:**
  - Indemnification flagged as ≥ high risk
  - Unlimited liability flagged as critical
  - Overly broad IP assignment flagged as ≥ high
  - Standard confidentiality (Article 2) NOT over-flagged
- Multiple specialist domains produce findings (≥3 categories)
- Annotation count is reasonable (3-100)

### Redline Output Completeness (`redline-output.e2e-spec.ts`) — 12 tests
- Non-empty clauses array
- riskBreakdown totals sum to totalClauses
- flaggedClauses matches non-acceptable count
- overallRisk = highest clause risk
- Every ClauseSynthesis has required fields
- ≥80% of high/critical clauses have suggestedRedline
- Acceptable clauses have empty annotations
- Annotation risks consistent with clause overallRisk
- orchestration.synthesis has executiveSummary
- keyFindings array present
- overallRisk has level + description
- Confidence score between 0 and 1

### HITL Review Flow (`hitl-review-flow.e2e-spec.ts`) — 5 tests
- Approve-all → job completes successfully
- Per-clause decisions (accept + modify) → job completes
- Review rejected when job not awaiting_review (409)
- Review rejected without ExecutionContext (400)
- Reject without feedback returns 400

### Rejection Re-Analysis (`rejection-reanalysis.e2e-spec.ts`) — 4 tests
- Reject → re-analyze → approve completes successfully
- Per-clause rejection triggers partial re-analysis
- Reviewer feedback is recorded in the job
- Job can be cancelled while awaiting_review

## Running Tests

```bash
# Unit tests (fast, no dependencies)
cd apps/forge/api && npm test -- --testPathPattern=contract-review

# E2E tests (requires running services)
./apps/forge/api/testing/test/legal-department/contract-review/run-contract-review-tests.sh

# Individual E2E suites
./run-contract-review-tests.sh clause       # Clause segmentation
./run-contract-review-tests.sh specialist   # Specialist findings
./run-contract-review-tests.sh redline      # Redline output
./run-contract-review-tests.sh hitl         # HITL flow
./run-contract-review-tests.sh rejection    # Rejection cycle
```

## Test Count

| Category | Tests |
|----------|-------|
| Unit tests (new) | 33 |
| Unit tests (existing) | 10 |
| E2E tests | 41 |
| **Total** | **84** |
