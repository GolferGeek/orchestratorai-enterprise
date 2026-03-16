# Flow: React to Vue 3 Conversion Plan (Parity-Strict)

## Context

Flow currently has:
- `apps/flow/web-react/` (React reference, full feature surface)
- `apps/flow/web/` (Vue 3 app, partial migration)

Goal: migrate **all user-visible functionality** from React to Vue while:
1. Keeping API and DB behavior consistent.
2. Reusing shared public UI from `@orchestratorai/ui` where applicable.
3. Avoiding hidden parity gaps (missing endpoint support, auth mismatches, route/layout regressions).

This plan is intentionally strict: parity means behavior, not just approximate UI.

---

## Non-Negotiable Rules

1. **API contract first, UI second.** No feature implementation until required backend endpoints are verified.
2. **No duplicate UI systems.** Prefer `@orchestratorai/ui` components before creating local equivalents.
3. **No silent scope drift.** If React has it (e.g., `TaskPanel`, signup flow), Vue must have it or have an explicit approved de-scope note.
4. **Parity measured by checklist, not LOC.** LOC is informational only.

---

## Phase 0: Contract + Architecture Alignment (Must Complete First)

### 0A) Endpoint Contract Matrix

Create `docs/plans/flow-react-to-vue-endpoint-matrix.md` mapping each React API call to:
- existing Flow API endpoint status (`exists`/`missing`),
- request/response shape parity,
- auth expectations,
- implementation owner.

Required validations:
- `POST /teams/:teamId/shared-tasks/plan` (currently referenced by React service; must exist or be implemented).
- Claude pane endpoints used by target Vue implementation.
- Notebook/RAG endpoints (`/api/rag/*`) target and ownership.
- Team settings capabilities (public/private/passcode) vs current Teams API support.

### 0B) Claude Integration Decision (Single Path)

Pick one path and document it:
- **Option A (preferred):** use shared `@orchestratorai/ui` `ClaudeCodePane` with endpoints compatible with `/admin/claude-pane/*`.
- **Option B:** keep Flow-specific Claude panel and `/super-admin/*` endpoints for Flow until backend is standardized.

Do not mix both.

### 0C) Notebook Backend Decision

Document and implement one authoritative backend for Notebook:
- If Flow API owns RAG, add and verify controllers/routes in `apps/flow/api`.
- If another product/API owns RAG, configure Flow web proxy/env to call that service explicitly.

### 0D) Layout Decision (Tab vs Route)

React uses one route (`/`) with internal tabs: `timer`, `kanban`, `messages`, `documents`, `notebook`.
Vue currently uses route-driven views.

Pick one and lock it:
- Keep route-driven architecture but match all behaviors, or
- move to tab-driven shell.

All downstream tasks assume this is settled.

### 0E) Feature Inventory Freeze (Source of Truth)

Create `docs/plans/flow-react-to-vue-feature-inventory.md` from current React app and lock it before implementation.
Inventory must include:
- all top-level screens/tabs,
- all major components,
- all hooks/composables,
- app-shell behaviors (desktop and mobile),
- guest-mode behaviors (where `guestName` is used).

Any React feature not listed here cannot be considered "accidentally omitted" later.

---

## Phase 1: Foundation Expansion (Services, Types, Stores)

### 1A) Service + Type Completeness

**Modify:** `apps/flow/web/src/services/flow-api.service.ts`  
Add missing methods that are contract-validated in Phase 0:
- Timer: `getTimerState`, `createTimerState`, `updateTimerState`, `getGlobalTimerState`, `createGlobalTimerState`, `updateGlobalTimerState`
- Collaboration: collaborators/watchers/update-requests CRUD
- Channels/messages CRUD
- Templates/learning progress
- Presence: `sendHeartbeat`, `getOnlineUsers`
- Personal tasks: `getMyTasks`
- Notifications create/read APIs
- Claude planner endpoint only if implemented in API contract

**Modify:** `apps/flow/web/src/types/flow.ts`  
Add missing DTOs/interfaces for all above.

### 1B) Shared Utilities for Parity

**New:** `apps/flow/web/src/lib/user-colors.ts`
- Port color assignment logic from React (`lib/userColors.ts`) for consistent avatar/card coloring.

**New:** `apps/flow/web/src/composables/useNotificationSound.ts`
- Shared notification sound handling (used by bell/notify flows).

---

## Phase 2: Core Work Surface (Kanban + Hierarchy + Sprint)

### 2A) Composables

**New:** `apps/flow/web/src/composables/useSharedTasks.ts`
- 5s polling, optimistic updates, status/sprint/assignment updates.
- include selected-user filtering behavior used by team sidebar/Kanban flow.

**New:** `apps/flow/web/src/composables/useHierarchy.ts`
- Effort -> Project -> Task hierarchy CRUD.

### 2B) Kanban Components

Install:
```json
"vue-draggable-plus": "^0.5.6"
```

New components:
- `components/kanban/KanbanBoard.vue`
- `components/kanban/KanbanColumn.vue`
- `components/kanban/KanbanCard.vue`
- `components/kanban/SprintColumn.vue`
- `components/kanban/HierarchySidebar.vue`
- `components/kanban/TaskDetailDialog.vue`

### 2C) View Wiring

Replace `views/SprintBoardView.vue` with thin orchestration wrapper around `KanbanBoard`.
Expand `tasks.store.ts` and `sprints.store.ts` for parity methods (status/placement/due-date/sprint operations).
Preserve current-user vs selected-user board behavior parity from React main flow.

---

## Phase 3: Timer Surface + My Tasks Panel

### 3A) Timer and Presence

New:
- `composables/useSharedTimer.ts`
- `components/timer/TimerWidget.vue`
- `composables/useTeamPresence.ts`
- `components/teams/OnlineUsers.vue`
- `composables/usePartyFoul.ts`

### 3B) My Tasks Parity (Missing in prior plan)

New:
- `components/tasks/TaskPanel.vue` (React parity with cross-team `getMyTasks` behavior)

Integrate with timer screen layout so timer + task panel match expected workflow.

---

## Phase 4: Claude + Task Progress

### 4A) Implement Chosen Claude Path (Phase 0 decision)

- If shared pane path chosen, configure through app shell and verified endpoint compatibility.
- If Flow-specific path chosen, migrate React Flow Claude components/composables into Vue equivalents.
- If Flow-specific path is chosen, include parity for internal panel pieces (`AutoCompleteDropdown`, `PinnedCommands`, `ToolProgress`, `OutputEntry`, `StatsFooter`) rather than only outer panel shell.

### 4B) Planner + Task Progress

New:
- `components/claude/ClaudeTaskPlannerDialog.vue`
- `composables/useTaskProgress.ts`
- `components/claude/TaskProgressPanel.vue`
- `components/claude/TaskProgressDialog.vue`

Modify Kanban/task detail components for progress badges and ask-Claude actions.

---

## Phase 5: Collaboration + Teams

### 5A) Task Collaboration

New:
- `composables/useTaskCollaboration.ts`

### 5B) Team UX

New:
- `components/teams/TeamSidebar.vue`
- `components/teams/NotifyButton.vue`

### 5C) API-Safe Team Settings

Only include team settings fields that the current Teams API actually supports.
If private/public/passcode is required product behavior, add API work items first, then wire UI.

---

## Phase 6: Messaging + Notifications

New:
- `composables/useChannelMessages.ts`
- `components/messages/MessagesTab.vue`
- `composables/useNotifications.ts`
- `components/notifications/NotificationBell.vue`

Wire into chosen navigation model (tabs or routes).

---

## Phase 7: Documents + Notebook

### 7A) Documents

New:
- `composables/useTeamFiles.ts`
- `components/documents/DocumentsTab.vue`
- `components/documents/DocumentsSidebar.vue`
- `components/documents/DocumentEditor.vue`
- `components/documents/FileTreeItem.vue`

Maintain split-pane behavior and destructive-action confirmations equivalent to React docs flow.

### 7B) Notebook

New:
- `components/notebook/NotebookTab.vue`
- `components/notebook/CollectionBrowser.vue`
- `components/notebook/DocumentManager.vue`
- `components/notebook/QAChat.vue`

Notebook implementation must follow Phase 0 backend decision.
Preserve collection -> documents -> chat progression flow and back-navigation semantics.

---

## Phase 8: Auth + Journey + Navigation Cleanup

### 8A) Auth Parity

React includes sign-in + sign-up behaviors in auth UI.
Bring Vue auth to parity, or document explicit approved de-scope.
Auth parity decision must also define token source behavior consistency (`authToken` shared key/cookie path) across dev/test/prod.

### 8B) Journey Templates + Learning Progress

New:
- `composables/useJourneyTemplates.ts`
- `components/journey/JourneyTemplateSelector.vue`
- `composables/useLearningProgress.ts`
- `components/journey/LearningProgressPanel.vue`

### 8C) Cleanup

Remove superseded legacy Vue views/components only after replacement is production-ready.
Update redirects and navigation without breaking deep links.

### 8D) Responsive and Shell Parity

Ensure app-shell behavior parity for:
- desktop navigation,
- mobile tab/navigation behavior,
- header affordances (online users, notifications, Claude entry point, sign-out),
- cross-app link behavior (if retained).

---

## Shared UI Reuse Matrix (Required During Implementation)

For each new Vue component, record:
- local component path,
- reused `@orchestratorai/ui` components/composables,
- reason for any custom UI not available in shared package.

Create and maintain:
- `docs/plans/flow-react-to-vue-ui-reuse-matrix.md`

---

## Parity Matrix (Required Sign-Off Artifact)

Create:
- `docs/plans/flow-react-to-vue-parity-matrix.md`

Each React feature must map to:
- source file(s),
- Vue target file(s),
- status (`not started` | `in progress` | `verified`),
- verification notes.

Minimum rows:
- Pages/routes/layout shell
- Responsive behavior (desktop + mobile)
- Kanban/hierarchy/sprint
- Timer + TaskPanel
- Collaboration
- Messaging/notifications
- Guest-mode behaviors (guestName-dependent flows)
- Documents/notebook
- Claude planner/progress
- Auth flows

---

## Verification

### After each phase

1. `cd apps/flow/web && npm run lint && npm run test && npm run build`
2. `cd apps/flow/api && npm run test`
3. Validate all touched API calls against the endpoint matrix.
4. Run parity checks against React behavior for changed feature set.
5. Validate behavior in all required environments (`dev`, `test`, `prod` config assumptions), including base URLs/proxy/token sources.

### Final sign-off walkthrough

Required walkthrough:
1. auth (login and signup parity decision validated)
2. kanban create/edit/drag/sprint assignment
3. timer + my tasks panel + pomodoro increments
4. claude panel + task planner + live task events
5. team collaboration/watchers/update requests
6. messaging/channels
7. notifications
8. documents and notebook flows
9. responsive/mobile interaction checks
10. guest-mode behavior checks where supported

Release only when parity matrix has no unresolved critical rows.
