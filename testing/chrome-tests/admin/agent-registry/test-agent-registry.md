# Agent Registry — Chrome Test

## Route
`/app/admin/agents`

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100
- Logged in as super-admin

## Level 1 — Page Loads (2026-03-19: FAIL)
- [x] Navigate to /app/admin/agents
- [ ] Page renders without blank screen — **STUCK on "Loading agents..." spinner**
- [ ] No console errors — **TypeError: agents.value.map is not a function** at `AgentRegistryPage.vue:18`. API response is not returning an array.

## Level 2 — Functions Render
- [ ] Agents table/list visible
- [ ] Agent names, slugs, types display
- [ ] Agent status indicators visible
- [ ] View detail action per agent
- [ ] Register/add agent button visible (if applicable)

## Level 3 — Full Functional Testing
### Read
- [ ] All registered agents display
- [ ] Agent details accurate (slug, type, product, description)
- [ ] Filter/search by name or type
- [ ] Filter by product (Forge, Compose)

### Detail Page
- [ ] Click agent navigates to /app/admin/agents/:slug
- [ ] Agent configuration visible
- [ ] Agent metadata visible
- [ ] System prompt visible (if applicable)

### Edge Cases
- [ ] No agents registered shows empty state
- [ ] Very long agent description handled

## Results
_Last Level 1 run: 2026-03-19 — FAIL (TypeError: agents.value.map is not a function)_
