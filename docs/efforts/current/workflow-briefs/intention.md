# Intention: Workflow Briefs

## What

Each legal workflow gets a **brief** — a structured markdown document that explains the workflow's value to a lawyer. The brief lives as a `brief.md` file co-located with the workflow code, served via API, and rendered in the workspace UI.

The brief has two distinct sections:
- **Benefits** — why a lawyer should care. This is the sales pitch. Benefits are what we're selling.
- **Features** — what the workflow does mechanically. Features support the benefits but aren't the headline.

The brief also supports an optional video URL (Loom, YouTube) that gets linked prominently.

## What's already built

- `brief.md` files for document-onboarding and contract-review (with benefits-first content)
- `GET /agents/:slug/brief/:capabilitySlug` API endpoint (reads brief.md, parses YAML frontmatter)
- `PUT /agents/:slug/brief/:capabilitySlug` API endpoint (power users save edits, requires admin:settings)
- `BriefModal.vue` component with view mode (rendered markdown) and edit mode (markdown editor with preview toggle)
- "Benefits" button on DocumentOnboardingPage and ContractReviewPage
- Power user detection via `rbac.isAdmin`

## What remains

### Polish the BriefModal
- Improve the markdown rendering (currently regex-based, could use a proper renderer)
- Add video embed support (currently shows a link, should embed Loom/YouTube)
- Test the edit/save flow end-to-end in the browser
- Style the modal to match the rest of the Legal Department UI

### Landing panel
- When the workflow page has no jobs yet, show the brief as the landing experience with a prominent "Upload Your First Contract" CTA instead of just "No jobs yet"
- The brief becomes the onboarding experience for new users

### Brief for every future workflow
- As each new legal workflow is built, create its brief.md alongside the code
- Write the benefits BEFORE writing the code — the brief clarifies what we're building

## The shape of the thing

### Brief file structure

```
workflows/{workflow-name}/
  brief.md       ← for lawyers
  memory.md      ← institutional knowledge (separate concern)
  {graph}.ts
  nodes/
```

Frontmatter:
```yaml
---
title: Contract Review & Redlining
video: https://www.loom.com/share/abc123
---
```

### Two audiences in the UI

**Regular users** see "Benefits" button → modal with rendered brief (benefits first, features second, video link if present).

**Power users** (admin role) see "Edit" button inside the modal → toggle between Edit/Preview, edit title + video URL + markdown, save.

### API

- `GET /agents/:slug/brief/:capabilitySlug` — returns `{ title, video, markdown }`
- `PUT /agents/:slug/brief/:capabilitySlug` — accepts `{ title, video, markdown }`, writes back to brief.md

## Why

Lawyers evaluating AI tools need to understand the value proposition in their language, not in engineering terms. A brief that leads with benefits — time saved, risk reduced, control maintained — is what converts a skeptical partner into a user.

Every workflow we build should have this from day one. The brief is part of the workflow, not an afterthought.

## Constraints

- Brief is markdown with YAML frontmatter — no custom DSL
- Benefits section comes before features — always
- Video URL is optional, rendered when present
- Edit capability is power-user only (admin entitlement)
- No versioning — latest save wins

## Dependencies

- Workflow codebase structure (workflows/ directory pattern — done)
- Power user entitlement (existing RBAC — done)
- BriefModal component (done)
- API endpoints (done)

## Estimated scope

Remaining work: 1-2 days. Landing panel, video embed, edit flow testing, styling.
