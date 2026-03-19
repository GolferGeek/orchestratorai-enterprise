# Crawler Sources — Chrome Test

## Route
`/app/admin/crawler`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/crawler
- [x] Page renders without blank screen — 20 sources, 19 active, 3.2k articles, "+ ADD SOURCE" button
- [x] No console errors

## Level 2 — Functions Render (2026-03-19: PASS with notes)
- [x] Crawler sources table/list visible — card layout with name, URL, article count
- [x] Source URLs and status display — green/gray dot for active/inactive
- [x] Add source button visible — "+ ADD SOURCE" in header
- [x] Edit/delete/run actions per source — click source reveals detail with pencil (edit) and trash (delete) icons
- [x] "Show inactive" toggle works
- [x] Source detail shows: URL, description, last crawl, last status, created, schedule
- [x] Recent Articles table with titles
- [ ] **BUG: "Invalid Date" systemic** — Created field, Published/First Seen columns all broken

## Level 3 — Full Functional Testing
### Read
- [ ] Sources list loads with data
- [ ] Source details (URL, schedule, last crawl, status) accurate

### Create
- [ ] Click add source
- [ ] Enter URL and config
- [ ] Save source
- [ ] New source in list

### Update
- [ ] Edit existing source
- [ ] Change URL or schedule
- [ ] Save changes

### Delete
- [ ] Delete source
- [ ] Source removed from list

### Edge Cases
- [ ] Invalid URL rejected
- [ ] Duplicate URL handled
- [ ] No sources shows empty state

## Results
_Last Level 1 run: 2026-03-19 — PASS_
