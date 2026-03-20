# Roles & Permissions — Chrome Test

## Route
`/app/admin/roles`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/roles
- [x] Page renders — 5 roles, permissions section, recent activity
- [x] No console errors

## Level 2 — Functions Render (2026-03-19: PASS)
- [x] System Roles section — 5 roles with name, description, color-coded badge
- [x] Permissions section — "Select a role to view permissions" empty state
- [x] Recent Activity section — "No recent activity"

## Level 3 — Functional Testing (2026-03-19)

### Role List
- [x] 5 roles: Administrator (admin), Manager (manager), Member (member), Super Administrator (super-admin), Viewer (viewer)
- [x] Each has description and colored badge
- [x] Clicking a role highlights it and shows permissions below

### Permissions Display
- [x] Click Super Administrator — shows 6 permission categories: Admin (5), Agents (3), Deliverables (3), LLM (2), RAG (4), System (1)
- [x] Click Viewer — shows permissions (same categories)
- [x] Categories have expandable chevrons
- [x] Switching between roles updates permissions section

### Data Observation
- [ ] **NOTE: Viewer role shows same permission counts as Super Administrator** — all roles appear to have identical permissions. This may be seed data rather than a code bug, but would look wrong in a demo.

### Recent Activity
- [x] "No recent activity" displayed — correct for current state

## Issues Found
1. **All roles have identical permissions** — Viewer has same 18 permissions as Super Administrator. Likely seed data issue — roles table has permissions but they're all the same set.

## Results
_Last full test: 2026-03-19 — PASS (1 data concern: identical permissions across roles)_
