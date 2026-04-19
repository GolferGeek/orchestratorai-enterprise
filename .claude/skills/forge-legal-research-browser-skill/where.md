# Legal Research — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/legal-research`
- Sidebar: Legal Department → Legal Research

## Submitting a Job

**Modal**: `ResearchJobCreateModal`

Form fields (text only — no file upload):
- **Legal Question** textarea — required; the research question
- **Jurisdiction** input — e.g., "Federal, 9th Circuit" or "California"
- **Practice Area** select dropdown — contract law, IP, employment, regulatory, etc.
- **Key Facts** textarea — relevant facts of the case
- **Depth Limit** number input — max recursion depth for sub-questions
- **Max Iterations** number input — max sub-questions per level
- **Button**: "Start Research"

## Job Activity List
Standard `JobActivityList`. Status flow: `queued` → `processing` → `awaiting_review` → `completed`

## HITL Review Modal

**Component**: `LegalJobReviewModal` → `LegalResearchReviewSection`

The section shows:
- Research scope statement
- Summary of main findings
- Research tree (if tree visualization is implemented)
- Unverified citation count and list
- **Decision**: Approve | Reject (request more research) | Deepen (request deeper research on specific branch)

## Results View

**Modal**: `JobDetailModal`

Tabs:
- **Research Scope** — statement of what was researched and limitations
- **Legal Memo** — rendered markdown via `ReportMarkdown.vue`
- **Unverified Citations** — list of citations that couldn't be grounded in firm documents (badge count visible on tab)

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `question_analysis` | Analyzing Question |
| `research_dispatcher` | Dispatching Research |
| `research_node` | Researching (repeats per depth level) |
| `depth_controller` | Depth Check |
| `synthesis` | Synthesizing |
| `hitl_checkpoint` | Awaiting Review |
| `report_generation` | Generating Memo |

## API Endpoints
```
POST /agents/legal-department/invoke  (JSON body — no file upload)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
POST /agents/legal-department/jobs/:id/review
GET  /agents/legal-department/jobs/:id/stream
```
