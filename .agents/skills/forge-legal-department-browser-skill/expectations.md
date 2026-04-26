# Legal Department — Expectations (Pass / Fail)

## Page Load

**PASS**:
- `/app/agents/legal-department` renders with `LegalDepartmentWorkspace`
- Sidebar shows Legal Department sub-items
- No blank/white screen
- No unhandled console errors on load

**FAIL** (P0):
- White/blank page — shell failed to mount
- Redirect to `/login` — auth broken
- Console: `TypeError`, `Cannot read properties of undefined` on load
- Sidebar missing or empty

---

## Job Submission (Document Onboarding)

**PASS**:
- Upload modal opens on button click
- File picker accepts the uploaded file (shows filename, size)
- "Queue Job" button becomes active after file selection
- Click "Queue Job" → modal closes, new job appears in `JobActivityList` with status `queued`
- Network: `POST /invoke` returns 200 with a `jobId` in `output.content`

**FAIL** (P0):
- Upload modal does not open
- "Queue Job" button disabled after file selection with no error message
- Network: `POST /invoke` returns 4xx or 5xx
- Job does not appear in list after submission
- Console error on submit

**FAIL** (P1):
- File picker accepts file but shows no filename/size preview
- Modal stays open after successful submit (emit not fired)
- Job appears but status is immediately `failed` (job never ran)

---

## SSE Stage Progress

**PASS**:
- After job submission, at least one stage in `StageLadder` changes from ○ to ⟳ within 5 seconds
- Stages progress in order: routing → specialists → synthesis → report
- Each stage transitions ⟳ → ✓ before the next becomes ⟳
- Network shows open `text/event-stream` connection
- When job completes, all stages show ✓

**FAIL** (P0):
- Zero stage updates — `StageLadder` stays entirely in ○ state while job is "processing"
- SSE connection missing in network tab
- Stage shows ✗ (failed) immediately after starting

**FAIL** (P1):
- SSE connection opens but no events arrive (network shows open stream but no data)
- One stage completes but next never starts (stuck between stages)
- Stage order is wrong (synthesis before specialists)
- Processing jobs show no real-time ticker in `JobActivityList`

---

## HITL Review Modal

**PASS**:
- When job status reaches `awaiting_review`, review modal appears automatically (or via visible "Review" button)
- URL query param `?jobId={id}` is present
- Modal shows the synthesis output / analysis content (not blank, not loading spinner stuck)
- "Approve" button is clickable
- Clicking Approve → modal closes, job status transitions to `processing` then `completed`
- "Reject" button is clickable  
- Clicking Reject → modal closes, job status transitions to `review_rejected`

**FAIL** (P0):
- Job reaches `awaiting_review` but no modal appears and no "Review" button visible
- Modal opens but content area is blank (synthesis output not loaded)
- Approve button is present but clicking does nothing (no status change)
- After approval, job stays in `awaiting_review` permanently

**FAIL** (P1):
- Approve/Reject buttons visible but one of them is disabled with no explanation
- Modal closes after approve but job status shows `failed` instead of resuming
- Review decision is not reflected in job list status badge

---

## Job Completion — Results Rendering

**PASS**:
- Completed job is selectable in `JobActivityList`
- Selecting it opens a results view
- Output content is readable prose/markdown (not raw JSON like `{"content":"..."}`)
- Markdown renders correctly (headers, lists, bold — not raw `##` symbols)
- If reasoning/thinking was captured: a collapsible "Reasoning" section is present

**FAIL** (P1):
- Completed job is not selectable or clicking does nothing
- Results view is blank
- Output shows raw JSON string
- Markdown is unrendered (raw `## Analysis\n**Key Terms**:`)
- Long output is truncated with no "expand" option

**FAIL** (P2):
- Reasoning section missing for a job that used extended thinking
- Formatting inconsistencies (extra whitespace, broken lists)

---

## Job History

**PASS**:
- `JobActivityList` shows previously submitted jobs
- Status badges match actual job states
- Processing jobs show real-time stage name via `InRowTicker`
- "Mine" filter shows only current user's jobs; "All" shows org jobs

**FAIL** (P1):
- List is empty when jobs exist (query filter wrong or auth issue)
- Status badges don't update after job state changes (stale data)
- Processing jobs show no real-time ticker

---

## Console Expectations

**Expected (normal)**:
- Vue DevTools info messages
- Hot-reload `[vite]` messages
- Routine fetch logs

**Unexpected (file as finding)**:
- `Uncaught TypeError` or `ReferenceError` → P1
- `Unhandled promise rejection` → P1
- `401 Unauthorized` on API call → P1
- `500 Internal Server Error` on API call → P0
- `CORS error` → P0
- `Cannot read properties of null (reading 'jobId')` type errors → P1 (null guard missing)
