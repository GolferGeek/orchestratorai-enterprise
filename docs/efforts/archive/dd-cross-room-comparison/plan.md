# DD Room: Cross-Room Comparison — Implementation Plan

**PRD**: [prd.md](prd.md)
**Created**: 2026-04-17
**Status**: In Progress

## Progress Tracker
- [x] Phase 1: Backend Comparison Endpoint
- [x] Phase 2: Frontend Route + Room Selector
- [x] Phase 3: Comparison Dashboard Panels
- [x] Phase 4: Export + Polish

---

## Phase 1: Backend Comparison Endpoint
**Status**: In Progress
**Objective**: Add `POST /legal-department/jobs/compare` with full validation, access control, parallel checkpoint loading, and data normalization returning `ComparisonResult`.

### Steps
- [x] 1.1 Add `ComparisonResult` type and supporting interfaces to `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.types.ts`. Import `RiskCategory`, `Severity` from `../workflows/due-diligence/due-diligence.types.ts`. Define `ComparisonRoomSummary`, `ComparisonDealBreaker`, `ComparisonMissingDocument`, and `ComparisonResult` per the PRD response shape.
- [x] 1.2 Add comparison extraction logic to `LegalJobsService` (`apps/forge/api/src/agents/legal-department/legal-department.service.ts`). New method `compareRooms(jobIds: string[], access: { allowedForUserId: string; isAdmin: boolean }, orgSlug: string)`:
  - Load each job row via `repository.findByIdForOrg()` — return 404 if any not found
  - Validate each row: `jobType === DD_JOB_TYPE`, `isAccessAllowed()` passes — return 404 if any fail (fail-closed)
  - Load graph states in parallel via `Promise.all(jobIds.map(id => graph.getState(...)))` using `getGraph(DD_JOB_TYPE)`
  - Extract per-room: deal context from `row.input.data.dealContext`, status/progress from row, risk summary from `riskMatrix.cells` (aggregate by category+severity), financial summary from `runningFindings` + `perDocumentOutputs` specialist outputs (extract `tabular.rows` key metrics), coverage from `documentIndex` / `documentsAnalyzed` / `documentsFailed` / `missingDocuments`
  - Flatten deal-breaker flags and missing documents across all rooms into top-level arrays
  - Return `ComparisonResult`
- [x] 1.3 Add `POST jobs/compare` route to `LegalJobsController` (`apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts`):
  - Accept body `{ context: ExecutionContext, jobIds: string[] }`
  - Validate `context` has `orgSlug`, `userId`
  - Validate `jobIds` is array with length 2–10 (return 400 otherwise)
  - Call `resolveAccess(ctx.userId, ctx.orgSlug)`
  - Delegate to `legalDepartmentService.compareRooms(jobIds, access, ctx.orgSlug)`
  - Return result with 200 OK
- [x] 1.4 Write unit tests in `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-compare.spec.ts`:
  - Test 400 for invalid jobIds (empty, length 1, length 11, not an array)
  - Test 404 for non-existent job
  - Test 404 for inaccessible room (access control enforcement)
  - Test 404 for non-DD job type
  - Test successful comparison with 2 rooms — verify response shape
  - Test successful comparison with rooms at different stages (completed + synthesizing) — verify partial data handled
  - Test financial summary extraction from specialist outputs with tabular data
  - Test rooms with no risk matrix return zero counts

### Quality Gate
Before moving to Phase 2, ALL of the following must pass:

- [x] **Lint**: `cd apps/forge/api && npm run lint`
- [x] **Build**: `cd apps/forge/api && npm run build`
- [x] **Unit Tests**: `cd apps/forge/api && npx jest --testPathPattern='legal-jobs-compare' --no-coverage`
- [x] **All Existing Tests**: `cd apps/forge/api && npx jest --testPathPattern='legal-department' --no-coverage` (no regressions)
- [ ] **Curl Tests**: Start Forge API (`npm run dev:forge:api`), then:
  ```bash
  # Successful comparison (replace IDs with real DD room job IDs)
  curl -s -X POST http://localhost:6200/legal-department/jobs/compare \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <token>' \
    -d '{"context":{"orgSlug":"<org>","userId":"<uid>","conversationId":"compare","agentSlug":"legal-department","agentType":"legal","provider":"ollama","model":"gemma4:e4b"},"jobIds":["<id1>","<id2>"]}' \
    | jq '.rooms | length'
  # Expected: 2 (or however many IDs provided)

  # 400 for single job ID
  curl -s -X POST http://localhost:6200/legal-department/jobs/compare \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <token>' \
    -d '{"context":{"orgSlug":"<org>","userId":"<uid>","conversationId":"c","agentSlug":"l","agentType":"l","provider":"o","model":"g"},"jobIds":["<id1>"]}' \
    -w '\n%{http_code}'
  # Expected: 400
  ```
- [ ] **Phase Review**: Compare implementation against Phase 1 objectives in the PRD
  - [ ] Endpoint accepts ExecutionContext + jobIds array (2–10)
  - [ ] Validation returns 400 for bad input, 404 for missing/inaccessible/non-DD rooms
  - [ ] Access control is fail-closed (no partial comparison, no info leakage)
  - [ ] Graph states loaded in parallel
  - [ ] Response matches `ComparisonResult` shape from PRD
  - [ ] No new tables, no LLM calls, no graph mutations (read-only)

---

## Phase 2: Frontend Route + Room Selector
**Status**: In Progress
**Objective**: Add the comparison route, page shell, room multi-selector, and service method so users can navigate to comparison and select rooms.

### Steps
- [x] 2.1 Add `compareRooms(orgSlug: string, jobIds: string[]): Promise<ComparisonResult>` to `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`. Define the `ComparisonResult` interface on the frontend (mirroring the backend type). POST to `${FORGE_API_URL}/legal-department/jobs/compare` with context from auth store + jobIds.
- [x] 2.2 Add route to `apps/forge/web/src/router/index.ts`:
  ```
  path: 'agents/legal-department/compare'
  component: () => import('../views/agents/legal-department/CrossRoomComparisonPage.vue')
  name: 'LegalDDComparison'
  ```
  Place after the `due-diligence` route and before the `dd/:parentJobId/memo/:memoJobId` route.
- [x] 2.3 Create `apps/forge/web/src/views/agents/legal-department/CrossRoomComparisonPage.vue`:
  - Room selector as initial state: fetch DD rooms via existing `listJobs(orgSlug, callerUserId, 'due-diligence')`, display multi-select list showing targetCompany (from `input.data.dealContext.targetCompany`), status badge, document count, creation date
  - Checkbox selection limited to 2–10 rooms, "Compare" button disabled until ≥2 selected
  - On "Compare" click: call `compareRooms()`, show loading spinner, transition to dashboard view
  - Dashboard view (4 panel placeholders for Phase 3): pass `ComparisonResult` to child components
  - "Back to Rooms" navigation link
- [x] 2.4 Add "Compare Rooms" button to `DueDiligenceRoomPage.vue` (`apps/forge/web/src/views/agents/legal-department/DueDiligenceRoomPage.vue`) that navigates to `/agents/legal-department/compare` using `router.push`. Place near the room list header alongside existing action buttons.
- [x] 2.5 Add navigation entry in `LegalDepartmentWorkspace.vue` if it has a sidebar/menu linking to DD sub-pages, so "Compare Rooms" appears in the workspace navigation.

### Quality Gate
Before moving to Phase 3, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/web && npm run lint`
- [ ] **Build**: `cd apps/forge/web && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test` (no regressions)
- [ ] **Chrome Tests** (start Forge API + Forge Web):
  - [ ] Navigate to `/agents/legal-department/due-diligence` → "Compare Rooms" button visible
  - [ ] Click "Compare Rooms" → navigates to `/agents/legal-department/compare`
  - [ ] Room selector lists DD rooms with target company name, status, document count, date
  - [ ] Cannot click "Compare" with 0 or 1 room selected
  - [ ] Select 2 rooms → "Compare" button enabled → click → loading state shown → comparison result received (panels show placeholder content)
  - [ ] Back navigation works
- [ ] **Phase Review**: Compare implementation against Phase 2 objectives in the PRD
  - [ ] Route registered and accessible
  - [ ] Room selector uses existing `GET /legal-department/jobs` endpoint filtered to DD rooms
  - [ ] 2–10 selection limit enforced in UI
  - [ ] Service method calls `POST /legal-department/jobs/compare` with ExecutionContext
  - [ ] Loading state during API call

---

## Phase 3: Comparison Dashboard Panels
**Status**: In Progress
**Objective**: Build the four comparison panels (risk heat map, deal-breakers, financial comparison, coverage & status) that display the ComparisonResult data.

### Steps
- [x] 3.1 Create `ComparisonRiskHeatMap.vue` in `apps/forge/web/src/views/agents/legal-department/components/`:
  - Props: `rooms` array from ComparisonResult
  - Table: rooms as columns, 7 risk categories as rows
  - Each cell: finding count with background colored by highest severity (critical=red `#ef4444`, high=orange `#f97316`, medium=yellow `#eab308`, low=green `#22c55e`, zero=neutral/gray)
  - Header row: target company name + deal-breaker badge count (red badge if > 0)
  - Footer row: total findings by severity per room
  - Use CSS grid or HTML table with Ionic styling
- [x] 3.2 Create `ComparisonDealBreakers.vue`:
  - Props: `dealBreakers` array + `rooms` array from ComparisonResult
  - Flat list grouped by room (target company)
  - Each entry: finding text, category badge (Ionic chip/badge), recommendation text
  - Sort controls: by room (default) or by category
  - Green checkmark indicator for rooms with zero deal-breakers
- [x] 3.3 Create `ComparisonFinancials.vue`:
  - Props: `rooms` array from ComparisonResult
  - Table: rooms as columns, financial specialist metrics as rows
  - Group rows by specialist key: `cap-table`, `working-capital`, `debt-schedule`, `revenue-concentration`, `financial-statements`
  - Display `keyMetrics[].label` as row headers, `keyMetrics[].value` in cells
  - Color-code cells by `overallRisk` severity using same color palette as heat map
  - Show "N/A" for rooms missing a specialist (no fallbacks)
- [x] 3.4 Create `ComparisonCoverage.vue`:
  - Props: `rooms` array + `missingDocuments` array from ComparisonResult
  - Per-room row/card: document count, analyzed/failed/pending/missing breakdown
  - Stacked bar chart using Chart.js (`chart.js` v4.5 already in package.json): one bar per room, segments for analyzed (green), pending (yellow), failed (red), missing (gray)
  - Import `Chart` from `chart.js/auto`, use `<canvas>` element, register required components
  - Red indicator for rooms with critical missing documents
  - Status badge, progress %, completed-at timestamp per room
  - Missing documents list below chart, grouped by room
- [x] 3.5 Wire all 4 components into `CrossRoomComparisonPage.vue`:
  - Replace Phase 2 placeholder panels with real components
  - Pass appropriate props from ComparisonResult
  - Tab or accordion layout for the 4 panels (use Ionic `ion-segment` or vertical stack)
  - Handle empty states: no risk data, no deal-breakers, no financial data, no documents

### Quality Gate
Before moving to Phase 4, ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/web && npm run lint`
- [ ] **Build**: `cd apps/forge/web && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test` (no regressions)
- [ ] **Chrome Tests** (with Forge API + Web running, real DD rooms in database):
  - [ ] Select 2+ rooms and compare → risk heat map renders with severity colors, category rows, deal-breaker badges
  - [ ] Deal-breaker panel shows grouped list, sorting by room and by category both work
  - [ ] Financial panel shows specialist metrics in columns, "N/A" for missing data, severity coloring
  - [ ] Coverage panel shows stacked bar chart with Chart.js, document breakdown, missing documents list
  - [ ] Compare rooms at different completion stages — incomplete rooms show partial data without errors
  - [ ] Compare 2 rooms → 2 columns; compare 5 rooms → 5 columns (layout scales)
- [ ] **Phase Review**: Compare implementation against Phase 3 objectives in the PRD
  - [ ] Risk heat map: 7 categories × N rooms, severity coloring, deal-breaker badges
  - [ ] Deal-breaker summary: grouped by room, sortable, shows finding + category + recommendation
  - [ ] Financial comparison: specialist metrics side-by-side, risk coloring, "N/A" for missing
  - [ ] Coverage & status: Chart.js bar chart, document breakdown, status/progress/timestamps
  - [ ] No fallback data, no LLM calls, read-only rendering

---

## Phase 4: Export + Polish
**Status**: In Progress
**Objective**: Add markdown export, empty state handling, and responsive layout polish.

### Steps
- [x] 4.1 Add export logic to `CrossRoomComparisonPage.vue` or a composable:
  - "Export Comparison" button generates a markdown string with sections:
    - Header: comparison date, rooms compared (target companies)
    - Risk Heat Map: markdown table with categories × rooms
    - Deal-Breaker Summary: markdown list grouped by room
    - Financial Comparison: markdown table with specialist metrics × rooms
    - Coverage: markdown table with document stats per room + missing documents list
  - Upload markdown to media storage via `MEDIA_STORAGE_PROVIDER` (follow deal memo export pattern — check `DealMemoWorkspaceView.vue` or the deal-memo download endpoint for the artifact pattern)
  - Trigger download of the `.md` file
- [x] 4.2 Add empty state handling:
  - No rooms selected → show instruction text ("Select 2–10 DD rooms to compare")
  - All rooms incomplete (no synthesis yet) → show warning banner + partial data
  - Zero deal-breakers across all rooms → show green "No deal-breakers found" message in Panel 2
  - No financial specialist data → show "No financial analysis available" in Panel 3
  - Room selector empty (no DD rooms exist) → show "No DD rooms available" message
- [x] 4.3 Responsive layout for varying room counts:
  - 2–4 rooms: columns fit on screen, no horizontal scroll
  - 5–10 rooms: horizontal scroll on heat map and financial tables with sticky first column (category/metric labels)
  - Use `overflow-x: auto` with `position: sticky; left: 0` on the first column
- [x] 4.4 Final integration test: end-to-end flow from room selection through all 4 panels to export download

### Quality Gate
ALL of the following must pass:

- [ ] **Lint**: `cd apps/forge/web && npm run lint`
- [ ] **Build**: `cd apps/forge/web && npm run build`
- [ ] **Unit Tests**: `cd apps/forge/web && npm run test` (no regressions)
- [ ] **Backend Tests**: `cd apps/forge/api && npx jest --testPathPattern='legal-department' --no-coverage` (no regressions)
- [ ] **Chrome Tests**:
  - [ ] Export comparison of 3+ rooms → markdown downloads → open file → contains all 4 sections with real data
  - [ ] Empty state: no rooms → instruction message shown
  - [ ] Empty state: zero deal-breakers → green "no deal-breakers" message
  - [ ] Layout: compare 2 rooms → no horizontal scroll; compare 6+ rooms → horizontal scroll with sticky labels
  - [ ] Full flow: DD room list → "Compare Rooms" → select rooms → compare → browse all 4 panels → export → download
- [ ] **Phase Review**: Compare implementation against Phase 4 objectives in the PRD
  - [ ] Export generates markdown covering all 4 panels
  - [ ] Export uses artifact pattern (media storage upload + download)
  - [ ] Empty states handled gracefully
  - [ ] Responsive layout works for 2–10 rooms
  - [ ] No new dependencies added
  - [ ] No LLM calls, no graph mutations, no new database objects
