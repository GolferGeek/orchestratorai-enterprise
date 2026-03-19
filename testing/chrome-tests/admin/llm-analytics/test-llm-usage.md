# LLM Usage — Chrome Test

## Route
`/app/admin/llm/usage`

## Prerequisites
- Admin web running on http://localhost:6101
- Admin API running on http://localhost:6150
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/llm/usage
- [x] Page renders — stats header, data table, filters
- [x] No console errors

## Level 3 — Functional Testing (2026-03-19)

### Stats Header
- [x] 7,012 TOTAL REQUESTS
- [x] 40,619.7k TOTAL TOKENS
- [x] 30 AGENTS
- [x] 9 MODELS

### Data Table
- [x] Columns: Agent, Provider, Model, Requests, Input Tokens, Output Tokens, Total Tokens
- [x] Data loads with multiple rows (direct_call, marketing-swarm agents, etc.)
- [x] Agent names as colored badges
- [x] Sorted by request count (descending)
- [x] Numbers formatted with commas

### Filters
- [x] "All Agents" dropdown visible
- [x] "All Models" dropdown visible
- [ ] Not tested: filtering by specific agent or model

### Sub-navigation
- [x] LLM Analytics section in sidebar shows Usage, Models, Costs
- [x] Usage is highlighted as active

## Issues Found
None.

## Results
_Last full test: 2026-03-19 — PASS_
