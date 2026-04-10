# Intention: Workflow Briefs

## What

Each legal workflow (contract review, document onboarding, and the 9 future workflows) gets a **brief** — a structured markdown document that explains the workflow's value to a lawyer. The brief lives as a markdown file co-located with the workflow code, served via API, and rendered in the workspace UI.

The brief has two distinct sections:
- **Benefits** — why a lawyer should care. This is the sales pitch. "You get clause-level risk assessment in minutes instead of hours." Benefits are what we're selling.
- **Features** — what the workflow does mechanically. "Breaks contracts into clauses, runs 8 domain specialists in parallel, produces per-clause risk scores." Features support the benefits but aren't the headline.

The brief also supports an optional video URL (Loom, YouTube) that gets embedded or linked prominently.

## The shape of the thing

### Brief file structure

```
workflows/contract-review/brief.md
```

With frontmatter:

```markdown
---
title: Contract Review & Redlining
video: https://www.loom.com/share/abc123
---

## Benefits
- Get clause-level risk assessment in minutes, not hours
- See suggested replacement language for every risky clause
- You approve every change — nothing ships without your sign-off

## Features
- LLM-powered clause segmentation breaks any contract into individual provisions
- 8 domain specialists (contract, IP, employment, privacy, compliance, corporate, litigation, real estate) analyze in parallel
- Per-clause risk scoring: critical, high, medium, low, acceptable
- Redline viewer with accept/reject/modify per clause
- Risk assessment report sorted by severity

## When to use it
- NDAs, MSAs, employment agreements, leases, SaaS terms
- Any two-party contract needing clause-level review
- When you want suggested alternative language, not just risk flags

## How it works
1. Upload your contract
2. Watch the system segment it into clauses and run specialist analysis
3. Review each flagged clause — accept, reject, or edit the suggestion
4. Get your final risk assessment report and redlined contract
```

### UI: Two audiences

**Regular users** see a "View Benefits" link/button on the workflow page. Clicking it opens a modal (or expands a panel) showing the rendered brief — benefits first, features second, video embedded if present. This is the "sell" view.

**Power users** (entitlement-gated) see an "Edit Brief" button. Clicking it opens a markdown editor modal with:
- Split or toggle view: raw markdown on one side, rendered preview on the other
- Save button that persists the changes
- No versioning needed — just save and it's live

### API

- `GET /agents/:slug/brief` — returns the brief markdown + frontmatter (title, video URL)
- `PUT /agents/:slug/brief` — power user saves edited brief (writes to file or storage)

### Storage

The brief is a markdown file in the codebase, served via API. For the edit/save flow, the API writes back to the file (dev) or to Supabase Storage (prod). The read path checks storage first, falls back to the codebase file.

## Why

Lawyers evaluating AI tools need to understand the value proposition in their language, not in engineering terms. A brief that leads with benefits — time saved, risk reduced, control maintained — is what converts a skeptical partner into a user. Features matter but they're supporting evidence, not the headline.

Every workflow we build should have this from day one. The brief is part of the workflow, not an afterthought.

## Constraints

- Brief is markdown with YAML frontmatter — no custom DSL
- Benefits section comes before features — always
- Video URL is optional, rendered as an embed when present
- Edit capability is power-user only (entitlement check)
- No versioning — latest save wins
- Brief renders in the workspace landing panel (empty state or dedicated tab)

## Dependencies

- Workflow codebase structure (workflows/ directory pattern from contract-review effort)
- Power user entitlement (existing RBAC system)
- Supabase Storage (for prod edit persistence — already available)

## Estimated scope

Small. 3-5 days. One markdown file per workflow, one API endpoint pair, one editor modal component, one landing panel component.
