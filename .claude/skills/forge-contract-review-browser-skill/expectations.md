# Contract Review — Pass/Fail Expectations

## Flow 1: Page Load

**PASS**:
- `/app/agents/legal-department/contract-review` loads without redirect to login
- Page title or heading contains "Contract Review" (or similar)
- A button to start a new job is visible (upload button, "New Job", or similar)
- No console errors at page load
- No blank/white screen

**FAIL** → severity:
- Redirect to `/login` — P0 (auth broken)
- Blank white screen with no shell — P0 (shell broken)
- Shell renders but contract review page is blank — P1 (routing/component broken)
- Console error `TypeError` or `Cannot read` at load — P1

---

## Flow 2: Job Submission (File Upload)

**PASS**:
- `OnboardDocumentModal` opens on button click
- File field accepts PDF or DOCX without error
- "Queue Job" button is clickable after file selected
- After submit: modal closes, new job appears in list with status `queued`
- Job transitions from `queued` → `processing` within ~5 seconds (worker claims it)
- No 4xx/5xx on `POST /invoke` or `POST /jobs`

**FAIL** → severity:
- Modal does not open — P1
- File field rejects valid PDF/DOCX — P1
- "Queue Job" button missing or disabled — P1
- Job does not appear in list after submit — P1
- Job stays `queued` for >30 seconds (worker not polling) — P0
- 500 on POST endpoint — P0

---

## Flow 3: SSE Stage Progress

**PASS**:
- After job status becomes `processing`, stage indicators update in StageLadder
- Stages appear in order: Routing → Specialist Analysis → Synthesizing
- At least one SSE event received (network request shows `text/event-stream`)
- No stage is stuck at the same state for >60 seconds

**FAIL** → severity:
- StageLadder not visible at all — P1
- SSE connection missing or immediately closed — P1 (`browser-sse-broken`)
- All stages show blank/empty — P1
- Job stuck in `processing` for >5 minutes with no stage updates — P0

---

## Flow 4: HITL Review Modal — Approve Path

**PASS**:
- Job status transitions to `awaiting_review`
- A review button or clickable job row reveals the `LegalJobReviewModal`
- Modal opens with `DocumentAnalysisReviewSection` (contract review content)
- **RedlineViewer is visible** — clause cards with risk badges are rendered
- At least one clause card shows: risk badge + original text + suggested replacement
- "Approve" button (or "Approve All") is present and clickable
- Clicking approve: modal closes, job transitions to `processing` → `completed`

**FAIL** → severity:
- Job never reaches `awaiting_review` (graph doesn't interrupt) — P0
- Job reaches `awaiting_review` but no review button/modal — P0
- Modal opens but shows blank content / no clause cards — P0
- RedlineViewer renders but risk badges missing — P1
- Approve button missing or not clickable — P0
- After approval: job stays `awaiting_review` indefinitely — P0

---

## Flow 5: HITL Review Modal — Reject Path

**PASS**:
- "Reject" button is present in the modal
- Clicking reject (with notes) submits successfully (no 4xx/5xx)
- Job transitions back to `processing` (re-run begins)
- StageLadder shows progress again (orchestrator node re-runs)
- Job eventually reaches `awaiting_review` again for a second review

**FAIL** → severity:
- Reject button missing — P1
- Reject submission returns 4xx/5xx — P1
- After reject: job stays `awaiting_review` (no re-run triggered) — P0
- After reject: job transitions directly to `completed` without re-run — P0 (HITL loop broken)

---

## Flow 6: Completed Results View

**PASS**:
- Completed job shows two tabs: "Redlined Contract" and "Risk Assessment"
- "Redlined Contract" tab: RedlineViewer with clause cards visible (not blank)
- Risk badges visible on clause cards
- "Risk Assessment" tab: synthesis text present (not blank)
- No raw JSON visible in the UI
- No `[object Object]` in any field

**FAIL** → severity:
- Completed job shows blank results — P1
- Only one tab visible instead of two — P1
- Raw JSON rendered in the UI — P1
- `[object Object]` visible — P1

---

## Flow 7: Console Health

Run after every major flow.

**PASS**:
- No `TypeError`, `Cannot read properties of undefined/null`
- No unhandled promise rejections
- No `401` or `403` on API calls (auth failing silently)
- No `500` on any `/invoke`, `/jobs`, or `/stream` endpoint

**FAIL** → severity:
- Unhandled promise rejection — P1
- TypeError on a user action (button click, modal open) — P1
- 500 on core endpoints — P0
- Auth silently failing (401 on API, no error shown to user) — P1

---

## Regression Checks (Run After Any Code Change)

These 4 flows must always pass before any commit touching Contract Review code:

1. Page load — no blank screen
2. File upload + job queued — job appears
3. HITL modal opens with RedlineViewer — clause cards visible
4. Approve path — job completes with results in both tabs
