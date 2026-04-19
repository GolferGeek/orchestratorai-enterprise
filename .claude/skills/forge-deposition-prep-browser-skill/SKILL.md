---
name: forge-deposition-prep-browser-skill
description: Progressive browser test skill for the Deposition Prep workflow. Accessed via Matter Dashboard Documents tab. Two modes — preparation outline and predicted cross-exam. Opens DepositionPrepWorkspace with 3 tabs including the Cross-Exam Simulation tab.
---

# Deposition Prep — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the two prep modes and simulation connection |
| `where.md` | Navigation via Matter Dashboard, form fields, button names |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Access**: Via Matter Dashboard → Documents tab → "Prepare for Deposition" or similar button
- **Capability slug**: `deposition-prep`
- **Submission**: Form only — case facts, witness background, witness type, deposition topics, prior statements
- **HITL**: None — information output only
- **Key UI**: `DepositionPrepWorkspace` with 3 tabs: Preparation Outline, Predicted Cross-Exam, Simulation

## Graph Node Order (Two Modes)

```
Prep Outline: start → case_analysis → question_generation → deposition_research → deposition_synthesis → complete
Predicted Cross-Exam: start → case_analysis → opposing_perspective → cross_exam_generation → answer_coaching → complete
```

## Prerequisite

A matter must exist. Load `forge-matters-browser-skill` first to create a matter and navigate to its dashboard.
