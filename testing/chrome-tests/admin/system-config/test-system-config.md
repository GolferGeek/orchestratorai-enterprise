# System Configuration — Chrome Test

## Route
`/app/admin/system`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PARTIAL)
- [x] Navigate to /app/admin/system
- [x] Page renders without blank screen — "No Configuration Keys" empty state
- [ ] No console errors — **404 on system config API call** (`auth-api.service.ts:107`). Endpoint doesn't exist in Auth API yet.

## Level 2 — Functions Render
- [ ] Configuration sections/cards visible
- [ ] Current config values display
- [ ] Edit/save controls visible

## Level 3 — Full Functional Testing
### Read
- [ ] All system config keys display
- [ ] Current values shown

### Update
- [ ] Edit a config value
- [ ] Save changes
- [ ] Value persists on reload

### Edge Cases
- [ ] Invalid config value rejected
- [ ] Required fields enforced

## Results
_Last Level 1 run: 2026-03-19 — PARTIAL (404 on API endpoint)_
