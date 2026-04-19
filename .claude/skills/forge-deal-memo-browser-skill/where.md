# Deal Memo Generation — Where Everything Is

## Navigation

Deal Memo is **not a standalone route** — it is triggered from within a completed Due Diligence Room.

**Path to access**:
1. Complete a Due Diligence Room job (through both HITL gates)
2. In `DueDiligenceRoomView`, look for a "Generate Deal Memo" button (appears after completion)
3. Clicking it opens `GenerateDealMemoModal`
4. After submission, navigate to the memo workspace

**Memo workspace route**: `/app/agents/legal-department/dd/:parentJobId/memo/:memoJobId`

## Submitting a Deal Memo

**Modal**: `GenerateDealMemoModal`

Form fields:
- **Parent Job ID** — hidden field, automatically filled from DD room context
- **Memo focus areas** — checkboxes: Reps & Warranties, Indemnification, Disclosure Schedules, Conditions Precedent, Covenants
- **Button**: "Generate Memo"

## Memo Workspace

**Component**: `DealMemoWorkspaceView`

Tabs:
- **Memo Sections** — formatted memo with all 5 sections, inline citations
- **Markup View** — track-changes style, what changed from DD findings

**Download buttons** (appear after HITL approval):
- "Download Markdown" — `.md` file
- "Download DOCX" — Microsoft Word document

## HITL Review Modal

**Component**: `LegalJobReviewModal` → `DealMemoReviewSection`

Shows:
- Complete drafted memo (all 5 sections)
- Citation validation summary (how many citations were validated vs. unmatched)
- **Decision buttons**: Approve | Reject (with notes for re-draft) | Modify (direct edits)
- **Hard cap note**: one re-synthesis only — if already re-run once, Modify applies directly

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `memo_intake` | Loading DD Room |
| `section_*` (5 parallel) | Drafting Sections |
| `memo_synthesis` | Assembling Memo |
| `memo_hitl_gate` | Awaiting Review |
| `memo_finalize` | Finalizing |

## API Endpoints
```
POST /agents/legal-department/jobs/:ddJobId/memo  (create memo job)
GET  /agents/legal-department/jobs/:memoJobId
POST /agents/legal-department/jobs/:memoJobId/review
GET  /agents/legal-department/jobs/:memoJobId/stream
GET  /agents/legal-department/jobs/:memoJobId/download?format=md|docx
```
