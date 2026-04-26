---
name: forge-legal-department-browser-skill
description: Progressive browser test skill for the Legal Department workflow in Forge. This is the index — read it first, then load what.md / where.md / expectations.md / tests.md based on what you're doing.
allowed-tools: Read, Bash, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__find, mcp__claude-in-chrome__form_input, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__get_page_text, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__read_network_requests, mcp__claude-in-chrome__gif_creator, mcp__claude-in-chrome__computer
---

# Legal Department Browser Skill — Index

This is the index file. Read the progressive files based on your task.

## File Map

| File | Read when... | Size hint |
|------|-------------|-----------|
| `what.md` | You need to understand what Legal Department is and why each workflow matters before testing | Medium |
| `where.md` | You need exact navigation steps, routes, form fields, button names, component behavior | Medium |
| `expectations.md` | You need to know what a passing or failing result looks like for each flow | Medium |
| `tests.md` | You are running tests or writing new test cases | Large |

**Common combinations**:
- Pre-flight only → just `where.md`
- Full daily test run → `where.md` + `expectations.md` + `tests.md`
- Writing a new HITL test → `what.md` + `where.md` + `expectations.md`
- Investigating a bug → `what.md` + `expectations.md`

## Quick Reference

**Base URL**: `http://localhost:6201`
**Workspace route**: `/app/agents/legal-department`
**13 sub-workflows**: document-onboarding, contract-review, legal-research, due-diligence, adversarial-brief, discovery-review, compliance-audit, monte-carlo, matters, deposition-prep, cross-exam-simulation, persistent-case-team, sentinel

**Primary test entry point**: Document Onboarding (`/app/agents/legal-department/document-onboarding`) — accepts file or text, triggers the full async job queue + SSE + HITL flow.

**HITL component**: `LegalJobReviewModal.vue` — dispatches to sub-section based on job type. Always present when job reaches `awaiting_review`.

**Stage progress component**: `StageLadder.vue` — shows stage icons (✓ done, ⟳ active, ✗ failed, ○ pending) and thinking phase badges.

**Job list component**: `JobActivityList.vue` — shows status badges, model badge, duration, real-time ticker for processing jobs.

## Per-Workflow Deep Skills

For workflows with their own deep skill folders, load those after this skill:

| Workflow | Skill Folder |
|----------|-------------|
| Document Onboarding | `.Codex/skills/forge-document-onboarding-browser-skill/` |
| Contract Review | `.Codex/skills/forge-contract-review-browser-skill/` |
| Legal Research | `.Codex/skills/forge-legal-research-browser-skill/` |
| Due Diligence | `.Codex/skills/forge-due-diligence-browser-skill/` |
| Adversarial Brief | `.Codex/skills/forge-adversarial-brief-browser-skill/` |
| Compliance Audit | `.Codex/skills/forge-compliance-audit-browser-skill/` |
| Monte Carlo | `.Codex/skills/forge-monte-carlo-browser-skill/` |
| Matters (Persistent Case Team) | `.Codex/skills/forge-matters-browser-skill/` |
| Deal Memo | `.Codex/skills/forge-deal-memo-browser-skill/` |
| Discovery Review | `.Codex/skills/forge-discovery-review-browser-skill/` |
| Deposition Prep | `.Codex/skills/forge-deposition-prep-browser-skill/` |
| Cross-Exam Simulation | `.Codex/skills/forge-cross-exam-browser-skill/` |
| Sentinel | `.Codex/skills/forge-sentinel-browser-skill/` |

Per-workflow skills follow the same file map pattern: `SKILL.md` (index) → `what.md` → `where.md` → `expectations.md` → `tests.md` → `completeness.md`.

## Read Order for a Full Test Run

```
1. Read: forge-workflow-browser-skill/SKILL.md     ← already loaded (base)
2. Read: forge-legal-department-browser-skill/where.md
3. Read: forge-legal-department-browser-skill/expectations.md
4. Read: forge-legal-department-browser-skill/tests.md
5. For the specific workflow under test: Read its deep skill SKILL.md + tests.md
6. Run tests
7. If a failure needs deeper understanding: Read what.md
```
