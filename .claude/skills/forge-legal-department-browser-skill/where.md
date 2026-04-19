# Legal Department — Where Everything Is

## Navigation Path

```
http://localhost:6201
  → ForgeShellPage (OaiAppShell sidebar)
    → Sidebar: "Legal Department" → /app/agents/legal-department
      → LegalDepartmentWorkspace.vue
        → Sub-nav items:
          Document Onboarding  → /app/agents/legal-department/document-onboarding
          Contract Review      → /app/agents/legal-department/contract-review
          Legal Research       → /app/agents/legal-department/legal-research
          Due Diligence Room   → /app/agents/legal-department/due-diligence
          Brief Stress Test    → /app/agents/legal-department/adversarial-brief
          Compliance Audit     → /app/agents/legal-department/compliance-audit
          Trial Simulator      → /app/agents/legal-department/monte-carlo
          Case Team            → /app/agents/legal-department/matters
          Settings             → /app/agents/legal-department/settings
```

## Document Onboarding Page

**Route**: `/app/agents/legal-department/document-onboarding`
**Component**: `DocumentOnboardingPage.vue`

**Job submission — OnboardDocumentModal.vue**:
- Triggered by a button on the page (look for "Upload Document", "New Job", or "+" button)
- File input: drag & drop zone or file picker
- Accepted formats: `.txt`, `.md`, `.json`, `.csv`, `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`
- Max: 10 files per submission
- Submit button label: "Queue Job"
- On success: modal closes, emits `queued` with `{ jobId, conversationId }`

**Job list**: `JobActivityList.vue` on the same page
- Filter tabs: "Mine" / "All"
- Status badges: queued (gray) / processing (blue) / awaiting_review (yellow) / completed (green) / failed (red)
- Real-time ticker: `InRowTicker.vue` shows stage name for processing jobs

## Contract Review Page

**Route**: `/app/agents/legal-department/contract-review`
**Component**: `ContractReviewPage.vue`

**Job submission**: accepts text input or references an onboarded document
**Triggers HITL**: yes — contract review always passes through `hitl-checkpoint` node
**HITL modal**: `LegalJobReviewModal.vue` → `DocumentAnalysisReviewSection.vue`
**Review decision**: approve (job completes) or reject (job enters `review_rejected`)

## Legal Research Page

**Route**: `/app/agents/legal-department/legal-research`
**Component**: `LegalResearchPage.vue`

**Job submission**: text query input
**HITL**: yes → `LegalResearchReviewSection.vue`

## Due Diligence Page

**Route**: `/app/agents/legal-department/due-diligence`
**Component**: `DueDiligenceRoomPage.vue`

**Job submission**: references onboarded documents + deal parameters
**HITL**: yes → `DealMemoReviewSection.vue`

## Discovery Review Page

**Route**: `/app/agents/legal-department/discovery-review`
**Component**: `DiscoveryReviewPage.vue`

**HITL modal**: `BatchReviewPanel.vue` — shows batch of documents for coding (relevant/privileged/produced)

## Stage Progress — StageLadder

**Component**: `StageLadder.vue`
**Location on page**: appears while a job is processing, typically in the main content area or a panel

**Stage icons**:
- ○ pending
- ⟳ active (spinning or highlighted)
- ✓ done
- ✗ failed
- — skipped

**Thinking badges**: 🧠 reasoning / ✍️ writing — appear on active stages when extended thinking is on

**DOM selectors to try** (may vary):
```javascript
// Stage items
document.querySelectorAll('[data-stage]')
document.querySelectorAll('.stage-item')
document.querySelectorAll('.stage-ladder .stage')
// Active stage
document.querySelector('.stage-item.active')
document.querySelector('[data-state="active"]')
```

## HITL Review Modal

**Component**: `LegalJobReviewModal.vue`
**Triggered when**: job status reaches `awaiting_review`
**Opens as**: modal overlay on the current page
**URL change**: modal state stored in query param `?jobId={id}` (via `useJobModalRoute.ts`)

**Finding the modal**:
```javascript
document.querySelector('[role="dialog"]')
document.querySelector('.modal')
document.querySelector('.review-modal')
```

**Approve button**: look for "Approve", "Accept", "Submit Review" text
**Reject button**: look for "Reject", "Request Changes" text

**Do not click** any button labeled "Delete" or similar inside the modal — it may trigger a confirmation dialog.

## Job History List

**Component**: `JobActivityList.vue`
**Appears on**: every workflow page (sidebar panel or main area)

**Finding job rows**:
```javascript
document.querySelectorAll('[data-job-id]')
document.querySelectorAll('.job-row')
document.querySelectorAll('.activity-item')
```

**Finding status badge**:
```javascript
document.querySelector('[data-job-id="{id}"] [data-status]')
```

## SSE Stream Endpoint

The web connects to the API SSE stream. Look in the network tab for:
- URL pattern: `GET /invoke/stream/{jobId}` or `GET /legal/jobs/{jobId}/stream`
- `Content-Type: text/event-stream` in response headers
- Connection stays open while job is processing

## Settings Page

**Route**: `/app/agents/legal-department/settings`
**Component**: `LegalSettingsPage.vue`
**Purpose**: per-capability model configuration (not tested in routine browser runs)
