# Contract Review — Test Cases

## Pre-Test Setup

```bash
# Verify services are up
curl -s http://localhost:6200/health | head -3
curl -s -o /dev/null -w "%{http_code}" http://localhost:6201
```

Both must return healthy/200. If not: stop, file P0 `browser-blank-screen`.

Have a sample contract ready. Any PDF or DOCX with legal-sounding clauses works. A simple NDA or services agreement is ideal (short enough to process quickly, has enough clauses to trigger risk findings).

---

## Test CR-1: Page Load and Navigation

**Goal**: Confirm the Contract Review page loads correctly.

**Steps**:
1. Navigate to `http://localhost:6201/app/agents/legal-department/contract-review`
2. Verify URL does not redirect to `/login`
3. Check page renders (not blank, not raw HTML)
4. Verify a button/control to start a new job is visible
5. Check console for errors

**Pass**: Page loads, no redirect, upload control visible, no console errors.  
**Fail**: Any blank screen, redirect, or console TypeError → file finding.

**Finding hash**:
```bash
echo -n "forge:browser:contract-review:page-load-blank" | shasum | cut -c1-8
```

---

## Test CR-2: File Upload and Job Queued

**Goal**: Confirm a contract can be uploaded and a job created.

**Steps**:
1. Click the new job / upload button
2. Verify `OnboardDocumentModal` opens
3. Upload a sample PDF or DOCX contract
4. Click "Queue Job"
5. Verify modal closes
6. Verify new job appears in JobActivityList with status `queued`
7. Wait up to 10 seconds — verify status transitions to `processing`

**Pass**: Job created, appears in list, transitions to processing.  
**Fail**: Modal doesn't open, file upload fails, job doesn't appear, job stays `queued` > 30s.

**GIF**: Record this flow. Save as `forge-contract-review-submit-{date}.gif`.

---

## Test CR-3: SSE Stage Progress Updates

**Goal**: Confirm the StageLadder updates as the graph processes.

**Steps**:
1. After job is `processing`, watch the StageLadder
2. Load `mcp__claude-in-chrome__read_network_requests` and verify an SSE connection exists to `/stream/{jobId}`
3. Observe: stages should appear/update (Routing → Specialist Analysis → Synthesizing)
4. Confirm at least 2 stage transitions visible before job reaches `awaiting_review`

**Pass**: StageLadder updates, SSE connection confirmed, multiple stages visible.  
**Fail**: StageLadder static, SSE missing, stages never update.

---

## Test CR-4: HITL Approve Path (Critical)

**Goal**: Confirm the HITL review modal works and approve path completes the job.

**Steps**:
1. Wait for job to reach `awaiting_review` status (up to 5 minutes)
2. Click the job row or "Review" button
3. Verify `LegalJobReviewModal` opens
4. Verify `DocumentAnalysisReviewSection` is rendered (not blank)
5. **Verify RedlineViewer is visible** — look for clause cards with risk badges
6. Confirm at least one clause card shows: risk badge + text + suggested replacement
7. Click "Approve" (or "Approve All")
8. Verify modal closes
9. Verify job transitions from `awaiting_review` → `processing` → `completed`
10. Verify completed job shows results (both tabs: "Redlined Contract" + "Risk Assessment")

**Pass**: All steps complete, RedlineViewer visible with clause cards, approval completes job.  
**Fail**: Job never reaches `awaiting_review` → P0. Modal blank → P0. RedlineViewer missing → P0.

**GIF**: Record HITL modal open → approve → completion. Save as `forge-contract-review-hitl-approve-{date}.gif`.

---

## Test CR-5: HITL Reject Path and Re-Run Loop

**Goal**: Confirm that rejecting the synthesis triggers a partial re-run, and a second HITL review appears.

**Steps**:
1. Submit a new job (or use a fresh job)
2. Wait for `awaiting_review`
3. Open the review modal
4. Click "Reject" (provide a note: "Please focus more on liability clauses")
5. Verify modal closes and job transitions back to `processing`
6. Verify StageLadder shows progress again (orchestrator re-running)
7. Wait for job to reach `awaiting_review` a second time
8. Open the modal again — verify content reflects the re-run (may differ from first pass)
9. Click "Approve" to complete

**Pass**: Reject triggers re-run, second HITL gate appears, approve completes job.  
**Fail**: Reject doesn't trigger re-run → P0. Second HITL never appears → P0. Job goes directly to `completed` after reject → P0 (HITL loop broken).

---

## Test CR-6: Completed Results — Both Tabs

**Goal**: Confirm a completed job shows proper results in both output tabs.

**Steps**:
1. Open a completed Contract Review job
2. Verify two tabs exist: "Redlined Contract" and "Risk Assessment"
3. Click "Redlined Contract" tab — verify RedlineViewer with clause cards (not blank)
4. Verify risk badges are visible on at least some clause cards
5. Click "Risk Assessment" tab — verify synthesis text is present
6. Verify no raw JSON visible, no `[object Object]`

**Pass**: Both tabs render with content, no raw JSON, no blank sections.  
**Fail**: Any blank tab, raw JSON, or `[object Object]` → file P1 finding.

---

## Test CR-7: Navigation Between Workflows

**Goal**: Confirm navigating away and back to Contract Review doesn't break state.

**Steps**:
1. Start a Contract Review job (let it queue)
2. Navigate to another Legal Department workflow (e.g., Document Onboarding)
3. Navigate back to Contract Review
4. Verify the job still appears in the list with its correct status

**Pass**: Job persists across navigation, list re-renders correctly.  
**Fail**: Job disappears, list goes blank, or console error on re-navigation → P1.

---

## Test CR-8: Console Health (Run After Each Test)

```
ToolSearch: select:mcp__claude-in-chrome__read_console_messages
```

Pattern to filter: `error|Error|TypeError|unhandled|Cannot read`

**Ignore**: Vue DevTools, hot reload, `[vite]` logs.

**File finding for**:
- `TypeError` on any user-triggered action → P1
- Unhandled promise rejection → P1
- 500 on `/invoke`, `/jobs`, `/stream` → P0

---

## Regression Checklist

After any code change touching Contract Review:

- [ ] CR-1: Page loads without blank screen
- [ ] CR-2: File upload creates a job
- [ ] CR-4: HITL modal opens with RedlineViewer clause cards
- [ ] CR-4: Approve path completes the job with results in both tabs

These 4 always run before any commit to Contract Review files.

---

## Filing a Contract Review Finding

```bash
# Compute hash
echo -n "forge:browser:contract-review:{short-description}" | shasum | cut -c1-8

# Check for existing finding
ls /Users/golfergeek/projects/orchAI/orchestratorai-enterprise/docs/testing/findings/*/

# Write finding to open/
# Filename: {hash}-forge-contract-review-{slug}.md
```

Use `browser-failure` type for browser test failures. Use `browser-hitl-broken` for HITL-specific failures.
