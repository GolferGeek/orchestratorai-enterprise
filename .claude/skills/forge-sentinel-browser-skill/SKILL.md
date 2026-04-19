---
name: forge-sentinel-browser-skill
description: Progressive browser test skill for Portfolio Sentinel. A monitoring dashboard (not job-based). Covers 4-tab dashboard (Alerts, Signals, Portfolio, Sources), RSS/webpage source management, signal classification, and portfolio correlation. No HITL, no job submission.
---

# Portfolio Sentinel — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the monitoring model — signals, alerts, portfolio correlation |
| `where.md` | Navigation, source form fields, filter controls, DOM selectors |
| `expectations.md` | Pass/fail criteria for dashboard load and source management |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/sentinel`
- **Capability slug**: N/A (monitoring, not job-based)
- **Interaction**: Add sources, view signals/alerts, correlate to portfolio — no job submission
- **HITL**: None
- **Key UI**: `PortfolioSentinelPage` with 4 tabs: Alerts, Signals, Portfolio, Sources

## Background Graphs

```
Ingest: start → fetch_source → deduplicate → classify → store → update_source → complete
Evaluate: start → signal_enrichment → portfolio_linking → risk_assessment → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, navigation.
