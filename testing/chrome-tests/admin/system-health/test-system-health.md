# System Health — Chrome Test

## Route
`/app/admin/system/health`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/system/health
- [x] Page renders without blank screen — "SYSTEM STATUS: HEALTHY", 6 product cards (Forge, Compose, Flow, Pulse, Bridge, Auth), all APIs healthy, web status "unknown"
- [x] No console errors

## Level 2 — Functions Render
- [ ] Product health cards visible
- [ ] Status indicators (healthy/unhealthy) per product
- [ ] API endpoint status visible
- [ ] Last check timestamp visible
- [ ] Refresh/check now button visible

## Level 3 — Full Functional Testing
### Read
- [ ] Health status loads for all products
- [ ] API endpoints show correct status
- [ ] Database connection status shown
- [ ] Supabase status shown

### Actions
- [ ] Click refresh/check now
- [ ] Status updates
- [ ] Unhealthy services clearly indicated

### Edge Cases
- [ ] Service down shows unhealthy (not error)
- [ ] All services down handled gracefully
- [ ] Auto-refresh if supported

## Results
_Last Level 1 run: 2026-03-19 — PASS_
