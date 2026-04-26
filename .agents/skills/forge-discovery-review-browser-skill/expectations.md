# Discovery Review — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, upload or "Start Review" button visible.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: Discovery Protocol Form + File Upload
**PASS**: `CreateDiscoveryReviewModal` opens. Multi-file dropzone accepts files. All form fields (matter, claims, date range, parties, topics) accessible. "Queue Job" submits. Job queued → processing.
**FAIL**: Modal doesn't open → P1. Date fields don't accept dates → P1. Job stays `queued` >30s → P0.

## Flow 3: SSE Stage Progress
**PASS**: StageLadder shows `classify_all` → `code_document` (repeating per document) → `build_batches` stages.
**FAIL**: StageLadder static → P1. SSE missing → P1.

## Flow 4: HITL Gate 1 — Privilege Review
**PASS**: Job reaches `awaiting_review` after classification. `BatchReviewPanel` opens with privilege coding batch. Documents listed with AI privilege recommendations. Approve → job resumes.
**FAIL**: Gate 1 never fires → P0. BatchReviewPanel blank → P0.

## Flow 5: HITL Gate 2 — Relevance Review
**PASS**: After Gate 1 approval, job reaches `awaiting_review` again. `BatchReviewPanel` opens with relevance coding batch. Approve → job resumes.
**FAIL**: Gate 2 never fires after Gate 1 → P0.

## Flow 6: HITL Gates 3 and 4 — Hot Docs and Sample
**PASS**: Gates 3 (hot docs) and 4 (sample) each fire in sequence, each show `BatchReviewPanel` with appropriate document set.
**FAIL**: Either gate missing → P1.

## Flow 7: Production Set Generated
**PASS**: After all 4 gates, job completes. `DiscoveryReviewView` shows document coding grid with final statuses. Production set summary shows count of produced documents.
**FAIL**: Final view blank → P1. Production set missing → P1.

## Regression Checklist
- [ ] Page loads
- [ ] Form + file upload creates job
- [ ] All 4 HITL batch gates fire in sequence
- [ ] Production set visible after completion
