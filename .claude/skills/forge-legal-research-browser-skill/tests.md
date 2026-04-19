# Legal Research — Test Cases

## Test LR-1: Page Load
Navigate to `/app/agents/legal-department/legal-research`. Verify: no blank, textarea input visible, no console errors.

## Test LR-2: Text Submission
Open `ResearchJobCreateModal`. Enter a legal question ("What are the fiduciary duties of a corporate director in Delaware?"). Set jurisdiction, practice area. Click "Start Research". Verify: job queued → processing.

## Test LR-3: SSE Research Tree Building
Watch StageLadder. Verify `research_node` stage fires and may repeat (recursive depth). Confirm SSE connection. Note whether a research tree visualization updates in real time.

## Test LR-4: HITL — LegalResearchReviewSection (Critical)
Wait for `awaiting_review`. Click job. Verify `LegalJobReviewModal` → `LegalResearchReviewSection` opens. Verify: research summary visible, unverified citation count shown. Click "Approve". Verify: job → `completed`.
**GIF**: Record HITL + approve. Save as `forge-legal-research-hitl-{date}.gif`.

## Test LR-5: Completed Results — Memo and Citations
Open completed job. Verify `JobDetailModal` tabs: Research Scope, Legal Memo, Unverified Citations. Legal Memo tab: markdown renders (not raw). Unverified Citations tab: list exists with count badge matching HITL modal count.

## Test LR-6: Verified vs Unverified Labels
In the Legal Memo, verify that some citations are labeled as verified (grounded in firm docs) and some as unverified. The distinction should be visible (different badge colors or labels).

## Test LR-7: Jurisdiction and Practice Area Controls
Verify the jurisdiction and practice area inputs accept free text / dropdown selection. Changing these before submit should affect what appears in the research scope statement.

## Regression Checklist
- [ ] LR-1: Page loads with text input
- [ ] LR-2: Job submits
- [ ] LR-4: HITL opens with research summary and citation count
- [ ] LR-5: Memo renders with citation labels
