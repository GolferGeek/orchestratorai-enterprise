---
name: forge-document-onboarding-browser-skill
description: Progressive browser test skill for the Document Onboarding workflow. The foundation/reference workflow. Multi-file upload (up to 10 files), 8 parallel specialist agents, StageLadder with thinking badges, HITL via DocumentAnalysisReviewSection, markdown report with risk matrix.
---

# Document Onboarding — Browser Skill Index

## File Map

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — you are here |
| `what.md` | You need to understand this as the canonical reference workflow |
| `where.md` | Navigation, form fields, button names, DOM selectors |
| `expectations.md` | Pass/fail criteria for each flow |
| `tests.md` | Running or writing specific test cases |
| `completeness.md` | Auditing brief.md or demo readiness |

## Quick Reference

- **Route**: `/app/agents/legal-department/document-onboarding`
- **Capability slug**: `document-onboarding`
- **Submission**: Multi-file upload (PDF/DOCX/TXT/MD/images up to 10 files) via `OnboardDocumentModal`
- **HITL**: `LegalJobReviewModal` → `DocumentAnalysisReviewSection`
- **Key UI**: `JobDetailModal` with Source/Events/Structured Output tabs; StageLadder with 🧠✍️ badges

## Graph Node Order

```
start → intake → text_extraction → initial_classification → entity_extraction
→ hitl_checkpoint → storage → complete
```

## Base Skill

Load `forge-workflow-browser-skill` first for pre-flight, Chrome tools, SSE monitoring.

## Note

This is the canonical reference implementation. If any shared component is broken (StageLadder, LegalJobReviewModal, SSE stream, JobActivityList), test Document Onboarding first — it exercises all shared components.
