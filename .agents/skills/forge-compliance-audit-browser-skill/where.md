# Compliance Audit — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/compliance-audit`
- Sidebar: Legal Department → Compliance Audit

## Submitting a Job

**Modal**: `CreateComplianceAuditModal`

Form fields:
- **File dropzone** — multi-file; accepts PDF, DOCX, TXT (policy documents)
- **Regulatory Frameworks** chip selector — multi-select: GDPR, HIPAA, SOX, CCPA, ISO 27001, PCI-DSS, FERPA, etc.
- **Audit Mode** segment toggle — "Compliance Scan" vs "Full Audit"
- **Theme Selection** — visible only in Full Audit mode; which compliance themes to evaluate
- **Button**: "Start Audit"

## Inline View (Not a Modal)

Results appear as inline `ComplianceAuditView`:
- **Scorecard grid** — per-framework compliance score (0–100%) with color coding
- **Gap analysis** — findings list with domain, severity, finding description
- **Remediation plan** — priority-ordered action items with estimated effort

## HITL Review Modal

**Component**: `LegalJobReviewModal` → `DocumentAnalysisReviewSection`

The section shows the full scorecard and finding list. The reviewer can:
- Override individual finding statuses (key feature — not just approve whole audit)
- Approve → generate final report
- Reject → re-run with updated context

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `intake` | Document Intake |
| `ingest_policies` | Ingesting Policies |
| `cross_reference_loop` / `evaluate_finding` | Evaluating (repeats) |
| `compute_scorecard` | Computing Scorecard |
| `hitl_gate` | Awaiting Review |
| `report_generation` | Generating Report |

## API Endpoints
```
POST /agents/legal-department/invoke  (multipart)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
POST /agents/legal-department/jobs/:id/review
GET  /agents/legal-department/jobs/:id/stream
```
