---
name: forge-discovery-review-browser-skill
description: Progressive browser test skill for the Discovery Review workflow. Covers bulk document coding (relevant/privileged/produced), 4 sequential HITL batch gates (privilege, relevance, hot docs, sample), BatchReviewPanel, production set generation.
---

# Discovery Review — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand the 4-gate batch review flow |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/discovery-review`
- **Capability slug**: `discovery-review`
- **Submission**: Multi-file upload + discovery protocol form (matter, claims, date range, parties, topics)
- **HITL**: 4 gates — `LegalJobReviewModal` → `BatchReviewPanel` (privilege, relevance, hot docs, sample)
- **Key UI**: Inline `DiscoveryReviewView` — document coding grid, batch indicators, production set summary

## Graph Node Order

```
start → protocol_validation → ingest → classify_all
→ dispatch_loop + code_document (loop) → build_batches
→ batch_hitl_privilege → batch_hitl_relevance → batch_hitl_hot_docs → batch_hitl_sample
→ calibration_check → generate_production_set → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.
