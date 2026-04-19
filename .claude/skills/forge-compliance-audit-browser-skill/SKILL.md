---
name: forge-compliance-audit-browser-skill
description: Progressive browser test skill for the Compliance Audit workflow. Covers two audit modes (document-driven vs full-audit), multi-framework compliance scoring, per-finding status overrides, scorecard, and HITL gate.
---

# Compliance Audit — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the two audit modes and framework scoring |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/compliance-audit`
- **Capability slug**: `compliance-audit`
- **Submission**: Multi-file upload + regulatory frameworks chip selector + audit mode toggle
- **HITL**: `LegalJobReviewModal` → `DocumentAnalysisReviewSection`
- **Key UI**: Inline `ComplianceAuditView` — scorecard grid, gap analysis, remediation plan

## Graph Node Order

```
start → intake → ingest_policies → cross_reference_loop + evaluate_finding (loop)
→ compute_scorecard → hitl_gate → report_generation → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
