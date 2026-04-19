# Due Diligence Room — Test Cases

## Test DD-1: Page Load
Navigate to `/app/agents/legal-department/due-diligence`. Verify: no blank, create room button visible.

## Test DD-2: Create DD Room
Open `CreateDDRoomModal`. Upload 2–3 test documents (any PDF/DOCX). Select transaction type "acquisition". Fill target/buyer company. Click "Create Room". Verify: job queued → processing.

## Test DD-3: SSE Stage Progress
Watch StageLadder. Verify `classify_all` stage, then `analyze_document` repeating (one per document), then movement toward `hitl_gate_1`.

## Test DD-4: HITL Gate 1 (Post-Extraction)
Wait for `awaiting_review`. Open review modal. Verify `DocumentAnalysisReviewSection` shows classified documents with types and extraction confidence. Click "Approve". Verify: job resumes processing toward synthesis.
**GIF**: Record Gate 1 approval. Save as `forge-dd-hitl-gate1-{date}.gif`.

## Test DD-5: HITL Gate 2 (Post-Synthesis)
After synthesis, wait for second `awaiting_review`. Open review modal. Verify: risk matrix visible (7 categories), deal-breaker flags listed, cross-references shown. Click "Approve". Verify: final report generated.
**GIF**: Record Gate 2 with risk matrix. Save as `forge-dd-hitl-gate2-{date}.gif`.

## Test DD-6: Inline Results View
After completion: verify `DueDiligenceRoomView` shows document grid, risk matrix grid, deal summary. Verify "Generate Deal Memo" button appears.

## Test DD-7: Deal Memo Trigger
Click "Generate Deal Memo" button. Verify `GenerateDealMemoModal` opens. (Full deal memo test in `forge-deal-memo-browser-skill`.)

## Regression Checklist
- [ ] DD-1: Page loads
- [ ] DD-2: Multi-file upload creates room
- [ ] DD-4: HITL Gate 1 opens with document analysis
- [ ] DD-5: HITL Gate 2 opens with risk matrix
- [ ] DD-6: "Generate Deal Memo" button appears on completed room
