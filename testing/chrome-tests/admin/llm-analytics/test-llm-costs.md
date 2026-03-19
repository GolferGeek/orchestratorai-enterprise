# LLM Costs — Chrome Test

## Route
`/app/admin/llm/costs`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/llm/costs
- [x] Page renders without blank screen — $16.38 total, cost breakdown by product/model
- [x] No console errors

## Level 2 — Functions Render
- [ ] Cost dashboard/charts visible
- [ ] Total cost display
- [ ] Cost breakdown by model/provider/org
- [ ] Date range selector visible

## Level 3 — Full Functional Testing
### Read
- [ ] Cost data loads (or shows "no data" gracefully)
- [ ] Cost breakdown is accurate
- [ ] Date range filter works
- [ ] Export/download if supported

### Edge Cases
- [ ] No cost data shows empty state
- [ ] Very large numbers formatted correctly

## Results
_Last Level 1 run: 2026-03-19 — PASS_
