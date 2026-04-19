# Document Onboarding — Pass/Fail Expectations

Document Onboarding is the canonical reference workflow. These tests validate the entire shared infrastructure.

## Flow 1: Page Load
**PASS**: Page loads, "Queue Job" / upload button visible, no console errors.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: File Upload and Job Queued
**PASS**: `OnboardDocumentModal` opens. File dropzone accepts PDF/DOCX/TXT (and images). "Queue Job" submits. Job appears `queued` → transitions to `processing` within 5s.
**FAIL**: Modal doesn't open → P1. File dropzone rejects valid files → P1. Job stays `queued` >30s → P0 (worker not polling).

## Flow 3: SSE Stage Progress (StageLadder)
**PASS**: StageLadder shows stages progressing: intake → text_extraction → initial_classification → entity_extraction. SSE connection confirmed. Thinking badges (🧠/✍️) appear on active stages.
**FAIL**: StageLadder static → P1. SSE missing → P1 `browser-sse-broken`. No thinking badges → P2.

## Flow 4: HITL Review Modal (DocumentAnalysisReviewSection)
**PASS**: Job reaches `awaiting_review`. `LegalJobReviewModal` opens. `DocumentAnalysisReviewSection` shows extracted data (entities, findings, classifications). Approve → job transitions to `processing` → `completed`.
**FAIL**: Job never reaches `awaiting_review` → P0. Modal blank → P0. Approve doesn't complete job → P0.

## Flow 5: Completed Results
**PASS**: Completed job in `JobDetailModal` shows all 3 sections: Source (document view), Events (stages), Structured Output (analysis). No blank sections, no raw JSON, no `[object Object]`.
**FAIL**: Any section blank → P1. Raw JSON rendered → P1.

## Flow 6: Multi-File Upload
**PASS**: Uploading 3 files at once creates one job that processes all 3. Results include analysis of all 3 documents.
**FAIL**: Second/third files silently dropped → P1. Job created but only 1 file analyzed → P1.

## Flow 7: Console Health
**PASS**: No TypeError at any point. No 5xx on invoke/stream endpoints. No unhandled promise rejections.
**FAIL**: 500 on invoke → P0. TypeError on file drop → P1.

## Regression Checklist
This is the **canary** workflow — run these after any infrastructure change:
- [ ] Page loads
- [ ] File upload queues job
- [ ] StageLadder updates with SSE
- [ ] HITL modal opens with DocumentAnalysisReviewSection content
- [ ] Approve completes job with Structured Output
