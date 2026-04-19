# Due Diligence Room — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/due-diligence/brief.md`
**Quality**: Very Good
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| 19 document type classification | ✓ | ✓ |
| 7 legal + 5 financial specialists (12 total) | ✓ | ✓ |
| Per-document risk scoring | ✓ | ✓ |
| Risk matrix (7 categories × 4 severity levels) | ✓ | ✓ |
| Deal-breaker flags | ✓ | ✓ |
| Missing document detection | ✓ | ~ mentioned |
| Cross-reference map | ✓ | ✓ |
| Two HITL review gates | ✓ | ~ implied |
| Incremental mode | ✓ | ~ mentioned |
| Deal Memo generation | ✓ | ~ not prominent |
| StageLadder | ✓ | ✗ |
| Sovereign/local mode | ✓ | ✗ |

## Known Gaps

**Gap 1: video: field empty (P2)**

**Gap 2: Two HITL gates not described clearly (P2)** — Brief mentions review gate but doesn't explain that there are two: one post-extraction, one post-synthesis. The two-gate model is architecturally significant.

**Gap 3: Deal Memo connection not prominent (P2)** — The DD Room → Deal Memo button is a major workflow. Brief mentions it but it should be featured as a top benefit.

**Gap 4: Incremental mode mechanics (P3)** — "Add documents without re-analyzing completed ones" is mentioned but how it works in the UI isn't described.

**Gap 5: Sovereign mode not mentioned (P3)**

## Demo Script

*"M&A due diligence at partner speed"* (5 min — longer, worth it)

| Step | Action | Say |
|------|--------|-----|
| 1 | Upload 5 documents (NDA, employment agreement, IP assignment, financial statement, corporate charter) | "Upload the deal room — any document types" |
| 2 | Watch `classify_all` → `analyze_document` per doc | "12 specialists analyze simultaneously: 7 legal, 5 financial" |
| 3 | HITL Gate 1 — show classified docs | "First review: confirm the AI classified the documents correctly" |
| 4 | Approve Gate 1 — synthesis begins | "Cross-specialist synthesis: finding connections between documents" |
| 5 | HITL Gate 2 — show risk matrix | "Second review: the full risk matrix. Red = deal-breakers." |
| 6 | Show "Generate Deal Memo" button | "One click to generate the deal memo from these findings" |

**Key moment**: Step 5 — the risk matrix with deal-breaker flags. This is what the partner needs to make a go/no-go decision.
