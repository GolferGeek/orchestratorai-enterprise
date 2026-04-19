# Deal Memo Generation — Test Cases

## Prerequisite
Must have a completed Due Diligence Room job. Run `forge-due-diligence-browser-skill` tests first.

## Test DM-1: Generate Deal Memo Trigger
From completed DD Room, verify "Generate Deal Memo" button appears. Click it. Verify `GenerateDealMemoModal` opens. Focus area checkboxes selectable. Click "Generate Memo". Verify: memo job appears and begins processing.

## Test DM-2: SSE Stage Progress
Watch StageLadder. Verify 5 section nodes appear (can be in parallel). Then `memo_synthesis`. Then `memo_hitl_gate`.

## Test DM-3: HITL — DealMemoReviewSection (Critical)
Wait for `awaiting_review`. Open `LegalJobReviewModal`. Verify `DealMemoReviewSection` shows complete memo draft with all 5 sections. Citation validation summary visible. Click "Approve". Verify: memo finalizes.
**GIF**: Record HITL + approve. Save as `forge-deal-memo-hitl-{date}.gif`.

## Test DM-4: Reject Path and Re-synthesis
Submit a new memo job. At HITL, click "Reject" with feedback notes. Verify: re-draft begins (StageLadder shows sections re-running). Second HITL gate appears. Approve second time. Verify: memo finalizes.

## Test DM-5: Re-synthesis Cap
After a reject → re-draft → second HITL approval, submit another memo with the intent to reject again. Verify: the system either prevents a third re-draft or makes it clear this is the final version.

## Test DM-6: Download Buttons
After memo approval, verify "Download Markdown" and "Download DOCX" buttons appear. Click each. Verify: files download. Markdown file is non-empty text. DOCX file is non-zero bytes.

## Test DM-7: Memo Workspace View
Open `DealMemoWorkspaceView`. Verify Memo Sections tab shows formatted sections with readable text (not blank, not raw JSON). Markup View tab shows changes vs DD findings.

## Regression Checklist
- [ ] DM-1: "Generate Deal Memo" appears on completed DD room
- [ ] DM-3: HITL opens with DealMemoReviewSection + all 5 sections
- [ ] DM-4: Approve finalizes memo
- [ ] DM-6: Download buttons work
