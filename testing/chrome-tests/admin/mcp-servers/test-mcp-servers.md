# MCP Servers — Chrome Test

## Route
`/app/admin/mcp`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: PASS)
- [x] Navigate to /app/admin/mcp
- [x] Page renders without blank screen — Compose MCP Server v1.0.0 connected, 17 tools (supabase, slack, notion)
- [x] No console errors

## Level 2 — Functions Render
- [ ] MCP servers table/list visible
- [ ] Server names and status display
- [ ] Add/register server button visible
- [ ] Edit/delete actions per server

## Level 3 — Full Functional Testing
### Read
- [ ] Servers list loads with data
- [ ] Server details (name, URL, tools, status) accurate

### Create
- [ ] Click add server
- [ ] Enter server config
- [ ] Save server
- [ ] New server in list

### Update
- [ ] Edit existing server
- [ ] Change config
- [ ] Save changes

### Delete
- [ ] Delete server
- [ ] Server removed from list

### Edge Cases
- [ ] Invalid server URL rejected
- [ ] No servers shows empty state
- [ ] Server health check display

## Results
_Last Level 1 run: 2026-03-19 — PASS_
