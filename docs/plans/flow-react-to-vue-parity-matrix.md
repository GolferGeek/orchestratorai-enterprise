# Flow React -> Vue Parity Matrix (Path-Precise)

Use this matrix during implementation and sign-off.

Status values:
- `not started`
- `in progress`
- `partial`
- `verified`
- `de-scoped (approved)`

Path legend:
- `existing` = file currently exists in Vue app.
- `planned` = file path reserved for migration implementation.

## 1) App Shell, Routing, and Responsive Behavior

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Top-level routes (`/`, `/auth`, `*`) | `apps/flow/web-react/src/App.tsx` | `apps/flow/web/src/router/index.ts` (existing) | partial | Route map exists in Vue; parity not verified |
| Main shell layout and header actions | `apps/flow/web-react/src/pages/Index.tsx` | `apps/flow/web/src/App.vue` (existing), `packages/ui/layout/OaiAppShell.vue` (existing) | partial | Architecture differs; phase-0 decision required |
| Desktop navigation behavior | `apps/flow/web-react/src/pages/Index.tsx` | `apps/flow/web/src/App.vue` (existing), `apps/flow/web/src/router/index.ts` (existing) | partial | Validate tab-vs-route parity choice |
| Mobile tab behavior | `apps/flow/web-react/src/pages/Index.tsx` | `apps/flow/web/src/App.vue` (existing) plus mobile nav behavior (planned) | not started | Required responsive parity tests |
| Cross-app menu behavior | `apps/flow/web-react/src/pages/Index.tsx` | `apps/flow/web/src/components/shared/CrossAppNav.vue` (planned) or shell menu config (planned) | not started | Link target and entitlement behavior must match decision |

## 2) Auth and Session

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Sign-in flow | `apps/flow/web-react/src/pages/Auth.tsx` | `apps/flow/web/src/views/AuthView.vue` (existing) | partial | Vue has login, behavior differs |
| Sign-up flow | `apps/flow/web-react/src/pages/Auth.tsx` | `apps/flow/web/src/views/AuthView.vue` (existing; extend) | not started | Explicit parity/de-scope decision required |
| Auth state/session lifecycle | `apps/flow/web-react/src/hooks/useAuth.tsx`, `apps/flow/web-react/src/stores/auth-store.ts` | `apps/flow/web/src/stores/auth.store.ts` (existing) | partial | Must validate token source across envs |

## 3) Kanban, Hierarchy, Sprint

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Kanban board base | `apps/flow/web-react/src/components/KanbanBoard.tsx` | `apps/flow/web/src/components/kanban/KanbanBoard.vue` (planned), `apps/flow/web/src/views/SprintBoardView.vue` (existing wrapper target) | not started | |
| Kanban column | `apps/flow/web-react/src/components/KanbanColumn.tsx` | `apps/flow/web/src/components/kanban/KanbanColumn.vue` (planned) | not started | |
| Kanban card | `apps/flow/web-react/src/components/KanbanCard.tsx` | `apps/flow/web/src/components/kanban/KanbanCard.vue` (planned) | not started | |
| Sprint management | `apps/flow/web-react/src/components/SprintColumn.tsx` | `apps/flow/web/src/components/kanban/SprintColumn.vue` (planned), `apps/flow/web/src/stores/sprints.store.ts` (existing; extend) | not started | |
| Hierarchy sidebar | `apps/flow/web-react/src/components/HierarchySidebar.tsx` | `apps/flow/web/src/components/kanban/HierarchySidebar.vue` (planned) | not started | |
| Task detail dialog | `apps/flow/web-react/src/components/TaskDetailDialog.tsx` | `apps/flow/web/src/components/kanban/TaskDetailDialog.vue` (planned) | not started | |
| Selected-user board filtering | `apps/flow/web-react/src/pages/Index.tsx`, `apps/flow/web-react/src/components/KanbanBoard.tsx` | `apps/flow/web/src/components/kanban/KanbanBoard.vue` (planned), `apps/flow/web/src/composables/useSharedTasks.ts` (planned) | not started | Must match selected member filter behavior |
| Shared tasks composable parity | `apps/flow/web-react/src/hooks/useSharedTasks.ts` | `apps/flow/web/src/composables/useSharedTasks.ts` (planned), `apps/flow/web/src/stores/tasks.store.ts` (existing; extend) | not started | Polling + optimistic updates parity |
| Hierarchy composable parity | `apps/flow/web-react/src/hooks/useHierarchy.ts` | `apps/flow/web/src/composables/useHierarchy.ts` (planned), `apps/flow/web/src/stores/tasks.store.ts` (existing; extend) | not started | |

## 4) Timer and Personal Productivity

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Timer widget | `apps/flow/web-react/src/components/Timer.tsx` | `apps/flow/web/src/components/timer/TimerWidget.vue` (planned) | not started | |
| Shared timer composable | `apps/flow/web-react/src/hooks/useSharedTimer.ts` | `apps/flow/web/src/composables/useSharedTimer.ts` (planned) | not started | |
| Party foul behavior | `apps/flow/web-react/src/hooks/usePartyFoul.ts` | `apps/flow/web/src/composables/usePartyFoul.ts` (planned) | not started | |
| My tasks side panel | `apps/flow/web-react/src/components/TaskPanel.tsx` | `apps/flow/web/src/components/tasks/TaskPanel.vue` (planned), `apps/flow/web/src/stores/tasks.store.ts` (existing; extend `getMyTasks` use) | not started | Cross-team behavior required |
| Pomodoro increment integration | `apps/flow/web-react/src/pages/Index.tsx` | `apps/flow/web/src/App.vue` (existing; integrate), `apps/flow/web/src/components/timer/TimerWidget.vue` (planned) | not started | |

## 5) Teams and Collaboration

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Team sidebar | `apps/flow/web-react/src/components/TeamSidebar.tsx` | `apps/flow/web/src/components/teams/TeamSidebar.vue` (planned) | not started | |
| Online users | `apps/flow/web-react/src/components/OnlineUsers.tsx` | `apps/flow/web/src/components/teams/OnlineUsers.vue` (planned) | not started | |
| Team presence polling | `apps/flow/web-react/src/hooks/useTeamPresence.ts` | `apps/flow/web/src/composables/useTeamPresence.ts` (planned) | not started | |
| Task collaboration flows | `apps/flow/web-react/src/hooks/useTaskCollaboration.ts` | `apps/flow/web/src/composables/useTaskCollaboration.ts` (planned), `apps/flow/web/src/components/kanban/TaskDetailDialog.vue` (planned) | not started | |
| Team settings behavior scope | `apps/flow/web-react/src/hooks/useTeamsApi.ts` | `apps/flow/web/src/stores/teams.store.ts` (existing; extend), `apps/flow/web/src/components/teams/TeamSidebar.vue` (planned) | not started | Must align with current Teams API contract |

## 6) Messaging and Notifications

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Messages tab | `apps/flow/web-react/src/components/MessagesTab.tsx` | `apps/flow/web/src/components/messages/MessagesTab.vue` (planned) | not started | |
| Channel messaging composable | `apps/flow/web-react/src/hooks/useChannelMessages.ts` | `apps/flow/web/src/composables/useChannelMessages.ts` (planned) | not started | |
| Notification bell | `apps/flow/web-react/src/components/NotificationBell.tsx` | `apps/flow/web/src/components/notifications/NotificationBell.vue` (planned) | not started | |
| Notifications composable | `apps/flow/web-react/src/hooks/useNotifications.ts` | `apps/flow/web/src/composables/useNotifications.ts` (planned) | not started | |
| Notification sound | `apps/flow/web-react/src/hooks/useNotificationSound.ts` | `apps/flow/web/src/composables/useNotificationSound.ts` (planned) | not started | |
| Notify button | `apps/flow/web-react/src/components/NotifyButton.tsx` | `apps/flow/web/src/components/teams/NotifyButton.vue` (planned) | not started | |

## 7) Claude and Task Progress

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Claude panel shell | `apps/flow/web-react/src/components/claude/ClaudeCodePanel.tsx` | **Shared path chosen:** `packages/ui/claude-pane/ClaudeCodePane.vue` + `apps/flow/web/src/App.vue` (integration). Connects to Admin API `/admin/claude-pane/*` (port 6101). | not started | Phase-0 FLOW-VUE-002 resolved: shared UI path + Admin API backend |
| Claude button | `apps/flow/web-react/src/components/claude/ClaudeCodeButton.tsx` | `apps/flow/web/src/components/claude/ClaudeCodeButton.vue` (planned) or shared shell trigger integration (planned) | not started | |
| Claude task planner dialog | `apps/flow/web-react/src/components/ClaudeTaskPlannerDialog.tsx` | N/A | de-scoped (approved) | Backend never implemented. React UI non-functional. Phase 0 FLOW-VUE-003. |
| Task progress panel/dialog/badge | `apps/flow/web-react/src/components/TaskProgressPanel.tsx`, `apps/flow/web-react/src/components/TaskProgressDialog.tsx` | `apps/flow/web/src/components/claude/TaskProgressPanel.vue` (planned), `apps/flow/web/src/components/claude/TaskProgressDialog.vue` (planned), `apps/flow/web/src/components/kanban/KanbanCard.vue` (planned badge wiring) | not started | SSE parity required |
| Claude internal subcomponents (Flow-specific path) | `apps/flow/web-react/src/components/claude/AutoCompleteDropdown.tsx`, `PinnedCommands.tsx`, `ToolProgress.tsx`, `OutputEntry.tsx`, `StatsFooter.tsx` | `apps/flow/web/src/components/claude/AutoCompleteDropdown.vue` (planned), `PinnedCommands.vue` (planned), `ToolProgress.vue` (planned), `OutputEntry.vue` (planned), `StatsFooter.vue` (planned) | not started | Only required if Flow-specific panel path chosen |

## 8) Documents and Notebook

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Documents tab (split pane) | `apps/flow/web-react/src/components/documents/DocumentsTab.tsx` | `apps/flow/web/src/components/documents/DocumentsTab.vue` (planned), `apps/flow/web/src/views/FilesView.vue` (existing; replace/wrap) | not started | Split-pane + delete confirm parity |
| Documents sidebar/editor/tree | `apps/flow/web-react/src/components/documents/DocumentsSidebar.tsx`, `DocumentEditor.tsx`, `FileTreeItem.tsx` | `apps/flow/web/src/components/documents/DocumentsSidebar.vue` (planned), `DocumentEditor.vue` (planned), `FileTreeItem.vue` (planned) | not started | |
| Team files composable behavior | `apps/flow/web-react/src/hooks/useTeamFiles.ts` | `apps/flow/web/src/composables/useTeamFiles.ts` (planned), `apps/flow/web/src/stores/files.store.ts` (existing; extend) | not started | |
| Notebook tab flow | `apps/flow/web-react/src/components/notebook/NotebookTab.tsx` | `apps/flow/web/src/components/notebook/NotebookTab.vue` (planned) | not started | collection -> documents -> chat flow parity |
| Notebook subcomponents | `apps/flow/web-react/src/components/notebook/CollectionBrowser.tsx`, `DocumentManager.tsx`, `QAChat.tsx` | `apps/flow/web/src/components/notebook/CollectionBrowser.vue` (planned), `DocumentManager.vue` (planned), `QAChat.vue` (planned) | not started | Phase-0 FLOW-VUE-004 resolved: Compose API owns `/api/rag/*` (port 6300). Flow calls via Vite proxy. |

## 9) Journey and Learning

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Journey templates hook/UX | `apps/flow/web-react/src/hooks/useJourneyTemplates.ts` | `apps/flow/web/src/composables/useJourneyTemplates.ts` (planned), `apps/flow/web/src/components/journey/JourneyTemplateSelector.vue` (planned), `apps/flow/web/src/views/HomeView.vue` (existing; extend) | not started | |
| Learning progress hook/UX | `apps/flow/web-react/src/hooks/useLearningProgress.ts` | `apps/flow/web/src/composables/useLearningProgress.ts` (planned), `apps/flow/web/src/components/journey/LearningProgressPanel.vue` (planned), `apps/flow/web/src/views/HomeView.vue` (existing; extend) | not started | |

## 10) Guest-Mode Behavior

| Area | React source | Vue target path(s) | Status | Verification notes |
|---|---|---|---|---|
| Notifications guestName paths | `apps/flow/web-react/src/services/flowApiService.ts` | `apps/flow/web/src/services/flow-api.service.ts` (existing; extend), `apps/flow/web/src/composables/useNotifications.ts` (planned), `apps/flow/web/src/components/notifications/NotificationBell.vue` (planned) | not started | Verify create/read guest behavior |
| Collaboration guestName paths | `apps/flow/web-react/src/services/flowApiService.ts` | `apps/flow/web/src/services/flow-api.service.ts` (existing; extend), `apps/flow/web/src/composables/useTaskCollaboration.ts` (planned) | not started | Verify watchers/collaborators/update requests |
| Channel message guestName paths | `apps/flow/web-react/src/services/flowApiService.ts` | `apps/flow/web/src/services/flow-api.service.ts` (existing; extend), `apps/flow/web/src/composables/useChannelMessages.ts` (planned), `apps/flow/web/src/components/messages/MessagesTab.vue` (planned) | not started | Verify send/render guest behavior |

## 11) Implementation Tracker Helpers

Suggested task split order:
1. `services` + `types` contract expansion (`flow-api.service.ts`, `types/flow.ts`).
2. `stores` contract wiring (`tasks.store.ts`, `sprints.store.ts`, `teams.store.ts`, `files.store.ts`).
3. feature composables.
4. UI components and view integration.
5. parity verification and matrix status updates.

## 12) Sign-Off Checklist

- [ ] Endpoint matrix has no unresolved critical gaps.
- [ ] Feature inventory rows all mapped.
- [ ] All parity rows are `verified` or `de-scoped (approved)`.
- [ ] Desktop + mobile walkthrough completed.
- [ ] Guest-mode checks completed where supported.
- [ ] Dev/test/prod configuration assumptions validated.
