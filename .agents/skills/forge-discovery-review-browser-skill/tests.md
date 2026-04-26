# Discovery Review — Test Cases

## Test DR-1: Page Load
Navigate to `/app/agents/legal-department/discovery-review`. Verify: page loads, start button visible.

## Test DR-2: Discovery Protocol Form Submission
Open `CreateDiscoveryReviewModal`. Upload 5 test documents. Fill: matter name, 2 claims, date range (past 2 years), 3 key parties, 3 key topics. Click "Queue Job". Verify: job queued → processing.

## Test DR-3: SSE Stage Progress
Watch StageLadder. Verify `classify_all` stage, then `code_document` repeating (5 times for 5 documents), then `build_batches` stage.

## Test DR-4: HITL Gate 1 — Privilege Review
Wait for first `awaiting_review`. Open `LegalJobReviewModal`. Verify `BatchReviewPanel` shows privilege batch with AI recommendations for each document. Override one document's privilege coding. Click "Approve". Verify: job resumes.
**GIF**: Record Gate 1. Save as `forge-discovery-privilege-review-{date}.gif`.

## Test DR-5: HITL Gate 2 — Relevance Review
After Gate 1 approval, wait for second `awaiting_review`. Verify `BatchReviewPanel` shows relevance batch (different documents/coding than Gate 1). Approve.

## Test DR-6: HITL Gates 3 and 4
After Gate 2 approval, verify Gates 3 (hot docs) and 4 (sample) fire in sequence. Each gate shows `BatchReviewPanel`. Approve each.

## Test DR-7: Production Set
After all 4 gates: verify `DiscoveryReviewView` shows document coding grid with final statuses. Production set summary shows documents marked "produced". Privilege log accessible.

## Test DR-8: Batch Override Persistence
After overriding a document's coding in Gate 1, verify the override is reflected in the final coding (not reverted to AI recommendation).

## Regression Checklist
- [ ] DR-1: Page loads
- [ ] DR-2: Form + upload creates job
- [ ] DR-4: Gate 1 fires with BatchReviewPanel
- [ ] DR-5/6: All subsequent gates fire
- [ ] DR-7: Production set visible after all gates
