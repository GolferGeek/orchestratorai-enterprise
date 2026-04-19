---
name: forge-workflow-browser-skill
description: Base browser testing patterns shared across all Forge workflows. Covers pre-flight, authentication, navigation shell, SSE monitoring, console/network checks, GIF recording, and the index of per-workflow skill folders. Always load this before any workflow-specific skill.
allowed-tools: Read, Bash, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__find, mcp__claude-in-chrome__form_input, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__get_page_text, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__read_network_requests, mcp__claude-in-chrome__gif_creator, mcp__claude-in-chrome__computer
---

# Forge Workflow Browser Skill — Base

Shared patterns for all Forge browser testing. Load this first. Then load the workflow-specific skill based on what you're testing.

## Workflow Skill Index

Each Forge workflow has its own skill folder with progressive detail files:

| Workflow | Skill Folder | Route |
|----------|-------------|-------|
| Legal Department | `.claude/skills/forge-legal-department-browser-skill/` | `/app/agents/legal-department` |
| Contract Review (deep) | `.claude/skills/forge-contract-review-browser-skill/` | `/app/agents/legal-department/contract-review` |
| *(others added as team onboards them)* | | |

### Disabled / Deprecated Workflows — SKIP

Do not navigate to or test these. They are being deprecated.

| Agent | Route | Status |
|-------|-------|--------|
| Marketing Swarm | `/app/agents/marketing-swarm` | Deprecated |
| Data Analyst | `/app/agents/data-analyst` | Disabled |
| CAD Agent | `/app/agents/cad-agent` | Disabled |
| Extended Post Writer | `/app/agents/extended-post-writer` | Disabled |
| Business Automation | `/app/agents/business-automation-advisor` | Disabled |
| Customer Service | `/app/agents/customer-service` | Disabled |

**Progressive loading pattern** — within each workflow skill folder:

| File | Read when... |
|------|-------------|
| `SKILL.md` | Always — it's the index |
| `what.md` | You need to understand what the workflow does before testing |
| `where.md` | You need navigation steps, form fields, button names |
| `expectations.md` | You need to know what passing/failing looks like |
| `tests.md` | You are running or writing specific test cases |

Load only what you need. If you're just checking the page loads, `where.md` is enough. If you're writing a new HITL test, read `what.md` + `expectations.md` + `tests.md`.

To read a workflow file:
```
Read: /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/.claude/skills/forge-legal-department-browser-skill/where.md
```

---

## Chrome Tool Loading

ALL `mcp__claude-in-chrome__*` tools are deferred. Load each before use:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp
ToolSearch: select:mcp__claude-in-chrome__navigate
ToolSearch: select:mcp__claude-in-chrome__find
ToolSearch: select:mcp__claude-in-chrome__form_input
ToolSearch: select:mcp__claude-in-chrome__read_page
ToolSearch: select:mcp__claude-in-chrome__read_console_messages
ToolSearch: select:mcp__claude-in-chrome__read_network_requests
ToolSearch: select:mcp__claude-in-chrome__gif_creator
ToolSearch: select:mcp__claude-in-chrome__computer
```

---

## Pre-Flight

```bash
# API health
curl -s http://localhost:6200/health | head -3

# Web reachable
curl -s -o /dev/null -w "%{http_code}" http://localhost:6201
```

Both must return healthy/200. If not: file P0 finding `browser-blank-screen`, stop browser testing for this product.

---

## Session Startup

```
1. Load tabs_context_mcp
2. Call tabs_context_mcp — check existing tabs
3. Create a new tab (tabs_create_mcp) — never reuse old IDs
4. Navigate to http://localhost:6201
```

---

## Navigation Shell

Forge uses `OaiAppShell` with a sidebar. The shell route is `/app` (requires auth). Active sidebar items:
- **Legal Department** → `/app/agents/legal-department` (with sub-items for all 13 workflows)

Deprecated agents (Marketing Swarm, Data Analyst, CAD Agent, etc.) may still appear in the sidebar — skip them entirely.

If the app redirects to login: auth is broken → P0 finding, stop.

If the sidebar does not render: shell is broken → P0 finding, stop.

---

## Authentication Check

After navigation:
- If URL is still at `/` or `/login`: auth is broken
- If URL contains `/app`: auth passed
- If page is blank/white with no shell: shell failed to mount → check console

---

## SSE Monitoring Pattern

After submitting a job, the frontend opens an SSE connection. Verify it works:

```
ToolSearch: select:mcp__claude-in-chrome__read_network_requests
```

Look for:
- A request to `/invoke/stream/{jobId}` or similar with `Content-Type: text/event-stream`
- The connection stays open (not immediately closed)
- Events arriving (network request shows data)

If SSE connection is missing or immediately fails → P1 browser finding `browser-sse-broken`.

---

## Console Error Check

Run after every major action:

```
ToolSearch: select:mcp__claude-in-chrome__read_console_messages
```

Filter pattern: `error|Error|TypeError|undefined is not|Cannot read`

**Ignore**: Vue DevTools info messages, hot reload messages, routine `[vite]` logs.

**File as finding**:
- Unhandled promise rejection → P1
- TypeError / Cannot read properties → P1 (often means component received null where object expected)
- 401/403 on API calls → P1
- 500 on invoke/jobs endpoints → P0

---

## Network Error Check

```
ToolSearch: select:mcp__claude-in-chrome__read_network_requests
```

Look for failed requests (4xx/5xx) on:
- `POST /invoke`
- `GET /invoke/discovery`
- `GET /jobs` or `GET /{schema}/jobs`
- `GET /stream/:jobId`

Any 5xx → P0. Any 404 on a route that should exist → P1.

---

## GIF Recording

Record for: job submission flow, SSE progress updating, HITL review flow.

```
ToolSearch: select:mcp__claude-in-chrome__gif_creator
```

Rules:
- Capture 2 extra frames before first action and after last action
- Name: `forge-{workflow}-{flow-name}-{date}.gif`
- Save to: `docs/testing/reports/gifs/`

```bash
mkdir -p /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/docs/testing/reports/gifs
```

---

## Waiting for Async State

Forge jobs are async. After submitting, the UI must update. Use JavaScript polling to wait:

```
ToolSearch: select:mcp__claude-in-chrome__javascript_tool
```

```javascript
// Poll until a DOM element matching selector appears or timeout
const waitForSelector = (selector, timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el.textContent);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${selector}`));
      setTimeout(check, 500);
    };
    check();
  });
};
```

Use this to wait for status changes, not fixed `sleep` delays.

---

## Filing a Browser Finding

Compute hash:
```bash
echo -n "forge:browser:{flow-name}:{short-description}" | shasum | cut -c1-8
```

Check for duplicates:
```bash
ls /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/docs/testing/findings/*/
```

Write to `docs/testing/findings/open/{hash}-forge-{slug}.md` using the browser finding format in `browser-test-skill`.

---

## Do Not

- Trigger `alert()`, `confirm()`, or `prompt()` — they freeze Chrome extension
- Click delete buttons without checking if they show a confirmation dialog first
- Reload the page to fix a stuck state — that masks the bug
- Stop testing mid-flow without recording what you found
- Mark a flow as passing if you only saw the first step succeed
