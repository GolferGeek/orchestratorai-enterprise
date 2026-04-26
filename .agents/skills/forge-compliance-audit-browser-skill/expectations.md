# Compliance Audit — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, upload/start button visible, no console errors.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: File Upload + Mode Selection
**PASS**: `CreateComplianceAuditModal` opens, file dropzone accepts policy docs, framework chip selector works, mode toggle switches between Compliance Scan and Full Audit, "Start Audit" submits. Job queued → processing.
**FAIL**: Modal doesn't open → P1. Mode toggle broken → P1. Framework chips don't select → P1.

## Flow 3: SSE Stage Progress
**PASS**: StageLadder shows `ingest_policies` → `evaluate_finding` (repeating) → `compute_scorecard` stages.
**FAIL**: StageLadder static → P1. SSE missing → P1.

## Flow 4: HITL Review (DocumentAnalysisReviewSection)
**PASS**: Job reaches `awaiting_review`. `LegalJobReviewModal` opens. Scorecard and findings visible. Per-finding status override controls accessible. Approve → final report generated.
**FAIL**: HITL never fires → P0. Modal blank → P0. Per-finding overrides missing → P1.

## Flow 5: Completed Results (ComplianceAuditView)
**PASS**: Inline `ComplianceAuditView` shows scorecard grid (scores per framework), gap analysis with finding details, remediation plan. No blank sections, no raw JSON.
**FAIL**: Scorecard blank → P1. Findings list empty → P1. Remediation plan missing → P2.

## Flow 6: Audit Mode Difference
**PASS**: Compliance Scan mode produces a faster result with document-based findings. Full Audit mode produces theme-question driven findings. Both modes produce a scorecard.
**FAIL**: Both modes produce identical output → P2 (modes not differentiated).

## Regression Checklist
- [ ] Page loads
- [ ] File upload + framework selection works
- [ ] HITL modal opens with scorecard
- [ ] Completed results show compliance scores per framework
