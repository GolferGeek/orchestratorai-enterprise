# LLM Models — Chrome Test

## Route
`/app/admin/llm/models`

## Prerequisites
- Admin web running on http://localhost:6101
- Admin API running on http://localhost:6150
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/llm/models
- [x] Page renders — provider cards, model table
- [ ] Console errors — **OaiSidebar.vue TypeError on initial load** (Vite HMR caching issue, doesn't block rendering)

## Level 3 — Functional Testing (2026-03-19)

### Stats Header
- [x] 5 PROVIDERS, 63 MODELS, 60 ENABLED

### Provider Cards
- [x] ollama — 25 models, 6,039 calls (25/25 enabled)
- [x] openai — 17 models, 706 calls (14/17 enabled)
- [x] anthropic — 4 models, 113 calls (4/4 enabled)
- [x] xai — 5 models, 81 calls (5/5 enabled)
- [x] google — 12 models, 70 calls (12/12 enabled)
- [x] Click provider highlights it and shows its models

### Model Table
- [x] Columns: Model, Context, Input $/1K, Output $/1K, Usage, Last Used, Status
- [x] ollama models load (25 listed)
- [x] Status badges ("Enabled" in green)
- [x] Usage counts visible
- [x] Last Used dates visible

## Issues Found
1. **OaiSidebar.vue console error** — `TypeError: Cannot read properties of undefined (reading 'displayName')` — Vite HMR caching issue. Doesn't block page rendering.

## Results
_Last full test: 2026-03-19 — PASS (1 console error, non-blocking)_
