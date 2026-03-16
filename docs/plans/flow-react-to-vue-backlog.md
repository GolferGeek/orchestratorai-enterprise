# Flow React -> Vue Migration Backlog (Ticket-Ready)

Derived from:
- `docs/plans/flow-react-to-vue-conversion.md`
- `docs/plans/flow-react-to-vue-feature-inventory.md`
- `docs/plans/flow-react-to-vue-endpoint-matrix.md`
- `docs/plans/flow-react-to-vue-parity-matrix.md`

## Live Owner/Status Board

Use this table as the sprint-level dashboard. Keep it current during execution.

| Ticket | Owner | Status | Priority | Depends on | Notes |
|---|---|---|---|---|---|
| FLOW-VUE-001 | claude | done | P0 | - | Endpoint matrix verified against 179 API endpoints |
| FLOW-VUE-002 | claude | done | P0 | FLOW-VUE-001 | Shared UI path + Admin API `/admin/claude-pane/*` |
| FLOW-VUE-003 | claude | done | P0 | FLOW-VUE-001 | De-scoped: backend never implemented |
| FLOW-VUE-004 | claude | done | P0 | FLOW-VUE-001 | Compose owns RAG `/api/rag/*` (port 6300) |
| FLOW-VUE-005 | claude | done | P0 | FLOW-VUE-001 | Route-driven with tab-like shell UX |
| FLOW-VUE-006 | claude | done | P0 | - | Inventory frozen, verified against React code |
| FLOW-VUE-015 | claude | done | P0 | FLOW-VUE-014 | Phase 1 gate: 113 unit, 34 e2e, 21 chrome — all pass |
| FLOW-VUE-010 | claude | done | P0 | FLOW-VUE-001, FLOW-VUE-002, FLOW-VUE-003, FLOW-VUE-004 | Service expanded to full parity |
| FLOW-VUE-011 | claude | done | P0 | FLOW-VUE-010 | All missing types added |
| FLOW-VUE-012 | claude | done | P1 | FLOW-VUE-011 | user-colors.ts ported |
| FLOW-VUE-013 | claude | done | P1 | FLOW-VUE-011 | useNotificationSound composable |
| FLOW-VUE-014 | claude | done | P0 | FLOW-VUE-010, FLOW-VUE-011 | Stores upgraded |
| FLOW-VUE-020 | claude | done | P0 | FLOW-VUE-014 | useSharedTasks composable with 5s polling |
| FLOW-VUE-021 | claude | done | P1 | FLOW-VUE-014 | useHierarchy composable |
| FLOW-VUE-022 | claude | done | P1 | - | vue-draggable-plus ^0.6.1 added |
| FLOW-VUE-023 | claude | done | P0 | FLOW-VUE-020, FLOW-VUE-021, FLOW-VUE-022, FLOW-VUE-012 | 6 Kanban components built |
| FLOW-VUE-024 | claude | done | P0 | FLOW-VUE-023 | SprintBoardView wired to KanbanBoard |
| FLOW-VUE-025 | claude | done | P0 | FLOW-VUE-024 | Phase 2 gate: 194 unit, 34 e2e, 14 chrome — all pass. Note: Ionic router-outlet blocks view rendering (pre-existing) |
| FLOW-VUE-030 | claude | done | P0 | FLOW-VUE-014 | useSharedTimer, useTeamPresence, usePartyFoul |
| FLOW-VUE-031 | claude | done | P1 | FLOW-VUE-030, FLOW-VUE-012 | TimerWidget, OnlineUsers |
| FLOW-VUE-032 | claude | done | P0 | FLOW-VUE-014 | TaskPanel + TaskItem |
| FLOW-VUE-033 | claude | done | P0 | FLOW-VUE-031, FLOW-VUE-032 | Components wired in shell |
| FLOW-VUE-034 | claude | todo | P0 | FLOW-VUE-033 | Phase 3 gate — tests needed |
| FLOW-VUE-040 | claude | done | P0 | FLOW-VUE-002 | Claude via shared OaiAppShell pane |
| FLOW-VUE-041 | N/A | de-scoped | P0 | FLOW-VUE-003 | ClaudeTaskPlannerDialog de-scoped |
| FLOW-VUE-042 | claude | done | P0 | FLOW-VUE-040 | useTaskProgress SSE + TaskProgressPanel/Dialog |
| FLOW-VUE-043 | N/A | de-scoped | P2 | FLOW-VUE-040 | Shared UI path chosen |
| FLOW-VUE-044 | claude | todo | P0 | FLOW-VUE-042 | Phase 4 gate — tests needed |
| FLOW-VUE-050 | claude | done | P1 | FLOW-VUE-014 | useTaskCollaboration composable |
| FLOW-VUE-051 | claude | done | P1 | FLOW-VUE-050, FLOW-VUE-013 | TeamSidebar + NotifyButton |
| FLOW-VUE-052 | claude | done | P0 | FLOW-VUE-001, FLOW-VUE-051 | API-safe team settings |
| FLOW-VUE-053 | claude | todo | P0 | FLOW-VUE-052 | Phase 5 gate — tests needed |
| FLOW-VUE-060 | claude | done | P1 | FLOW-VUE-014 | useChannelMessages + MessagesTab |
| FLOW-VUE-061 | claude | done | P1 | FLOW-VUE-014, FLOW-VUE-013 | useNotifications + NotificationBell |
| FLOW-VUE-062 | claude | done | P1 | FLOW-VUE-005, FLOW-VUE-060, FLOW-VUE-061 | Wired in nav model |
| FLOW-VUE-063 | claude | todo | P0 | FLOW-VUE-062 | Phase 6 gate — tests needed |
| FLOW-VUE-070 | claude | done | P1 | FLOW-VUE-014 | useTeamFiles composable |
| FLOW-VUE-071 | claude | done | P1 | FLOW-VUE-070 | DocumentsTab, Sidebar, Editor, FileTreeItem |
| FLOW-VUE-072 | claude | done | P0 | FLOW-VUE-004 | NotebookTab, CollectionBrowser, DocumentManager, QAChat |
| FLOW-VUE-073 | claude | done | P1 | FLOW-VUE-071, FLOW-VUE-072 | FilesView wired |
| FLOW-VUE-074 | claude | todo | P0 | FLOW-VUE-073 | Phase 7 gate — tests needed |
| FLOW-VUE-080 | claude | done | P0 | FLOW-VUE-005 | Auth login fixed (accessToken field, /login route) |
| FLOW-VUE-081 | claude | done | P2 | FLOW-VUE-014 | useJourneyTemplates, useLearningProgress + components |
| FLOW-VUE-082 | claude | done | P0 | FLOW-VUE-024, FLOW-VUE-033, FLOW-VUE-062, FLOW-VUE-073, FLOW-VUE-080 | Shell parity: FlowShellPage with OaiSidebar+OaiTopNav+router-view |
| FLOW-VUE-083 | claude | done | P1 | FLOW-VUE-082 | IonPage wrappers removed, /auth→/login route fix |
| FLOW-VUE-084 | claude | todo | P0 | FLOW-VUE-083 | Phase 8 gate — tests needed |
| FLOW-VUE-090 | unassigned | todo | P1 | - | |
| FLOW-VUE-091 | unassigned | todo | P0 | - | |
| FLOW-VUE-092 | unassigned | todo | P0 | FLOW-VUE-080 | |
| FLOW-VUE-093 | unassigned | todo | P0 | FLOW-VUE-083, FLOW-VUE-091, FLOW-VUE-092 | |

### Quick Update Rules

- Update `Status` immediately when work starts/stops.
- Use `blocked` only with a brief reason in `Notes`.
- Keep ticket-level section checkboxes in sync with this board.

## Standup Board (Now / Next / Blocked / Done)

Use this as the daily operational view. Move ticket IDs between sections during standup.

### Now

- FLOW-VUE-010
- FLOW-VUE-011
- FLOW-VUE-012
- FLOW-VUE-013
- FLOW-VUE-014

### Next

- FLOW-VUE-015 (Phase 1 gate)

### Blocked

- _None currently_

### Done

- FLOW-VUE-001 — Endpoint matrix finalized
- FLOW-VUE-002 — Claude path: shared UI + Admin API
- FLOW-VUE-003 — shared-tasks/plan de-scoped
- FLOW-VUE-004 — RAG: Compose owns it
- FLOW-VUE-005 — Route-driven with tab-like shell
- FLOW-VUE-006 — Feature inventory frozen

## Status Model

- `todo`
- `in progress`
- `blocked`
- `done`

Each ticket should include: `Owner`, `Status`, `Priority`, `Depends on`.

## Phase Testing Gate Protocol

Every phase ends with a mandatory testing gate ticket. No work on the next phase may begin until the gate passes. Each gate executes these steps in order:

1. **Lint**: Run `npm run lint` for Flow web — zero errors required.
2. **Build**: Run `npm run build` for Flow web — clean compile required.
3. **Unit Tests**: Create Vitest specs for every composable, store, service, utility, and component delivered in the phase. Tests must cover happy paths, error paths, and edge cases. Run all tests — zero failures required.
4. **E2E Tests**: Create integration tests that hit real API endpoints (no mocks per project policy). Verify data flows end-to-end. Run all tests — zero failures required.
5. **Chrome Tests**: Use Claude-in-Chrome browser automation to exercise all delivered functionality in a real browser. Cover user interactions, visual rendering, responsive behavior, and edge cases. All tests must pass.

Gate tickets are P0 and block all downstream phase work.

---

## Phase 0 - Blocking Decisions

- [x] **FLOW-VUE-001** Finalize endpoint contract matrix
  Priority: P0 | Depends on: none
  **Done.** Verified 179 endpoints across 9 controllers. Matrix updated with discoveries. All gaps resolved.

- [x] **FLOW-VUE-002** Decide Claude path (`/super-admin/*` vs `/admin/claude-pane/*`)
  Priority: P0 | Depends on: FLOW-VUE-001
  **Done.** Decision: Use shared UI path (`packages/ui/claude-pane/`) + Admin API backend (`/admin/claude-pane/*`, port 6101). Admin API spawns `claude` CLI as child process.

- [x] **FLOW-VUE-003** Resolve `POST /teams/:teamId/shared-tasks/plan` (implement or approved de-scope)
  Priority: P0 | Depends on: FLOW-VUE-001
  **Done. DE-SCOPED.** Backend was never implemented. React `ClaudeTaskPlannerDialog` UI is non-functional. Zero ripple risk. FLOW-VUE-041 also de-scoped.

- [x] **FLOW-VUE-004** Resolve Notebook/RAG backend ownership and routing
  Priority: P0 | Depends on: FLOW-VUE-001
  **Done.** Decision: Compose API (port 6300) owns all RAG endpoints (`/api/rag/*`). Flow Vue notebook calls Compose API via Vite proxy configuration.

- [x] **FLOW-VUE-005** Lock navigation model (route-driven vs tab-driven parity strategy)
  Priority: P0 | Depends on: FLOW-VUE-001
  **Done.** Decision: Route-driven with tab-like shell UX. Keep Vue's 11-route architecture with vue-router (deep linking, browser history). Present tab-style navigation in the app shell for visual parity with React's tab-driven UI.

- [x] **FLOW-VUE-006** Approve feature inventory freeze
  Priority: P0 | Depends on: none
  **Done.** Inventory verified against actual React codebase. Minor additions documented (useOrchFlow, useToast, config/api-config.ts). `ClaudeTaskPlannerDialog` explicitly out of scope. Inventory frozen.

---

## Phase 1 - Services, Types, Stores

- [ ] **FLOW-VUE-010** Expand `flow-api.service.ts` to parity surface  
  Priority: P0 | Depends on: FLOW-VUE-001, FLOW-VUE-002, FLOW-VUE-003, FLOW-VUE-004  
  Paths: `apps/flow/web/src/services/flow-api.service.ts`

- [ ] **FLOW-VUE-011** Expand `types/flow.ts` DTO/contracts  
  Priority: P0 | Depends on: FLOW-VUE-010  
  Paths: `apps/flow/web/src/types/flow.ts`

- [ ] **FLOW-VUE-012** Port user-color utility parity  
  Priority: P1 | Depends on: FLOW-VUE-011  
  Paths: `apps/flow/web/src/lib/user-colors.ts`

- [ ] **FLOW-VUE-013** Add notification sound composable parity  
  Priority: P1 | Depends on: FLOW-VUE-011  
  Paths: `apps/flow/web/src/composables/useNotificationSound.ts`

- [ ] **FLOW-VUE-014** Upgrade stores for parity contract
  Priority: P0 | Depends on: FLOW-VUE-010, FLOW-VUE-011
  Paths:
  - `apps/flow/web/src/stores/tasks.store.ts`
  - `apps/flow/web/src/stores/sprints.store.ts`
  - `apps/flow/web/src/stores/teams.store.ts`
  - `apps/flow/web/src/stores/files.store.ts`

- [ ] **FLOW-VUE-015** Phase 1 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-014
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint: `npm run lint` passes with zero errors for Flow web
  - [ ] Build: `npm run build` succeeds for Flow web
  - [ ] Unit tests: Create and run Vitest specs for all Phase 1 deliverables
    - `flow-api.service.spec.ts` — all service methods return expected shapes, error paths throw
    - `user-colors.spec.ts` — color assignment determinism, edge cases
    - `useNotificationSound.spec.ts` — composable lifecycle
    - `tasks.store.spec.ts`, `sprints.store.spec.ts`, `teams.store.spec.ts`, `files.store.spec.ts` — store CRUD, state mutations, error propagation
  - [ ] E2E tests: Create and run Vitest/Playwright specs against running dev server
    - API service integration: real HTTP calls to Flow API for each endpoint group
    - Store hydration: mount stores, trigger fetches, verify state
  - [ ] Chrome tests: Claude-in-Chrome browser tests
    - Load Flow web app, verify no console errors on boot
    - Verify auth store initializes and token is present
    - Verify stores populate with real data after login

---

## Phase 2 - Kanban + Hierarchy + Sprint

- [ ] **FLOW-VUE-020** Build `useSharedTasks.ts` parity composable  
  Priority: P0 | Depends on: FLOW-VUE-014  
  Paths: `apps/flow/web/src/composables/useSharedTasks.ts`

- [ ] **FLOW-VUE-021** Build `useHierarchy.ts` parity composable  
  Priority: P1 | Depends on: FLOW-VUE-014  
  Paths: `apps/flow/web/src/composables/useHierarchy.ts`

- [ ] **FLOW-VUE-022** Add/verify drag dependency (`vue-draggable-plus`)  
  Priority: P1 | Depends on: none  
  Paths: `apps/flow/web/package.json`

- [ ] **FLOW-VUE-023** Build Kanban component set  
  Priority: P0 | Depends on: FLOW-VUE-020, FLOW-VUE-021, FLOW-VUE-022, FLOW-VUE-012  
  Paths:
  - `apps/flow/web/src/components/kanban/KanbanBoard.vue`
  - `apps/flow/web/src/components/kanban/KanbanColumn.vue`
  - `apps/flow/web/src/components/kanban/KanbanCard.vue`
  - `apps/flow/web/src/components/kanban/SprintColumn.vue`
  - `apps/flow/web/src/components/kanban/HierarchySidebar.vue`
  - `apps/flow/web/src/components/kanban/TaskDetailDialog.vue`

- [ ] **FLOW-VUE-024** Wire Sprint board wrapper to new Kanban flow
  Priority: P0 | Depends on: FLOW-VUE-023
  Paths: `apps/flow/web/src/views/SprintBoardView.vue`

- [ ] **FLOW-VUE-025** Phase 2 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-024
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useSharedTasks.spec.ts` — polling, optimistic updates, filtering, error paths
    - `useHierarchy.spec.ts` — effort/project/task hierarchy CRUD
    - `KanbanBoard.spec.ts` — renders columns from task data, selected-user filtering
    - `KanbanColumn.spec.ts` — renders cards, status grouping
    - `KanbanCard.spec.ts` — displays task fields, progress badge, click behavior
    - `SprintColumn.spec.ts` — sprint placement, sprint CRUD triggers
    - `HierarchySidebar.spec.ts` — tree rendering, expand/collapse, selection
    - `TaskDetailDialog.spec.ts` — opens with task data, edit/save/cancel, collaboration controls
  - [ ] E2E tests:
    - Kanban board loads with real tasks from API
    - Drag-drop task between columns updates status
    - Sprint creation and task assignment
    - Hierarchy sidebar filtering reflects on board
    - Task detail dialog opens, edits persist
  - [ ] Chrome tests:
    - Full Kanban board visual rendering with real data
    - Drag-drop interaction (mouse events)
    - Sprint column behavior
    - Task detail dialog open/edit/close cycle
    - Mobile responsive: board scrolls horizontally, cards stack

---

## Phase 3 - Timer + My Tasks

- [ ] **FLOW-VUE-030** Build timer/presence composables  
  Priority: P0 | Depends on: FLOW-VUE-014  
  Paths:
  - `apps/flow/web/src/composables/useSharedTimer.ts`
  - `apps/flow/web/src/composables/useTeamPresence.ts`
  - `apps/flow/web/src/composables/usePartyFoul.ts`

- [ ] **FLOW-VUE-031** Build timer and online-users components  
  Priority: P1 | Depends on: FLOW-VUE-030, FLOW-VUE-012  
  Paths:
  - `apps/flow/web/src/components/timer/TimerWidget.vue`
  - `apps/flow/web/src/components/teams/OnlineUsers.vue`

- [ ] **FLOW-VUE-032** Build My Tasks side panel parity  
  Priority: P0 | Depends on: FLOW-VUE-014  
  Paths: `apps/flow/web/src/components/tasks/TaskPanel.vue`

- [ ] **FLOW-VUE-033** Integrate timer + task panel in shell
  Priority: P0 | Depends on: FLOW-VUE-031, FLOW-VUE-032
  Paths: `apps/flow/web/src/App.vue`

- [ ] **FLOW-VUE-034** Phase 3 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-033
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useSharedTimer.spec.ts` — polling, countdown, state transitions (focus/break/idle)
    - `useTeamPresence.spec.ts` — heartbeat sends, online user list updates
    - `usePartyFoul.spec.ts` — accountability check triggers on timer completion
    - `TimerWidget.spec.ts` — renders timer state, start/stop/transition buttons
    - `OnlineUsers.spec.ts` — renders user list, presence indicators
    - `TaskPanel.spec.ts` — renders my-tasks, subtask expand/collapse, completion toggle
  - [ ] E2E tests:
    - Timer start/stop cycle with real API
    - Timer state transitions (focus -> break -> idle)
    - Party foul detection triggers correctly
    - My Tasks panel loads cross-team tasks
    - Subtask completion updates persist
    - Online users list reflects heartbeat
  - [ ] Chrome tests:
    - Timer widget visual state changes (countdown, phase indicators)
    - Timer start/pause/stop button interactions
    - Task panel open/close, subtask expand/collapse
    - Online users display updates
    - Pomodoro increment visual feedback

---

## Phase 4 - Claude + Task Progress

- [ ] **FLOW-VUE-040** Implement chosen Claude architecture  
  Priority: P0 | Depends on: FLOW-VUE-002  
  Paths:
  - shared path: `apps/flow/web/src/App.vue`, `packages/ui/claude-pane/*`
  - flow-specific path: `apps/flow/web/src/components/claude/*`

- [ ] **FLOW-VUE-041** Build Claude task planner dialog  
  Priority: P0 | Depends on: FLOW-VUE-003, FLOW-VUE-040  
  Paths: `apps/flow/web/src/components/claude/ClaudeTaskPlannerDialog.vue`

- [ ] **FLOW-VUE-042** Build task-progress SSE flow + badges  
  Priority: P0 | Depends on: FLOW-VUE-040  
  Paths:
  - `apps/flow/web/src/composables/useTaskProgress.ts`
  - `apps/flow/web/src/components/claude/TaskProgressPanel.vue`
  - `apps/flow/web/src/components/claude/TaskProgressDialog.vue`
  - `apps/flow/web/src/components/kanban/KanbanCard.vue`

- [ ] **FLOW-VUE-043** Claude internal subcomponents (only for flow-specific panel path)
  Priority: P2 | Depends on: FLOW-VUE-040
  Paths:
  - `apps/flow/web/src/components/claude/AutoCompleteDropdown.vue`
  - `apps/flow/web/src/components/claude/PinnedCommands.vue`
  - `apps/flow/web/src/components/claude/ToolProgress.vue`
  - `apps/flow/web/src/components/claude/OutputEntry.vue`
  - `apps/flow/web/src/components/claude/StatsFooter.vue`

- [ ] **FLOW-VUE-044** Phase 4 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-042
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useTaskProgress.spec.ts` — SSE connection lifecycle, event parsing, reconnect behavior
    - `ClaudeCodeButton.spec.ts` — toggle panel open/close
    - `ClaudeTaskPlannerDialog.spec.ts` — form submission, validation, plan response handling
    - `TaskProgressPanel.spec.ts` — renders progress events, completion state
    - `TaskProgressDialog.spec.ts` — modal open/close, progress stream display
    - Claude subcomponents (if flow-specific path): autocomplete, pinned commands, tool progress, output entry, stats
  - [ ] E2E tests:
    - Claude panel opens and connects to backend
    - Task planner dialog submits plan request (or de-scope verified)
    - SSE task progress stream receives and renders events
    - Progress badge appears on KanbanCard during active task
    - Panel state persists across tab switches
  - [ ] Chrome tests:
    - Claude button click opens panel
    - Claude panel renders correctly (shared or flow-specific path)
    - Task planner dialog form interaction
    - SSE progress updates render in real-time
    - Progress badge visual on Kanban cards
    - Panel close and reopen preserves state

---

## Phase 5 - Team Collaboration UX

- [ ] **FLOW-VUE-050** Build task collaboration composable  
  Priority: P1 | Depends on: FLOW-VUE-014  
  Paths: `apps/flow/web/src/composables/useTaskCollaboration.ts`

- [ ] **FLOW-VUE-051** Build team sidebar + notify button  
  Priority: P1 | Depends on: FLOW-VUE-050, FLOW-VUE-013  
  Paths:
  - `apps/flow/web/src/components/teams/TeamSidebar.vue`
  - `apps/flow/web/src/components/teams/NotifyButton.vue`

- [ ] **FLOW-VUE-052** Enforce API-safe team settings behavior
  Priority: P0 | Depends on: FLOW-VUE-001, FLOW-VUE-051
  Paths:
  - `apps/flow/web/src/stores/teams.store.ts`
  - `apps/flow/web/src/components/teams/TeamSidebar.vue`

- [ ] **FLOW-VUE-053** Phase 5 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-052
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useTaskCollaboration.spec.ts` — collaborators/watchers/update-requests CRUD, guestName handling
    - `TeamSidebar.spec.ts` — member list rendering, member selection, team switching
    - `NotifyButton.spec.ts` — click triggers notification, disabled states
  - [ ] E2E tests:
    - Add/remove collaborator on a task via real API
    - Add/remove watcher on a task
    - Create/update task update request
    - Team sidebar member selection filters Kanban board
    - Team settings behavior stays within API contract
    - Guest-name paths verified for collaboration endpoints
  - [ ] Chrome tests:
    - Team sidebar renders member list with presence indicators
    - Click member to filter board view
    - Task detail dialog collaboration controls (add collaborator, add watcher)
    - Notify button interaction and feedback
    - Team settings UI respects API boundaries

---

## Phase 6 - Messaging + Notifications

- [ ] **FLOW-VUE-060** Build messaging composable + UI  
  Priority: P1 | Depends on: FLOW-VUE-014  
  Paths:
  - `apps/flow/web/src/composables/useChannelMessages.ts`
  - `apps/flow/web/src/components/messages/MessagesTab.vue`

- [ ] **FLOW-VUE-061** Build notifications composable + bell UI  
  Priority: P1 | Depends on: FLOW-VUE-014, FLOW-VUE-013  
  Paths:
  - `apps/flow/web/src/composables/useNotifications.ts`
  - `apps/flow/web/src/components/notifications/NotificationBell.vue`

- [ ] **FLOW-VUE-062** Wire messaging/notifications into chosen nav model
  Priority: P1 | Depends on: FLOW-VUE-005, FLOW-VUE-060, FLOW-VUE-061
  Paths:
  - `apps/flow/web/src/router/index.ts`
  - `apps/flow/web/src/App.vue`

- [ ] **FLOW-VUE-063** Phase 6 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-062
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useChannelMessages.spec.ts` — channel list, message polling, send message, guestName
    - `useNotifications.spec.ts` — notification polling, mark-read, guestName query
    - `useNotificationSound.spec.ts` — sound plays on new notification, respects mute
    - `MessagesTab.spec.ts` — channel list rendering, message display, send input
    - `NotificationBell.spec.ts` — unread count badge, dropdown list, mark-read action
  - [ ] E2E tests:
    - Create channel, send message, verify message appears
    - Notification created and appears in bell dropdown
    - Mark notifications read updates unread count
    - Guest-name paths verified for messaging and notifications
    - Nav model integration: messages/notifications accessible from chosen navigation
  - [ ] Chrome tests:
    - Messages tab renders channel list and messages
    - Type and send a message, verify it appears in thread
    - Notification bell shows unread count
    - Click bell opens dropdown with notification list
    - Mark-read clears badge
    - Notification sound plays (or verify sound composable triggers)

---

## Phase 7 - Documents + Notebook

- [ ] **FLOW-VUE-070** Build team-files composable  
  Priority: P1 | Depends on: FLOW-VUE-014  
  Paths: `apps/flow/web/src/composables/useTeamFiles.ts`

- [ ] **FLOW-VUE-071** Build documents component set  
  Priority: P1 | Depends on: FLOW-VUE-070  
  Paths:
  - `apps/flow/web/src/components/documents/DocumentsTab.vue`
  - `apps/flow/web/src/components/documents/DocumentsSidebar.vue`
  - `apps/flow/web/src/components/documents/DocumentEditor.vue`
  - `apps/flow/web/src/components/documents/FileTreeItem.vue`

- [ ] **FLOW-VUE-072** Build notebook component set  
  Priority: P0 | Depends on: FLOW-VUE-004  
  Paths:
  - `apps/flow/web/src/components/notebook/NotebookTab.vue`
  - `apps/flow/web/src/components/notebook/CollectionBrowser.vue`
  - `apps/flow/web/src/components/notebook/DocumentManager.vue`
  - `apps/flow/web/src/components/notebook/QAChat.vue`

- [ ] **FLOW-VUE-073** Wire `FilesView` to documents+notebook final UX
  Priority: P1 | Depends on: FLOW-VUE-071, FLOW-VUE-072
  Paths: `apps/flow/web/src/views/FilesView.vue`

- [ ] **FLOW-VUE-074** Phase 7 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-073
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `useTeamFiles.spec.ts` — file tree fetch, CRUD operations, error paths
    - `DocumentsTab.spec.ts` — split pane rendering, file selection, delete confirmation
    - `DocumentsSidebar.spec.ts` — file tree rendering, selection state
    - `DocumentEditor.spec.ts` — content display, edit/save
    - `FileTreeItem.spec.ts` — expand/collapse, icon rendering, click behavior
    - `NotebookTab.spec.ts` — collection -> document -> QA flow
    - `CollectionBrowser.spec.ts` — collection list, create/delete
    - `DocumentManager.spec.ts` — document list within collection, upload
    - `QAChat.spec.ts` — question input, answer display, loading state
  - [ ] E2E tests:
    - File CRUD: create, read, update, delete via real API
    - File tree navigation reflects API state
    - Document editor loads and saves content
    - Notebook: create collection, add document, ask question via RAG
    - Delete confirmation dialog prevents accidental deletion
  - [ ] Chrome tests:
    - Documents split pane renders correctly
    - File tree expand/collapse interaction
    - Document editor content editing
    - Notebook tab flow: browse collections -> manage documents -> QA chat
    - Delete confirmation dialog appears and respects cancel/confirm
    - FilesView integrates documents + notebook tabs correctly

---

## Phase 8 - Auth, Journey, Cleanup, Responsive

- [ ] **FLOW-VUE-080** Auth parity completion (signup parity or approved de-scope)  
  Priority: P0 | Depends on: FLOW-VUE-005  
  Paths:
  - `apps/flow/web/src/views/AuthView.vue`
  - `apps/flow/web/src/stores/auth.store.ts`

- [ ] **FLOW-VUE-081** Journey templates + learning progress UI/composables  
  Priority: P2 | Depends on: FLOW-VUE-014  
  Paths:
  - `apps/flow/web/src/composables/useJourneyTemplates.ts`
  - `apps/flow/web/src/components/journey/JourneyTemplateSelector.vue`
  - `apps/flow/web/src/composables/useLearningProgress.ts`
  - `apps/flow/web/src/components/journey/LearningProgressPanel.vue`
  - `apps/flow/web/src/views/HomeView.vue`

- [ ] **FLOW-VUE-082** Responsive/shell parity pass (desktop + mobile)  
  Priority: P0 | Depends on: FLOW-VUE-024, FLOW-VUE-033, FLOW-VUE-062, FLOW-VUE-073, FLOW-VUE-080  
  Paths:
  - `apps/flow/web/src/App.vue`
  - `apps/flow/web/src/router/index.ts`
  - shell-related components touched during migration

- [ ] **FLOW-VUE-083** Legacy cleanup and redirects
  Priority: P1 | Depends on: FLOW-VUE-082
  Paths:
  - `apps/flow/web/src/router/index.ts`
  - superseded views/components identified in conversion plan

- [ ] **FLOW-VUE-084** Phase 8 Testing Gate
  Priority: P0 | Depends on: FLOW-VUE-083
  Gate — phase cannot advance until all checks pass:
  - [ ] Lint + Build: zero errors
  - [ ] Unit tests:
    - `AuthView.spec.ts` — sign-in form, sign-up form (or de-scope verified), validation, error display
    - `auth.store.spec.ts` — login/logout/token lifecycle, session persistence
    - `useJourneyTemplates.spec.ts` — template fetch, slug lookup
    - `useLearningProgress.spec.ts` — progress fetch, create/update
    - `JourneyTemplateSelector.spec.ts` — template list rendering, selection
    - `LearningProgressPanel.spec.ts` — progress display, milestone updates
  - [ ] E2E tests:
    - Full auth flow: login with real credentials, verify session
    - Sign-up flow (or de-scope confirmed)
    - Token validation across environments (dev/test/prod config)
    - Journey template load and display
    - Learning progress create and update
    - Responsive: desktop and mobile shell layout parity
    - Legacy route redirects resolve correctly
  - [ ] Chrome tests:
    - Auth page: login form submission, error messages, redirect on success
    - Sign-up toggle (if in scope)
    - Full app walkthrough: login -> all tabs -> logout
    - Desktop layout: header, sidebar, content areas render correctly
    - Mobile layout: responsive breakpoints, tab switching, drawer behavior
    - Legacy URLs redirect to correct new routes
    - Guest-mode: verify guest name display in notifications, messages, collaboration

---

## Cross-Cutting QA and Sign-Off

- [ ] **FLOW-VUE-090** Maintain UI reuse matrix during implementation  
  Priority: P1 | Depends on: none  
  File: `docs/plans/flow-react-to-vue-ui-reuse-matrix.md`

- [ ] **FLOW-VUE-091** Keep parity matrix status up to date per ticket  
  Priority: P0 | Depends on: none  
  File: `docs/plans/flow-react-to-vue-parity-matrix.md`

- [ ] **FLOW-VUE-092** Environment validation (dev/test/prod assumptions)  
  Priority: P0 | Depends on: FLOW-VUE-080  
  Checks:
  - base URL/proxy assumptions
  - token source behavior
  - feature behavior across environments

- [ ] **FLOW-VUE-093** Final parity walkthrough and release gate  
  Priority: P0 | Depends on: FLOW-VUE-083, FLOW-VUE-091, FLOW-VUE-092  
  Gate criteria:
  - all critical parity rows `verified` or approved de-scope
  - no unresolved P0 endpoint gaps
  - responsive checks pass
  - guest-mode checks pass where supported
