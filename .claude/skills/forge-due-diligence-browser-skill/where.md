# Due Diligence Room — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/due-diligence`
- Sidebar: Legal Department → Due Diligence Room

## Creating a DD Room

**Modal**: `CreateDDRoomModal`

Form fields:
- **File dropzone** — multi-file; accepts PDF, DOCX, TXT, ZIP, images, CSV, JSON, PPTX
- **Transaction Type** select — acquisition / merger / investment / joint venture / asset purchase
- **Target Company** input — name of the target
- **Buyer Company** input — name of the acquirer
- **Deal Value Range** input — optional estimated deal value
- **Jurisdictions** input — comma-separated jurisdictions
- **Button**: "Create Room"

## Inline View (Not a Modal)

Results appear as an inline page component: `DueDiligenceRoomView` — not a modal overlay.

This view shows:
- **Header** — room name, status, access controls, "Generate Deal Memo" button (appears after completion)
- **Document analysis grid** — one row per document: type, classification, risk score, analysis status
- **Risk matrix** — 7 categories × 4 severity levels grid
- **Deal context summary** — extracted deal terms, parties, key dates
- **Deal Memos panel** — linked deal memos (if any generated)

## Two HITL Gates

**Gate 1** (post-extraction): `LegalJobReviewModal` → `DocumentAnalysisReviewSection`
- Shows classified documents and extracted entities
- URL: may include `?jobId=...&gate=1` or similar

**Gate 2** (post-synthesis): `LegalJobReviewModal` → `DocumentAnalysisReviewSection`
- Shows full risk matrix, deal-breaker flags, cross-references

## Deal Memo Trigger

After HITL Gate 2 completes: look for a "Generate Deal Memo" button in the `DueDiligenceRoomView` header.

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `intake` | Document Intake |
| `classify_all` | Classifying Documents |
| `dispatch_loop` / `analyze_document` | Analyzing (repeats per document) |
| `hitl_gate_1` | Awaiting Review (Gate 1) |
| `synthesis` | Synthesizing |
| `hitl_gate_2` | Awaiting Review (Gate 2) |
| `report_generation` | Generating Report |

## API Endpoints
```
POST /agents/legal-department/invoke  (multipart)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
POST /agents/legal-department/jobs/:id/review?gate=1
POST /agents/legal-department/jobs/:id/review?gate=2
GET  /agents/legal-department/jobs/:id/stream
```
