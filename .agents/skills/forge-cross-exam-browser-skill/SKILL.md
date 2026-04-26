---
name: forge-cross-exam-browser-skill
description: Progressive browser test skill for the Cross-Exam Simulation workflow. Interactive simulation accessed via Deposition Prep Workspace Simulation tab. Graph interrupts at each question waiting for witness answer — unique interactive HITL pattern.
---

# Cross-Exam Simulation — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the interrupt-based interactive simulation pattern |
| `where.md` | Access path via Deposition Prep, interaction points, DOM selectors |
| `expectations.md` | Pass/fail criteria for the interactive loop |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Access**: Via Deposition Prep Workspace → "Simulation" tab
- **Capability slug**: `cross-exam-simulation`
- **Interaction**: Real-time — question appears → user types answer → AI scores → next question or debrief
- **HITL pattern**: Interrupt-based (not approve/reject modal) — graph pauses at `question_generator` waiting for witness answer
- **Key UI**: `SimulationView` embedded in `DepositionPrepWorkspace`

## Graph Node Order

```
start → simulation_setup → question_generator (interrupt — waiting for answer)
→ [answer submitted via /answer endpoint] → answer_scorer → next_move_decider
→ (loop back to question_generator OR) debrief_generator → complete
```

## Prerequisite

Requires active Deposition Prep job. Load `forge-deposition-prep-browser-skill` first.
