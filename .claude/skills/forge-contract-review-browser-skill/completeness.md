# Contract Review — Completeness Audit Reference

## Brief Status

**File**: `apps/forge/api/src/agents/legal-department/workflows/contract-review/brief.md`  
**Quality**: Excellent — the brief is well-written and covers most features  
**video: field**: ✗ MISSING — no demo video linked

---

## Feature Inventory

### What Exists in Code and UI

| Feature | In Code | In Brief | Notes |
|---------|---------|----------|-------|
| File upload (PDF/DOCX) | ✓ | ✓ | Covered |
| 8 parallel domain specialists | ✓ | ✓ | Covered |
| Clause-level risk scoring (5 levels) | ✓ | ✓ | Covered |
| Suggested replacement language per clause | ✓ | ✓ | Covered |
| Redline viewer with color-coded risk badges | ✓ | ✓ | Covered |
| Per-clause accept/reject/modify HITL | ✓ | ✓ | Covered (briefly) |
| Partial re-run on reject | ✓ | ~ | Mentioned but UI mechanic not explained |
| Conflict detection (multiple specialists flagging same clause) | ✓ | ✗ | **Missing from brief** |
| Risk Assessment tab (separate from redline) | ✓ | ~ | Implied but not described as a separate view |
| Reasoning accordion (thinking blocks) | ✓ | ✗ | Not mentioned |
| StageLadder with thinking badges (🧠✍️) | ✓ | ✗ | Not mentioned anywhere in any brief |
| Sovereign/local-model execution | ✓ | ✗ | Supported but not mentioned |

---

## What brief.md Currently Says

The brief covers:
- **Benefits**: time savings, risk identification, suggested replacements, HITL review gate
- **Features**: clause segmentation, parallel specialists, risk scoring, redline viewer, approve/reject/modify
- **How it works**: numbered steps from upload to final report
- **When to use it**: contract negotiations, pre-signature review, vendor agreements

Overall the brief is accurate and well-positioned. It's the second-best brief in the set.

---

## Known Gaps

### Gap 1: video: field empty (P2)
```yaml
video:   # ← empty
```
Every brief has this gap. Contract Review's primary demo moment is compelling: watching the RedlineViewer populate with color-coded clause cards and running through per-clause approval.

**Recommended demo video content**:
1. Upload a services agreement (real document, ~5 pages)
2. Watch StageLadder: 8 specialists fanning out in parallel
3. Cut to completed RedlineViewer: show color-coded clause cards
4. Zoom into a Critical clause: show original text → suggested replacement (diff view)
5. Accept 2 clauses, reject 1 → watch partial re-run begin
6. Second review: approve → final risk assessment report
7. Total time: 3–4 minutes

### Gap 2: Conflict detection not in brief (P2)
When multiple specialists flag the same clause as risky, the conflict is surfaced in the UI. This is a compelling technical differentiator — the AI isn't just doing a single-pass review, it's detecting when domain experts disagree.

**Suggested addition to brief Features section**:
> **Conflict detection** — when multiple specialists flag the same clause, the conflict is surfaced and highlighted, giving you the full picture of cross-domain risk.

### Gap 3: Partial re-run mechanics not described (P3)
The brief mentions "reject for re-analysis" but doesn't explain that only the rejected content is re-run (not a full restart). This matters for lawyers who want to understand the speed/thoroughness tradeoff.

**Suggested addition**:
> **Smart re-run** — rejecting the synthesis re-runs only the specialist analysis, not the full document extraction, keeping turnaround time under 5 minutes even for a re-review.

### Gap 4: StageLadder not mentioned (P3)
The real-time stage progress visualization with thinking badges (🧠 = AI thinking, ✍️ = writing) is mentioned in no brief across all 13 workflows. It's a visual differentiator showing the AI working in real time.

### Gap 5: Sovereign mode not mentioned (P3)
Contract Review can run entirely on local Ollama with no data leaving the firm. This is a significant value proposition for firms handling sensitive M&A or litigation documents that cannot be sent to cloud providers.

---

## Demo Script

### Contract Review Demo (3–4 minutes)

*"AI-powered clause-by-clause redline in under 10 minutes"*

| Step | Action | What to Say |
|------|--------|-------------|
| 1 | Upload a 5-page services agreement | "Upload any contract — NDA, services agreement, acquisition docs" |
| 2 | Watch StageLadder: routing → 8 specialists in parallel | "8 domain specialists analyze in parallel — takes about 2 minutes" |
| 3 | Job reaches awaiting_review, open HITL modal | "The AI stops here and asks a lawyer to review before generating the final report" |
| 4 | Show RedlineViewer: color-coded clause cards | "Every clause gets a risk rating — critical clauses in red, acceptable in green" |
| 5 | Zoom into a Critical clause: show diff view | "This is the original language vs the suggested fix, side by side" |
| 6 | Accept 2, reject 1 with a note | "You can accept, reject, or modify each clause individually" |
| 7 | Watch partial re-run begin | "Rejected clause triggers a re-analysis — the AI incorporates your feedback" |
| 8 | Second approval, job completes | |
| 9 | Show Risk Assessment tab | "The full risk summary across all 8 domains — sorted by severity" |

**Key moment**: The RedlineViewer with color-coded clause cards. This is what lawyers understand. Per-clause review is familiar from Word track changes, but with AI-assigned risk levels.

---

## Brief Completeness Checklist

- [x] `title:` field set
- [ ] `video:` field set — **MISSING**
- [x] Benefits section (3–5 bullets, user-outcome focused)
- [x] Features section
- [x] "When to use it" section
- [x] "How it works" section
- [x] Every UI-visible feature in Features (mostly — conflict detection missing)
- [x] Primary demo moment hinted at
- [x] HITL interaction described
- [ ] Sovereign/local-model angle — **NOT MENTIONED**
- [ ] StageLadder/real-time visualization — **NOT MENTIONED**
