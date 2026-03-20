# Database Admin — Chrome Test

## Route
`/app/admin/database`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PARTIAL)
- [x] Navigate to /app/admin/database
- [x] Page renders without blank screen — 157 tables, 50 migrations, 2 schemas, 1.1k total rows
- [ ] No console errors — **"Connection Error: Could not find the table 'public.users' in the schema cache"** banner. Also "Schemas: public, public" is duplicated.

## Level 2 — Functions Render
- [ ] Database info/stats visible
- [ ] Tables list or schema browser visible
- [ ] Connection status indicator visible
- [ ] Query/browse controls visible (if applicable)

## Level 3 — Full Functional Testing
### Read
- [ ] Database connection status shows connected
- [ ] Table list loads
- [ ] Table row counts visible
- [ ] Schema information accessible

### Edge Cases
- [ ] Database unavailable shows error state (not blank)
- [ ] Large table count handled

## Results
_Last Level 1 run: 2026-03-19 — PARTIAL (schema cache error for public.users, duplicate schema display)_
