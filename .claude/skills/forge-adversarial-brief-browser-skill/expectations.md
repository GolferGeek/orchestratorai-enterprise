# Brief Stress Test — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: Page loads, upload control visible, no console errors.
**FAIL**: Blank screen → P0. Redirect to login → P0. Console TypeError at load → P1.

## Flow 2: File Upload and Job Queued
**PASS**: `AdversarialBriefCreateModal` opens, file accepted, "Stress-Test" button works, job appears as `queued` → transitions to `processing` within 5s.
**FAIL**: Modal doesn't open → P1. File rejected → P1. Job stays `queued` >30s → P0.

## Flow 3: SSE Stage Progress — Debate Rounds
**PASS**: StageLadder shows `blue_team_orchestrator` and `red_team_orchestrator` stages alternating. SSE connection exists to `/stream/:jobId`. At least 2 stage transitions visible.
**FAIL**: StageLadder static → P1. SSE missing → P1 `browser-sse-broken`. Job stuck `processing` >10min → P0.

## Flow 4: HITL Review Modal (AdversarialBriefReviewModal) — Critical
**PASS**: Job reaches `awaiting_review`. Clicking job row opens `AdversarialBriefReviewModal`. Ranked attack list visible with severity scores. Per-recommendation accept/reject controls present. "Approve" button works → job completes.
**FAIL**: Job never reaches `awaiting_review` → P0. Modal opens but blank → P0. Attack list empty → P0. Approve button missing → P0.

## Flow 5: Fortification Diff
**PASS**: After approval with accepted recommendations, completed job shows `FortificationDiff` — original brief text alongside fortified version. Diff is readable (not blank, not raw JSON).
**FAIL**: Fortification diff blank or shows raw JSON → P1.

## Flow 6: Console Health
**PASS**: No TypeError, no unhandled rejections, no 5xx on core endpoints.
**FAIL**: 500 on invoke → P0. TypeError on user action → P1.

## Regression Checklist
- [ ] Page loads
- [ ] File upload creates job
- [ ] HITL modal opens with ranked attack list
- [ ] Approve completes job with FortificationDiff visible
