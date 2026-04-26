# Contract Review — Where Everything Is

## Navigation Path

1. Start at `http://localhost:6201`
2. Auth check: URL should contain `/app` after load. If still at `/` or `/login` → auth broken, file P0.
3. Sidebar → **Legal Department** → **Contract Review**
4. Or navigate directly: `http://localhost:6201/app/agents/legal-department/contract-review`

## Page Component

**File**: `apps/forge/web/src/views/agents/legal-department/ContractReviewPage.vue`  
(same pattern as LegalDepartmentPage.vue — shared workspace layout)

## Submitting a Job

### Step 1 — Open the Upload Modal

Look for a "New Job" or "Upload Contract" button on the page. This opens `OnboardDocumentModal`.

**Modal fields**:
- **File upload area** — accepts PDF, DOCX (drag & drop or click to browse)
- **No text input** — contract review is file-upload only (no free-text box)
- **"Queue Job" button** — submits the job with `capabilitySlug: 'contract-review'`

### Step 2 — Confirm Job Created

After clicking "Queue Job":
- Modal closes
- Job appears in the `JobActivityList` with status badge `queued`
- Status transitions: `queued` → `processing` (within ~1s as worker claims it)

## Job Activity List

**Component**: `JobActivityList.vue`  
**Selector**: Look for a list/table of jobs on the page

Job row contains:
- Job ID (truncated)
- Status badge: `queued` | `processing` | `awaiting_review` | `completed` | `failed` | `canceled`
- Created timestamp
- Clickable row → opens `JobDetailModal`

**Polling**: The list refreshes every 5 seconds automatically.

## Stage Progress (StageLadder)

**Component**: `StageLadder.vue`

The StageLadder shows the graph's progress through nodes. For Contract Review, stages appear in order:

| Stage key | Display label |
|-----------|--------------|
| `clo_routing` | Routing |
| `orchestrator` | Specialist Analysis |
| `synthesis` | Synthesizing |
| `hitl_checkpoint` | Awaiting Review |
| `report_generation` | Generating Report |

**Selector**: Look for elements with stage/step names, progress indicators, or thinking badges (🧠 = thinking phase, ✍️ = writing phase).

**SSE endpoint**: `GET /agents/legal-department/jobs/{jobId}/stream` (text/event-stream)

## HITL Review Modal

When job status becomes `awaiting_review`:

**Component**: `LegalJobReviewModal` dispatches to `DocumentAnalysisReviewSection` for contract-review jobs.

**Opening the modal**:
- Click the job row in JobActivityList (opens JobDetailModal)
- Or URL: `http://localhost:6201/app/agents/legal-department/contract-review?jobId={jobId}`
- Or look for a "Review" button appearing on `awaiting_review` jobs

**Modal layout** (`DocumentAnalysisReviewSection`):

The modal shows the **RedlineViewer** — a list of clause cards. Each card has:
- **Risk badge** — colored label: `critical` (red) / `high` (orange) / `medium` (yellow) / `low` (blue) / `acceptable` (green)
- **Original clause text**
- **Suggested replacement text** (with diff highlighting)
- **Per-clause action buttons**: "Accept" | "Reject" | "Modify"

Below the clause list:
- **Overall decision buttons**: "Approve All" | "Reject" | "Modify"
- Approve → `POST /agents/legal-department/jobs/{jobId}/review` with `{ approved: true }`
- Reject → same endpoint with `{ approved: false, notes: "..." }`
- Modify → same endpoint with `{ approved: true, modifications: [...] }`

## Results View (Completed Jobs)

When job status is `completed`, the detail view shows two tabs:

### Tab 1: "Redlined Contract"
**Component**: `RedlineViewer`  
Shows all clause cards with the accepted/modified replacement language. Risk badges still visible.

### Tab 2: "Risk Assessment"
Shows:
- Synthesis summary
- Specialist outputs by domain (8 specialists, expandable)
- Reasoning accordion (thinking blocks if reasoning was captured)

## Key DOM Selectors

```javascript
// Job activity list
document.querySelectorAll('[data-testid="job-row"]')  // or .job-row, .activity-row

// Status badge on a job
document.querySelector('[data-status="awaiting_review"]')

// HITL review modal
document.querySelector('[role="dialog"]')

// RedlineViewer clause cards
document.querySelectorAll('.clause-card')  // or similar

// Risk badges
document.querySelectorAll('.risk-badge')

// Accept/Reject/Modify buttons in modal
document.querySelectorAll('button[aria-label*="Accept"]')
document.querySelectorAll('button[aria-label*="Reject"]')
```

## API Endpoints

```bash
# Submit a job
POST http://localhost:6200/agents/legal-department/invoke
# Body: multipart/form-data with 'files' + 'context' JSON string

# List jobs
GET http://localhost:6200/agents/legal-department/jobs?orgSlug=big-ideas

# Get specific job
GET http://localhost:6200/agents/legal-department/jobs/{jobId}?orgSlug=big-ideas

# Submit HITL review
POST http://localhost:6200/agents/legal-department/jobs/{jobId}/review

# SSE stream
GET http://localhost:6200/agents/legal-department/jobs/{jobId}/stream
```
