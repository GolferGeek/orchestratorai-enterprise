# Organizations Management — Chrome Test

## Route
`/app/admin/organizations`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/organizations
- [x] Page renders without blank screen — 10 orgs in table, single sidebar
- [x] No console errors

## Level 2 — Functions Render (2026-03-19: PASS)
- [x] Organizations table visible — columns: slug, name, description, URL, created, actions
- [x] 10 orgs with accurate data
- [x] "+ NEW ORGANIZATION" button visible
- [x] Edit/Delete icons visible per row (blue pencil, red trash)
- [x] "10 TOTAL ORGANIZATIONS" count header
- [x] Search filter works — typing "legal" filters to just Legal org

## Level 3 — Functional Testing (2026-03-19)

### Read
- [x] Organizations list loads with all 10 orgs
- [x] Org details accurate — slug, name, description, URL (Engineering has URL), created dates
- [ ] Pagination — not applicable (10 orgs fit on one page)

### Create
- [x] Click "+ NEW ORGANIZATION" opens inline form overlay
- [x] Form has fields: Slug, Name, Description, URL
- [x] CANCEL link dismisses the form
- [x] CREATE button visible
- [ ] Not tested: actually creating an org (would modify data)

### Update
- [ ] Edit icons (blue pencil) visible but **NOT CLICKABLE** — no click handler wired up
- [ ] **BUG: Edit buttons are decorative only — not functional**

### Delete
- [ ] Delete icons (red trash) visible but **NOT CLICKABLE** — no click handler wired up
- [ ] **BUG: Delete buttons are decorative only — not functional**

### Search
- [x] Search filters in real-time as you type
- [x] Clear (X) button visible when search has text
- [ ] Clear button click doesn't clear — **must manually select-all + delete**

## Issues Found
1. **Edit buttons not wired up** — pencil icons render but have no click handler
2. **Delete buttons not wired up** — trash icons render but have no click handler
3. **Search clear (X) button doesn't work** — text must be manually cleared

## Results
_Last full test: 2026-03-19 — PASS with 3 issues (edit/delete not wired, search clear broken)_
