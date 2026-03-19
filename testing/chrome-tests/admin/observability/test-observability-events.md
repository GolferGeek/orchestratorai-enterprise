# Observability Events — Chrome Test

## Route
`/app/admin/observability/events`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/observability/events
- [x] Page renders without blank screen — "No Events Found" empty state, table headers, filters
- [x] No console errors

## Level 2 — Functions Render
- [ ] Events table/list visible
- [ ] Event timestamps, types, details display
- [ ] Filter/search controls visible
- [ ] Pagination visible

## Level 3 — Full Functional Testing
### Read
- [ ] Events load with data
- [ ] Event details accurate
- [ ] Filter by event type works
- [ ] Filter by date range works
- [ ] Search by keyword works
- [ ] Pagination works

### Edge Cases
- [ ] No events shows empty state
- [ ] Very old events accessible
- [ ] Large event payload displayed correctly

## Results
_Last Level 1 run: 2026-03-19 — PASS_
