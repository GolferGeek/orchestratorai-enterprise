# Document Onboarding — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/document-onboarding`
- Sidebar: Legal Department → Document Onboarding

## Submitting a Job

**Modal**: `OnboardDocumentModal`

Form fields:
- **File dropzone** — accepts: `.txt`, `.md`, `.json`, `.csv`, `.pdf`, `.docx`, `.pptx`, images, GIF — up to 10 files
- No text input field — file upload only
- **Button**: "Queue Job"
- **Capability slug**: `document-onboarding`

After clicking "Queue Job": modal closes, job appears in `JobActivityList` with status `queued`.

## Job Activity List

Standard `JobActivityList`. Click any job row to open `JobDetailModal`.

Status flow: `queued` → `processing` → `awaiting_review` → `processing` → `completed`

## HITL Review Modal

**Component**: `LegalJobReviewModal` → `DocumentAnalysisReviewSection`

Shows extracted data: classified entities, key facts, risk findings. Decision buttons: Approve | Reject | Modify.

## Results View

**Modal**: `JobDetailModal`

Tabs (or sections):
- **Source** — original file or extracted text view
- **Events** — processing pipeline log / StageLadder
- **Structured Output** — classified findings per document type

## StageLadder

For Document Onboarding the stages are:
| Stage | Label |
|-------|-------|
| `intake` | Document Intake |
| `text_extraction` | Extracting Text |
| `initial_classification` | Classifying |
| `entity_extraction` | Extracting Entities (8 specialists) |
| `hitl_checkpoint` | Awaiting Review |
| `storage` | Storing Results |

Thinking badges: 🧠 = AI in thinking/reasoning phase, ✍️ = AI writing phase. Both may appear on active stages.

## API Endpoints
```
POST /agents/legal-department/invoke  (multipart with files)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
GET  /agents/legal-department/jobs/:id
POST /agents/legal-department/jobs/:id/review
GET  /agents/legal-department/jobs/:id/stream
```
