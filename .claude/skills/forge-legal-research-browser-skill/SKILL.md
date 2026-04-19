---
name: forge-legal-research-browser-skill
description: Progressive browser test skill for the Legal Research workflow. Covers recursive research with sub-question generation, RAG-grounded citations, verified/unverified labeling, research tree building via SSE, and HITL deepen/redirect.
---

# Legal Research — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand recursive research and citation grounding |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/legal-research`
- **Capability slug**: `legal-research`
- **Submission**: Text only — legal question textarea, jurisdiction, practice area, key facts, depth controls
- **HITL**: `LegalJobReviewModal` → `LegalResearchReviewSection`
- **Key UI**: Research tree visualization, verified/unverified citation badges

## Graph Node Order

```
start → question_analysis → research_dispatcher → research_node (recursive)
      → depth_controller → synthesis → hitl_checkpoint → report_generation → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
