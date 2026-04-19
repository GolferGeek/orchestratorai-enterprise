---
name: forge-contract-review-browser-skill
description: Progressive browser test skill for the Contract Review workflow in Forge Legal Department. This is the index — read it first, then load what.md / where.md / expectations.md / tests.md as needed. Covers clause-level redline review, per-clause HITL approve/reject/modify, partial re-run on reject, RedlineViewer, and Risk Assessment tab.
---

# Contract Review — Browser Skill Index

Load this first. Then load additional files based on what you're doing.

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand what Contract Review does before testing |
| `where.md` | You need navigation steps, URL, form fields, button names, DOM selectors |
| `expectations.md` | You need to know what passing/failing looks like for each flow |
| `tests.md` | You are running or writing specific test cases |
| `completeness.md` | You are auditing brief.md coverage or demo readiness |

Load only what you need. For a quick page-load check: `where.md` is enough. For full HITL test: read all 5.

## Quick Reference

- **Route**: `/app/agents/legal-department/contract-review`
- **Full URL**: `http://localhost:6201/app/agents/legal-department/contract-review`
- **Capability slug**: `contract-review`
- **Job submission**: File upload only (PDF/DOCX via `OnboardDocumentModal`)
- **HITL component**: `LegalJobReviewModal` → `DocumentAnalysisReviewSection`
- **Results tabs**: "Redlined Contract" (RedlineViewer) + "Risk Assessment"

## Graph Node Order

```
start → clo_routing → orchestrator → synthesis → hitl_checkpoint → report_generation → complete
                                          ↑                ↓ (reject)
                                     re-run loop ←─────────┘
```

On HITL reject: orchestrator re-runs specialists with the reviewer's feedback, then hits `hitl_checkpoint` again.

## Base Skill

Always load `forge-workflow-browser-skill` before this skill for pre-flight, Chrome tool loading, session startup, SSE monitoring, and GIF recording patterns.

```
Read: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/.claude/skills/forge-workflow-browser-skill/SKILL.md
```
