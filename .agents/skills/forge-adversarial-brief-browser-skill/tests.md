# Brief Stress Test — Test Cases

## Test AB-1: Page Load
Navigate to `/app/agents/legal-department/adversarial-brief`. Verify: no blank, no login redirect, upload control visible. Check console for errors.

## Test AB-2: Brief Upload and Job Submission
Open `AdversarialBriefCreateModal`. Upload a `.txt` or `.pdf` brief. Set Max Rounds=3, Severity Threshold=6. Click "Stress-Test". Verify: modal closes, job appears `queued` → `processing` within 5s.
**GIF**: Record this flow. Save as `forge-adversarial-brief-submit-{date}.gif`.

## Test AB-3: SSE Debate Round Streaming
Watch StageLadder after job starts. Verify `blue_team_orchestrator` and `red_team_orchestrator` stages appear and update. Confirm SSE connection to `/stream/:jobId` exists (network check). Record at least 2 round transitions.
**GIF**: Record debate streaming. Save as `forge-adversarial-brief-debate-{date}.gif`.

## Test AB-4: HITL — AdversarialBriefReviewModal (Critical)
Wait for `awaiting_review`. Click job row. Verify `AdversarialBriefReviewModal` opens (NOT `LegalJobReviewModal`). Verify ranked attack list with severity scores visible. Accept 2 recommendations, reject 1. Click "Approve". Verify: modal closes, job → `processing` → `completed`.
**GIF**: Record HITL modal + approve flow. Save as `forge-adversarial-brief-hitl-{date}.gif`.

## Test AB-5: Fortification Diff
Open completed job detail. Verify `FortificationDiff` visible — original text alongside fortified version. Diff shows which sections changed based on accepted Red Team recommendations. No blank, no raw JSON.

## Test AB-6: DebateRound Components
Open completed job. Verify `DebateRound` components visible — one card per round showing Blue Team argument, Red Team attack, Judge score. At least 1 round visible.

## Test AB-7: Reject Path (Re-run)
Submit a new job. At HITL, click "Reject All". Verify: job transitions back to `processing`. StageLadder shows graph re-running. Job eventually reaches `awaiting_review` again for second review. Approve on second pass.

## Test AB-8: Console Health
After every major flow: check console for TypeError, unhandled rejections, 5xx on endpoints.

## Regression Checklist
- [ ] AB-1: Page loads
- [ ] AB-2: Brief upload creates job
- [ ] AB-4: HITL modal opens with AdversarialBriefReviewModal (ranked attacks visible)
- [ ] AB-4: Approve completes job with FortificationDiff
