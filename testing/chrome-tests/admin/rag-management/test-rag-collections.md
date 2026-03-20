# RAG Collections — Chrome Test

## Route
`/app/admin/rag`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PARTIAL)
- [x] Navigate to /app/admin/rag
- [x] Page renders without blank screen — table visible, "+ NEW COLLECTION" button
- [x] No console errors — but one row has empty Name/Org/Documents/Description and shows "Invalid Date"

## Level 2 — Functions Render
- [ ] Collections table/list visible
- [ ] Collection names and document counts display
- [ ] Create collection button visible
- [ ] View/edit/delete actions per collection

## Level 3 — Full Functional Testing
### Read
- [ ] Collections list loads with data
- [ ] Collection details (name, doc count, embedding model) accurate
- [ ] Click collection navigates to detail page (/app/admin/rag/:id)

### Create
- [ ] Click create button
- [ ] Fill collection name and config
- [ ] Save collection
- [ ] New collection in list

### Detail Page
- [ ] Navigate to /app/admin/rag/:id
- [ ] Documents list visible
- [ ] Document content/metadata visible
- [ ] Upload document control visible

### Delete
- [ ] Delete collection
- [ ] Confirmation dialog
- [ ] Collection removed from list

### Edge Cases
- [ ] Empty collection displays gracefully
- [ ] Duplicate collection name rejected
- [ ] Large document count pagination

## Results
_Last Level 1 run: 2026-03-19 — PARTIAL (data issue: empty row with Invalid Date)_
