---
name: forge-due-diligence-browser-skill
description: Progressive browser test skill for the Due Diligence Room workflow. Covers 19-type document classification, 12 parallel specialists, two HITL review gates, risk matrix visualization, missing document detection, incremental mode, and Deal Memo generation trigger.
---

# Due Diligence Room — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the DD room architecture and two HITL gates |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/due-diligence`
- **Capability slug**: `due-diligence`
- **Submission**: Multi-file upload + deal context form (transaction type, target/buyer, jurisdiction)
- **HITL**: Two gates — `LegalJobReviewModal` → `DocumentAnalysisReviewSection` at both
- **Key UI**: Inline `DueDiligenceRoomView` (not a modal) — document grid, risk matrix, deal summary

## Graph Node Order

```
start/incremental_start → intake → classify_all → dispatch_loop + analyze_document (loop)
→ hitl_gate_1 → synthesis → hitl_gate_2 → report_generation → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
