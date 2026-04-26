# Compliance Audit — Test Cases

## Test CA-1: Page Load
Navigate to `/app/agents/legal-department/compliance-audit`. Verify: no blank, start button visible.

## Test CA-2: Compliance Scan Mode
Open `CreateComplianceAuditModal`. Upload a policy document (any PDF/DOCX). Select "GDPR" and "HIPAA" as frameworks. Ensure "Compliance Scan" mode selected. Click "Start Audit". Verify: job queued → processing.

## Test CA-3: Full Audit Mode Toggle
Open `CreateComplianceAuditModal`. Toggle to "Full Audit" mode. Verify: Theme Selection controls appear. Select at least 2 themes. Submit. Verify: job created (it will take longer than Scan mode).

## Test CA-4: SSE Stage Progress
Watch StageLadder. Verify `ingest_policies` → `evaluate_finding` (repeating) → `compute_scorecard` stages appear.

## Test CA-5: HITL Review (DocumentAnalysisReviewSection)
Wait for `awaiting_review`. Open `LegalJobReviewModal`. Verify `DocumentAnalysisReviewSection` shows scorecard (scores per framework selected) and findings list. Try overriding one finding's status. Click "Approve". Verify: final report generated.

## Test CA-6: Inline Results — Scorecard
After completion: verify `ComplianceAuditView` shows scorecard grid with per-framework scores (0–100%). Gap analysis with finding details visible. Remediation plan present.

## Test CA-7: Multiple Frameworks
Run with 3 frameworks simultaneously. Verify: scorecard shows all 3 frameworks with separate scores. No framework missing from output.

## Regression Checklist
- [ ] CA-1: Page loads
- [ ] CA-2: Compliance Scan mode creates job
- [ ] CA-5: HITL opens with scorecard visible
- [ ] CA-6: Completed results show per-framework scores
