# Document Onboarding — Test Cases

Document Onboarding is the **canary** — run these tests after any infrastructure change to verify shared components.

## Test DO-1: Page Load
Navigate to `/app/agents/legal-department/document-onboarding`. Verify: no blank, upload button visible, no console errors.

## Test DO-2: Single File Upload and Job Queued
Open `OnboardDocumentModal`. Upload a single PDF. Click "Queue Job". Verify: modal closes, job appears `queued` → transitions to `processing` within 5s.
**GIF**: Record upload + queue. Save as `forge-doc-onboarding-submit-{date}.gif`.

## Test DO-3: StageLadder Updates
Watch StageLadder after job starts. Verify stages update: intake → text_extraction → initial_classification → entity_extraction. SSE connection confirmed via network inspector. Thinking badges (🧠/✍️) appear on active stage.

## Test DO-4: HITL Modal — DocumentAnalysisReviewSection (Critical)
Wait for `awaiting_review`. Click job row. Verify `LegalJobReviewModal` opens. `DocumentAnalysisReviewSection` shows extracted entities, classifications, findings (not blank). Click "Approve". Verify: job → `processing` → `completed`.
**GIF**: Record HITL modal + approve. Save as `forge-doc-onboarding-hitl-{date}.gif`.

## Test DO-5: Completed Results — All 3 Sections
Open completed job in `JobDetailModal`. Verify all sections present:
- Source: document viewer or extracted text
- Events: processing log
- Structured Output: analysis results (no blank, no raw JSON)

## Test DO-6: Multi-File Upload (Up to 10)
Upload 5 files at once. Verify: single job created, processes all 5. Structured Output shows analysis for each document.

## Test DO-7: TIFF/Image File
Upload an image file (JPEG or PNG of a document). Verify: OCR extraction occurs, text extracted and analyzed. No error on non-PDF/DOCX input.

## Test DO-8: Reject Path
At HITL, click "Reject" with notes. Verify: job re-runs from appropriate node. Second HITL gate appears. Approve second time.

## Test DO-9: Console Health
After every major action: no TypeError, no unhandled rejections, no 5xx on any endpoint.

## Regression Checklist
- [ ] DO-1: Page loads
- [ ] DO-2: Single file upload creates job
- [ ] DO-3: StageLadder + SSE + thinking badges visible
- [ ] DO-4: HITL modal with DocumentAnalysisReviewSection content
- [ ] DO-5: Completed results in all 3 sections
