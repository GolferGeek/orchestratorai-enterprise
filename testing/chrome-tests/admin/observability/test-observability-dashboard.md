# Observability Dashboard — Chrome Test

## Route
`/app/admin/observability`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/observability
- [x] Page renders without blank screen — "No Metrics Available" empty state
- [x] No console errors

## Level 2 — Functions Render
- [ ] Dashboard metrics/cards visible
- [ ] Event counts or charts display
- [ ] Time range selector visible
- [ ] Navigation to events page available

## Level 3 — Full Functional Testing
### Read
- [ ] Dashboard data loads
- [ ] Metrics are accurate (request counts, error rates, latencies)
- [ ] Time range filter works
- [ ] Auto-refresh if supported

### Edge Cases
- [ ] No observability data shows empty state
- [ ] Large time range handled

## Results
_Last Level 1 run: 2026-03-19 — PASS_
