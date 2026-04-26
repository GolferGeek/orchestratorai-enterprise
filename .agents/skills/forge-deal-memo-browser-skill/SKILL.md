---
name: forge-deal-memo-browser-skill
description: Progressive browser test skill for the Deal Memo Generation workflow. Triggered from a completed Due Diligence Room. Covers 5 parallel section drafters, per-citation validation, HITL approve/reject/modify, 1-iteration re-synthesis cap, and DOCX/Markdown download.
---

# Deal Memo Generation — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the DD→Deal Memo connection and re-synthesis rules |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/dd/:parentJobId/memo/:memoJobId`
- **Capability slug**: `deal-memo`
- **Submission**: Triggered from DD Room via "Generate Deal Memo" button — not a standalone page
- **HITL**: `LegalJobReviewModal` → `DealMemoReviewSection`
- **Key UI**: `DealMemoWorkspaceView` with memo sections and markup tabs; Download buttons (MD/DOCX)

## Graph Node Order

```
start → memo_intake → section_reps_warranties + section_indemnification
      + section_disclosure_schedules + section_conditions_precedent
      + section_covenants (all parallel) → memo_synthesis
      → memo_hitl_gate → memo_finalize → complete
```

## Base Skill

Load `forge-workflow-browser-skill` + `forge-due-diligence-browser-skill` (DD room must be completed first).
