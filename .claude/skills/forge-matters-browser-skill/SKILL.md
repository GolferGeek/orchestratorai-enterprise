---
name: forge-matters-browser-skill
description: Progressive browser test skill for the Persistent Case Team / Matters workflow. Covers matter creation, two parallel agents (Facts + Documents), matter dashboard with Case Overview and Documents tabs, entity deduplication, timeline events, and sub-workflow access (Deposition Prep, Cross-Exam, Sentinel).
---

# Persistent Case Team (Matters) — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the matter container and sub-workflow connections |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/matters` (list), `/app/agents/legal-department/matters/:matterId` (dashboard)
- **Capability slug**: `persistent-case-team`
- **Submission**: Form — matter name, client, type, jurisdiction, description
- **HITL**: None at matter level — sub-workflows have their own
- **Key UI**: `MatterDashboard` with Case Overview and Documents tabs; sub-workflows via Documents tab

## Graph Node Order

```
Facts Agent: start → extract_entities → build_timeline → identify_key_facts → complete
Documents Agent: start → ingest_documents → categorize_documents → extract_summaries → complete
(Both run in parallel when documents are added to a matter)
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
