# Deal Memo Generation — Pass/Fail Expectations

## Prerequisite Check
**PASS**: A completed Due Diligence Room job exists. The "Generate Deal Memo" button is visible in `DueDiligenceRoomView`.
**FAIL**: Button missing on completed DD room → P1. No completed DD room exists → not a bug, no test.

## Flow 1: Generate Deal Memo Trigger
**PASS**: Clicking "Generate Deal Memo" opens `GenerateDealMemoModal`. Focus area checkboxes are selectable. "Generate Memo" submits. New deal memo job appears and begins processing.
**FAIL**: Button does nothing → P1. Modal doesn't open → P1. Job fails immediately → P0.

## Flow 2: SSE Stage Progress
**PASS**: StageLadder shows 5 section nodes (can appear in parallel), then `memo_synthesis`, then `memo_hitl_gate`. SSE connection confirmed.
**FAIL**: StageLadder static → P1. SSE missing → P1.

## Flow 3: HITL Review (DealMemoReviewSection)
**PASS**: Job reaches `awaiting_review`. `LegalJobReviewModal` → `DealMemoReviewSection` opens. Full drafted memo visible across 5 sections. Citation validation summary shown. Approve button works → memo finalized.
**FAIL**: HITL never fires → P0. Modal blank → P0. Memo sections empty → P0. Approve broken → P0.

## Flow 4: Re-Synthesis Cap (Reject Path)
**PASS**: Rejecting the memo triggers re-draft. Second HITL gate appears. After second approval, memo finalizes. A third rejection attempt should NOT trigger another re-draft (hard cap at 1 re-synthesis).
**FAIL**: Reject doesn't trigger re-draft → P0. Second HITL never appears → P0. Re-synthesis cap not enforced (third rejection triggers another run) → P1.

## Flow 5: Download Buttons
**PASS**: After approval, Download Markdown and Download DOCX buttons appear. Clicking each triggers a file download. Downloaded files are not empty.
**FAIL**: Download buttons missing → P2. Downloaded files empty → P1.

## Regression Checklist
- [ ] "Generate Deal Memo" button appears on completed DD room
- [ ] HITL modal opens with DealMemoReviewSection
- [ ] Approve completes memo
- [ ] Download buttons appear after completion
