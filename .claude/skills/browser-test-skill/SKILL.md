---
name: browser-test-skill
description: Browser-based testing patterns for OrchestratorAI using Chrome. Covers pre-flight checks, authentication, Compose and Forge user flows, HITL browser flow, SSE progress verification, console error detection, GIF recording, and browser finding format.
allowed-tools: Read, Bash, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__find, mcp__claude-in-chrome__form_input, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__get_page_text, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__read_network_requests, mcp__claude-in-chrome__gif_creator, mcp__claude-in-chrome__computer
---

# Browser Test Skill

Browser testing is the ground truth. Real users use Chrome. Unit tests verify logic — Chrome tests verify that the product actually works. Both are required.

## IMPORTANT: Loading Chrome Tools

Chrome tools are deferred. Before calling ANY `mcp__claude-in-chrome__*` tool, load it first:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp
ToolSearch: select:mcp__claude-in-chrome__navigate
# etc.
```

Never call a Chrome tool without loading it first — it will fail with InputValidationError.

## Service Ports

| Product | URL |
|---------|-----|
| Command (shell) | http://localhost:6102 |
| Compose web | http://localhost:6301 |
| Forge web | http://localhost:6201 |
| Admin web | http://localhost:6101 |

## Pre-Flight Check

Before any browser test, verify services are running:

```bash
curl -s http://localhost:6300/health | head -5   # Compose API
curl -s http://localhost:6200/health | head -5   # Forge API
curl -s -o /dev/null -w "%{http_code}" http://localhost:6301  # Compose web
curl -s -o /dev/null -w "%{http_code}" http://localhost:6201  # Forge web
```

If any service is down, that is a **P0 browser finding** — file it immediately and stop the browser test run for that product.

## Authentication

Users log in through the Command shell or directly on the product web. Test credentials are in memory (`user_test_credentials.md`). 

Standard login flow:
1. Navigate to `http://localhost:6102` (Command shell)
2. Find login form
3. Enter credentials
4. Verify redirect to product dashboard

If auth is broken, that is a **P0 finding** — stop and report.

## Starting a Browser Test Session

```
1. Load tab context tool
2. Call tabs_context_mcp — check if a tab is already on the right product
3. If not: create a new tab, navigate to the product URL
4. Never reuse tab IDs from a previous session
```

## GIF Recording Protocol

Record GIFs for:
- Any multi-step user flow (login → select agent → run → see result)
- Any HITL flow (submit → wait → review modal → approve → complete)
- Any bug being demonstrated

**Rules**:
- Capture 2 extra frames before and after each action (smooth playback)
- Name descriptively: `compose-context-agent-happy-path.gif`, `forge-hitl-approve-flow.gif`
- Save to `docs/testing/reports/gifs/`
- Reference the GIF path in the finding file

```bash
mkdir -p /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/docs/testing/reports/gifs
```

## Compose Browser Test Flows

### Flow 1: Context Agent Happy Path

**Goal**: User can select a context agent, enter a prompt, and see a response.

Steps:
1. Navigate to `http://localhost:6301`
2. Verify page loads (no blank screen, no JS errors)
3. Find and click the agent list or navigation
4. Select a context-family agent
5. Find the input field
6. Enter: `"What can you help me with?"`
7. Submit
8. Wait for response (max 30s)
9. Verify response text appears in the UI
10. Verify no error messages visible

**Check**:
- [ ] Page renders without blank screen
- [ ] Agent list loads with at least one agent
- [ ] Input field accepts text
- [ ] Submit triggers visible loading state
- [ ] Response renders in the output area
- [ ] No red error banners
- [ ] Console: no unhandled errors

### Flow 2: RAG Agent Flow

Steps:
1. Select a RAG-family agent
2. Enter a query relevant to the collection
3. Submit
4. Verify response includes retrieved content (not just LLM hallucination)

**Check**:
- [ ] Response appears within reasonable time
- [ ] No "collection not found" errors in UI
- [ ] No 500 errors in network tab

### Flow 3: Stream Response

For agents that stream:
1. Submit a prompt
2. Watch for streaming tokens appearing incrementally
3. Verify stream completes (loading indicator disappears)
4. Verify full response visible after stream

**Check**:
- [ ] Tokens appear progressively (not all at once)
- [ ] No stalled stream (spinner spins forever)
- [ ] Complete response visible at end

### Flow 4: Error Handling in UI

1. Submit an empty prompt (if allowed)
2. Verify appropriate validation message appears
3. Do NOT trigger browser alert dialogs

**Check**:
- [ ] Validation message shown, not raw error
- [ ] No uncaught JS exceptions

## Forge Browser Test Flows

### Flow 1: Job Submission

**Goal**: User can submit a job and see it enter the queue.

Steps:
1. Navigate to `http://localhost:6201`
2. Verify page loads (no blank screen)
3. Select a workflow (Legal Department if visible, otherwise first available)
4. Find the job submission form
5. Enter test content: `"Please analyze this sample contract text for key terms and risks."`
6. Submit
7. Verify job ID appears or job enters queue
8. Verify loading/queued state visible

**Check**:
- [ ] Page renders without blank screen
- [ ] Workflow selector loads
- [ ] Form accepts input
- [ ] Submit creates a job (visible in UI)
- [ ] Status shows "queued" or "processing"
- [ ] No 500 errors in network tab

### Flow 2: SSE Progress Stream

**Goal**: Progress events stream to the UI while job runs.

Steps:
1. Submit a job (Flow 1)
2. Watch the progress area
3. Verify stage indicators update (routing → specialists → synthesis → complete)
4. Verify progress bar or stage ladder advances

**Check**:
- [ ] At least one progress event appears after submission
- [ ] Stage names update (not stuck on "queued" forever)
- [ ] No SSE connection error in console
- [ ] Network tab shows `text/event-stream` response for stream endpoint

### Flow 3: HITL Review Flow (Critical)

**Goal**: When a job hits a HITL checkpoint, the review modal appears and the user can approve or reject.

Steps:
1. Submit a job known to trigger HITL (legal department workflows often do)
2. Wait for job to reach `awaiting_review` status
3. Verify review modal or review section appears in UI
4. Verify synthesis output is displayed in the review area
5. Click "Approve" (do NOT use JS alert-triggering buttons without checking first)
6. Verify job resumes (status changes from awaiting_review)
7. Verify job eventually completes

**Check**:
- [ ] Review modal/section appears when job reaches awaiting_review
- [ ] Synthesis output is readable in the review area
- [ ] Approve button is functional
- [ ] Reject button is functional (test separately if safe)
- [ ] After approval: job status updates to processing then completed
- [ ] After rejection: job status updates to review_rejected
- [ ] No frozen UI after decision

**HITL is the most critical browser flow.** If it's broken in the UI, lawyers can't use the product. File as P0.

### Flow 4: Job History / List

Steps:
1. Navigate to the job list view
2. Verify previously submitted jobs appear
3. Verify status badges are correct (completed, failed, awaiting_review)
4. Click a completed job
5. Verify results render correctly

**Check**:
- [ ] Job list loads (not empty when jobs exist)
- [ ] Status badges match expected states
- [ ] Job detail view shows output

### Flow 5: Completed Job Results

Steps:
1. Find a completed job
2. Open it
3. Verify output renders (not raw JSON, actual formatted content)
4. Verify reasoning/thinking is accessible if present

**Check**:
- [ ] Output is readable (not `[object Object]`)
- [ ] Markdown renders correctly (not raw `## headings`)
- [ ] No blank output areas

## Console Error Detection

After every flow, check for console errors:

```
ToolSearch: select:mcp__claude-in-chrome__read_console_messages
```

Filter for errors:
- Pattern: `error|Error|TypeError|undefined|null` 
- Ignore: routine info/debug logs

Any unhandled JS error is a **P1 browser finding** minimum. If it affects functionality: P0.

## Network Error Detection

Check for failed API calls:

```
ToolSearch: select:mcp__claude-in-chrome__read_network_requests
```

Look for:
- Status 4xx/5xx on `/invoke`, `/jobs`, `/stream` endpoints
- Failed SSE connections
- CORS errors

## Browser Finding Format

Browser findings use the same finding file format but with additional fields:

```yaml
---
id: {8-char-hash}
product: compose|forge
severity: P0|P1|P2|P3
status: open
type: browser-failure|browser-blank-screen|browser-hitl-broken|browser-sse-broken|browser-console-error
file: apps/{product}/web/src/{path}.{ext}  (or 'browser' if not traceable to a file)
test: "{flow name}: {what failed}"
verify-command: "Navigate to {url}, perform {steps}, verify {expected}"
assigned-agent: forge-product-agent|general-purpose
found-date: YYYY-MM-DD
gif: docs/testing/reports/gifs/{filename}.gif  (if recorded)
triaged-date: 
fixed-date: 
verified-date: 
regression-lock: 
---

## Issue
{what the user would experience}

## Evidence
{console errors, network errors, screenshot description, or GIF reference}

## Steps to Reproduce
1. Navigate to {url}
2. {action}
3. {action}
4. Expected: {expected}
5. Actual: {actual}

## Verify Command
{human-readable steps for verify agent to follow}
```

**Hash for browser findings**:
```bash
echo -n "{product}:browser:{flow-name}:{short-description}" | shasum | cut -c1-8
```

## Severity for Browser Findings

| Severity | Examples |
|----------|---------|
| P0 | Blank screen, login broken, HITL modal missing, job never submits, 500 on invoke |
| P1 | SSE not streaming, progress stuck, job results blank, JS console errors |
| P2 | UI glitch, wrong status badge, slow load, markdown not rendering |
| P3 | Minor visual issue, cosmetic bug |

## What NOT to Do in the Browser

- **Do NOT** click buttons that trigger `alert()`, `confirm()`, or `prompt()` — they freeze the extension
- **Do NOT** navigate away mid-test without recording the current state
- **Do NOT** reload the page to "fix" a stuck state — that masks the bug; report it
- **Do NOT** skip the HITL flow because it's slow — it is the most important flow
- If the browser stops responding after 2-3 failed attempts: stop, report the blocker as a finding, move on
