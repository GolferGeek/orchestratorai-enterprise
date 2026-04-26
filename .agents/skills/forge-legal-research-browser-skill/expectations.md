# Legal Research — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, textarea input visible, no console errors.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: Text Submission and Job Queued
**PASS**: `ResearchJobCreateModal` opens, question textarea accepts text, "Start Research" works, job appears `queued` → `processing` within 5s.
**FAIL**: Modal doesn't open → P1. Text input missing → P1. Job stays `queued` >30s → P0.

## Flow 3: SSE Stage Progress — Research Tree Building
**PASS**: StageLadder shows `research_node` stage updating (may repeat as recursion deepens). SSE connection exists. Research tree (if implemented) shows nodes being added.
**FAIL**: StageLadder static → P1. SSE missing → P1. Job stuck >10min → P0.

## Flow 4: HITL Review Modal (LegalResearchReviewSection) — Critical
**PASS**: Job reaches `awaiting_review`. `LegalJobReviewModal` → `LegalResearchReviewSection` opens. Research summary visible. Unverified citation count shown. Approve button works → job completes.
**FAIL**: Job never reaches `awaiting_review` → P0. Modal blank → P0. Approve broken → P0.

## Flow 5: Completed Results
**PASS**: Completed job shows Legal Memo in `JobDetailModal`. Memo tab renders markdown (not raw). Unverified Citations tab shows count badge and list. Scope tab shows research scope statement.
**FAIL**: Memo tab blank → P1. Raw JSON visible → P1. `[object Object]` → P1.

## Flow 6: Verified vs Unverified Citation Labels
**PASS**: The memo contains at least some citations labeled as verified or unverified. The unverified count in the HITL modal matches what appears in results.
**FAIL**: No citation labels at all → P2. Count mismatch modal vs results → P1.

## Regression Checklist
- [ ] Page loads with text input
- [ ] Job submits and queues
- [ ] HITL modal opens with LegalResearchReviewSection
- [ ] Completed results show memo with citation labels
