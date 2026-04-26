---
name: forge-monte-carlo-browser-skill
description: Progressive browser test skill for the Monte Carlo Trial Simulator. Covers form-based case record submission, outer + inner graph architecture, 4-tab results dashboard (Overview/Detailed/Charts), client-side scenario builder with instant filtering, and per-simulation transcript access. No HITL.
---

# Monte Carlo Trial Simulator — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the simulation architecture and scenario builder |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/monte-carlo`
- **Capability slug**: `monte-carlo-trial-simulator`
- **Submission**: Form only — case identity, claims, defenses, evidence, damages, simulation count (1–200)
- **HITL**: None — pure computation workflow
- **Key UI**: `MonteCarloWorkspace` with Overview/Detailed/Charts tabs; client-side scenario builder

## Graph Node Order

```
start → generate_parameter_space → run_simulations (invokes inner trial-simulation.graph per run)
→ aggregate_results → complete
```

Inner: `start → trial_setup → opening → evidence → witnesses → closing → verdict → complete`

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
