# Due Diligence Room — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, "Create Room" or upload button visible.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: Multi-File Upload and Job Queued
**PASS**: `CreateDDRoomModal` opens, multi-file dropzone works, deal form fields accessible, "Create Room" submits. Job appears `queued` → `processing` within 5s.
**FAIL**: Modal doesn't open → P1. File limit hit without warning → P2. Job stays `queued` >30s → P0.

## Flow 3: SSE Stage Progress
**PASS**: StageLadder shows `classify_all` → `analyze_document` (repeating) stages. SSE connection confirmed.
**FAIL**: StageLadder static → P1. SSE missing → P1.

## Flow 4: HITL Gate 1 (Post-Extraction)
**PASS**: Job reaches `awaiting_review` after classification. `LegalJobReviewModal` opens. `DocumentAnalysisReviewSection` shows classified documents. Gate 1 approve → resumes processing.
**FAIL**: Gate 1 never fires → P0. Modal blank → P0. Approve doesn't resume → P0.

## Flow 5: HITL Gate 2 (Post-Synthesis)
**PASS**: After synthesis, job reaches `awaiting_review` again. Modal opens with risk matrix, deal-breaker flags. Gate 2 approve → final report generated.
**FAIL**: Gate 2 never fires after Gate 1 → P0. Modal blank for Gate 2 → P0.

## Flow 6: Inline Results View
**PASS**: `DueDiligenceRoomView` shows document grid, risk matrix, deal summary. "Generate Deal Memo" button appears after job completes.
**FAIL**: Results page blank → P1. Risk matrix missing → P1. Deal Memo button missing on completed room → P2.

## Flow 7: Incremental Mode (if testable)
**PASS**: Adding documents to an existing completed room triggers new analysis for only the new documents, not re-analysis of already-completed documents.
**FAIL**: All documents re-analyzed on every add → P1.

## Regression Checklist
- [ ] Page loads
- [ ] Multi-file upload creates job
- [ ] HITL Gate 1 opens and can be approved
- [ ] HITL Gate 2 opens and can be approved
- [ ] Inline results view shows risk matrix
