# Persistent Case Team (Matters) — Where Everything Is

## Navigation
- Matter list: `http://localhost:6201/app/agents/legal-department/matters`
- Matter dashboard: `http://localhost:6201/app/agents/legal-department/matters/:matterId`
- Sidebar: Legal Department → Matters (or Persistent Case Team)

## Creating a Matter

**Modal**: `CreateMatterModal`

Form fields:
- **Matter Name** input — required
- **Client Name** input — required
- **Matter Type** select — litigation / transactional / regulatory / advisory / other
- **Jurisdiction** input — the governing jurisdiction
- **Description** textarea — optional context
- **Button**: "Create Matter"

After creation, matter appears in `MatterListPage` list. Click to open `MatterDashboard`.

## Matter Dashboard

**Route**: `/app/agents/legal-department/matters/:matterId`
**Component**: `MatterDashboard`

**Stats bar** at top:
- Document count | Entity count | Timeline event count | Pending job count

**Tabs**:
- **Case Overview** (via `CaseOverviewTab`) — entities list, timeline events, key facts
- **Documents** (via `DocumentsTab`) — document list with classification, status, upload new docs

## Adding Documents to a Matter

From the Documents tab: upload new files. This triggers Facts Agent + Documents Agent to run in parallel.

Document processing status shows in the job list. Both agents must complete before entities/timeline update.

## Accessing Sub-Workflows

From the **Documents tab**:
- Find a witness entity or document row
- Look for "Prepare for Deposition" or similar action button → opens `PrepDepositionModal`

## SSE / Polling

The Matter Dashboard uses 5-second polling (not SSE) to refresh status. No live SSE stream for matter updates.

## API Endpoints
```
POST /agents/legal-department/matters  (create matter)
GET  /agents/legal-department/matters  (list matters)
GET  /agents/legal-department/matters/:matterId  (get matter with jobs/entities/docs)
POST /agents/legal-department/matters/:matterId/documents  (upload documents)
```
