---
name: forge-adversarial-brief-browser-skill
description: Progressive browser test skill for the Brief Stress Test (Adversarial Brief) workflow. Covers Blue Team vs Red Team debate streaming, judge scoring, convergence detection, per-recommendation HITL, and fortification pass. Highest wow-factor demo in the Legal Department.
---

# Brief Stress Test — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the Blue/Red Team debate architecture |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/adversarial-brief`
- **Capability slug**: `adversarial-brief`
- **Submission**: File upload (PDF/DOCX/TXT/MD) + optional config (max rounds, severity threshold)
- **HITL**: `AdversarialBriefReviewModal` (separate from LegalJobReviewModal)
- **Key UI**: `DebateRound.vue` (rounds), `FortificationDiff.vue` (brief improvements)

## Graph Node Order

```
start → brief_analysis → blue_team_orchestrator ⇄ red_team_orchestrator → judge_scoring
      → convergence_check → (loop if more rounds) → synthesis → hitl_checkpoint
      → fortification (if approved with changes) OR report_generation → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
