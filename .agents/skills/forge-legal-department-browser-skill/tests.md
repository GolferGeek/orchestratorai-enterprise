# Legal Department — Test Cases

Reference `where.md` for navigation steps and `expectations.md` for pass/fail criteria.

## Test 1: Page Load and Navigation

**Priority**: P0
**GIF**: `forge-legal-dept-page-load-{date}.gif`

Steps:
1. Navigate to `http://localhost:6201`
2. Wait for shell to render (sidebar visible)
3. Click "Legal Department" in sidebar
4. Verify URL becomes `/app/agents/legal-department`
5. Click "Document Onboarding" in sub-nav
6. Verify URL becomes `/app/agents/legal-department/document-onboarding`
7. Check console: no errors

Assertions:
- Shell renders with sidebar ✓
- Legal Department workspace loads ✓
- Document Onboarding page loads ✓
- No console errors ✓

---

## Test 2: Document Upload and Job Queuing

**Priority**: P0
**GIF**: `forge-legal-dept-upload-queue-{date}.gif`

Steps:
1. Navigate to `/app/agents/legal-department/document-onboarding`
2. Find and click the upload trigger button
3. Wait for `OnboardDocumentModal` to open
4. Select or drag a test file (use a small `.txt` file: "This is a sample contract for testing purposes.")
5. Verify filename appears in modal
6. Click "Queue Job"
7. Verify modal closes
8. Verify new job appears in `JobActivityList` with status `queued` or `processing`
9. Check network: `POST /invoke` returned 200 with jobId
10. Check console: no errors

Test file to create if needed:
```bash
echo "This is a sample legal document for browser testing. It contains standard contract terms and conditions." > /tmp/test-contract.txt
```

Assertions:
- Modal opens ✓
- File accepted with preview ✓
- "Queue Job" submits ✓
- `POST /invoke` → 200 ✓
- Job appears in list ✓
- No console errors ✓

---

## Test 3: SSE Stage Progress

**Priority**: P0
**GIF**: `forge-legal-dept-stage-progress-{date}.gif`

Prerequisites: Test 2 completed, job is in `processing` state.

Steps:
1. After job submission, observe `StageLadder`
2. Wait up to 10 seconds for at least one stage to become active (⟳)
3. Check network tab for `text/event-stream` connection
4. Wait for at least 2 stage transitions (⟳ → ✓, next ⟳)
5. Verify `InRowTicker` in `JobActivityList` shows current stage name
6. Check console: no SSE-related errors

JavaScript helper to check stage count:
```javascript
// Run in javascript_tool
document.querySelectorAll('[data-state="done"], .stage-done, .stage-completed').length
```

Assertions:
- At least one stage active within 10s ✓
- SSE `text/event-stream` present in network ✓
- Multiple stage transitions visible ✓
- InRowTicker updating ✓

---

## Test 4: HITL Review Modal — Approve Path

**Priority**: P0
**GIF**: `forge-legal-dept-hitl-approve-{date}.gif`

Prerequisites: A job has reached `awaiting_review` (submit a contract-review or document-onboarding job and wait).

If no job reaches HITL during testing: this is itself a finding — note "Could not reach awaiting_review state to test HITL" as P1.

Steps:
1. Watch `JobActivityList` for a job with status `awaiting_review`
2. Verify review modal appears automatically OR a "Review" button becomes visible
3. Verify URL contains `?jobId={id}`
4. Verify modal content area shows synthesis/analysis (not blank)
5. Record current job status badge
6. Click "Approve" button
7. Verify modal closes
8. Verify job status in list changes (processing → completed, or completed directly)
9. Check console: no errors during approve

Assertions:
- Modal appears when job is awaiting_review ✓
- Modal content is populated ✓
- Approve button clickable ✓
- Job status transitions after approve ✓
- Modal closes after approve ✓

---

## Test 5: Completed Job Results

**Priority**: P1
**GIF**: `forge-legal-dept-results-{date}.gif`

Prerequisites: A job has status `completed`.

Steps:
1. In `JobActivityList`, find a completed job
2. Click the job row
3. Verify results view opens
4. Verify output content is readable prose (not `[object Object]` or raw JSON)
5. Verify markdown renders (headers are rendered, not raw `##`)
6. If job used extended thinking: verify a reasoning section or collapsible block is present
7. Check console: no errors while viewing results

JavaScript check for raw JSON leak:
```javascript
// Should NOT return true for a healthy result view
document.body.innerText.includes('"content":') && document.body.innerText.includes('"outputType":')
```

Assertions:
- Results view opens ✓
- Content is readable prose ✓
- Markdown rendered ✓
- No raw JSON visible ✓

---

## Test 6: Contract Review Workflow

**Priority**: P1

Steps:
1. Navigate to `/app/agents/legal-department/contract-review`
2. Verify page loads
3. Find the job submission form
4. Enter text: `"AGREEMENT made between Party A and Party B. Party A agrees to provide services for $10,000. Payment due within 30 days. Either party may terminate with 30 days notice."`
5. Submit
6. Verify job queued
7. Follow HITL flow (Test 4 pattern)

---

## Test 7: Legal Research Workflow

**Priority**: P1

Steps:
1. Navigate to `/app/agents/legal-department/legal-research`
2. Verify page loads
3. Submit query: `"What are the key elements required for a valid contract under US law?"`
4. Verify job queued and progressing
5. Follow HITL flow if applicable

---

## Test 8: Navigation Between Sub-Workflows

**Priority**: P2

Steps:
1. Starting at Document Onboarding
2. Click each sub-nav item in turn
3. Verify each page loads without blank screen or console error
4. Verify the back navigation works

Pages to check:
- `/document-onboarding` ✓
- `/contract-review` ✓
- `/legal-research` ✓
- `/due-diligence` ✓
- `/adversarial-brief` ✓
- `/compliance-audit` ✓
- `/monte-carlo` ✓
- `/matters` ✓

---

## Test 9: Settings Page

**Priority**: P3

Steps:
1. Navigate to `/app/agents/legal-department/settings`
2. Verify page loads
3. Verify model configuration options are visible
4. Do NOT submit/save — just verify the page renders

---

## Regression Checklist

After any code change to the legal department, run Tests 1-5 as a regression suite:
- Test 1: navigation ✓
- Test 2: upload + queue ✓
- Test 3: SSE progress ✓
- Test 4: HITL approve ✓
- Test 5: results render ✓

If any of these fail after a code change: file as regression (type `regression`, severity P0).
