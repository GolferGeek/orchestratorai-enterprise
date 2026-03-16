# Flow React -> Vue Endpoint Matrix

Purpose: track every React API dependency and whether it is available for parity migration.

Legend:
- `exists` = endpoint is present in current Flow API controllers.
- `missing` = endpoint not found in current Flow API.
- `external/decision` = endpoint exists in another API or unresolved ownership; must be decided in Phase 0.

## 1) Teams + User Context (`teamsApiService.ts`)

| React method | HTTP | Path | Status | Notes |
|---|---|---|---|---|
| `getUserContext` | GET | `/users/me/context` | exists | Teams controller |
| `getTeamsByOrg` | GET | `/orgs/:orgSlug/teams` | exists | Teams controller |
| `createTeam` | POST | `/orgs/:orgSlug/teams` | exists | Teams controller |
| `getTeam` | GET | `/teams/:teamId` | exists | Teams controller |
| `updateTeam` | PUT | `/teams/:teamId` | exists | Teams controller |
| `deleteTeam` | DELETE | `/teams/:teamId` | exists | Teams controller |
| `getTeamMembers` | GET | `/teams/:teamId/members` | exists | Teams controller |
| `addTeamMember` | POST | `/teams/:teamId/members` | exists | Teams controller |
| `updateTeamMember` | PUT | `/teams/:teamId/members/:userId` | exists | Teams controller |
| `removeTeamMember` | DELETE | `/teams/:teamId/members/:userId` | exists | Teams controller |

## 2) Core Flow Endpoints (`flowApiService.ts`)

### 2.1 Efforts / Projects / Tasks / Sprints

| Group | Status |
|---|---|
| `/teams/:teamId/efforts*` | exists |
| `/teams/:teamId/projects*` | exists |
| `/teams/:teamId/tasks*` | exists |
| `/teams/:teamId/sprints*` | exists |

### 2.2 Shared Tasks + Collaboration

| React method | HTTP | Path | Status | Notes |
|---|---|---|---|---|
| `getSharedTasks` | GET | `/teams/:teamId/shared-tasks` | exists | query params supported |
| `createSharedTask` | POST | `/teams/:teamId/shared-tasks` | exists | |
| `updateSharedTask` | PUT | `/teams/:teamId/shared-tasks/:taskId` | exists | |
| `deleteSharedTask` | DELETE | `/teams/:teamId/shared-tasks/:taskId` | exists | |
| `planClaudeTask` | POST | `/teams/:teamId/shared-tasks/plan` | de-scoped | Phase 0 decision: backend never implemented, React UI non-functional. De-scoped. |
| `getTaskCollaborators` | GET | `/teams/:teamId/tasks/:taskId/collaborators` | exists | |
| `createTaskCollaborator` | POST | `/teams/:teamId/tasks/:taskId/collaborators` | exists | |
| `deleteTaskCollaborator` | DELETE | `/teams/:teamId/tasks/collaborators/:collaboratorId` | exists | |
| `getTaskWatchers` | GET | `/teams/:teamId/tasks/:taskId/watchers` | exists | |
| `createTaskWatcher` | POST | `/teams/:teamId/tasks/:taskId/watchers` | exists | |
| `deleteTaskWatcher` | DELETE | `/teams/:teamId/tasks/watchers/:watcherId` | exists | |
| `getTaskUpdateRequests` | GET | `/teams/:teamId/tasks/:taskId/update-requests` | exists | |
| `createTaskUpdateRequest` | POST | `/teams/:teamId/tasks/:taskId/update-requests` | exists | |
| `updateTaskUpdateRequest` | PUT | `/teams/:teamId/tasks/update-requests/:requestId` | exists | |

### 2.3 Messaging / Notifications / Presence / Timer

| React method | HTTP | Path | Status | Notes |
|---|---|---|---|---|
| `getChannels` | GET | `/teams/:teamId/channels` | exists | |
| `createChannel` | POST | `/teams/:teamId/channels` | exists | |
| `deleteChannel` | DELETE | `/teams/:teamId/channels/:channelId` | exists | |
| `getChannelMessages` | GET | `/teams/:teamId/channels/:channelId/messages` | exists | |
| `createChannelMessage` | POST | `/teams/:teamId/channels/:channelId/messages` | exists | |
| `getNotifications` | GET | `/teams/:teamId/notifications` | exists | supports `guestName` query |
| `createNotification` | POST | `/teams/:teamId/notifications` | exists | |
| `markNotificationsRead` | PUT | `/teams/:teamId/notifications/mark-read` | exists | |
| `sendHeartbeat` | POST | `/flow/heartbeat` | exists | global controller |
| `getOnlineUsers` | GET | `/flow/online` | exists | global controller |
| `getTimerState` | GET | `/teams/:teamId/timer-state` | exists | |
| `createTimerState` | POST | `/teams/:teamId/timer-state` | exists | |
| `updateTimerState` | PUT | `/teams/:teamId/timer-state/:timerId` | exists | |
| `getGlobalTimerState` | GET | `/flow/global-timer` | exists | |
| `createGlobalTimerState` | POST | `/flow/global-timer` | exists | |
| `updateGlobalTimerState` | PUT | `/flow/global-timer/:timerId` | exists | |

### 2.4 Files / Profiles / Journey / Learning / Personal Tasks

| React method | HTTP | Path | Status | Notes |
|---|---|---|---|---|
| `getTeamFiles` | GET | `/teams/:teamId/files` | exists | |
| `getTeamFile` | GET | `/teams/:teamId/files/:fileId` | exists | |
| `createTeamFile` | POST | `/teams/:teamId/files` | exists | |
| `updateTeamFile` | PUT | `/teams/:teamId/files/:fileId` | exists | |
| `deleteTeamFile` | DELETE | `/teams/:teamId/files/:fileId` | exists | |
| `getProfiles` | GET | `/flow/profiles` | exists | |
| `getProfile` | GET | `/flow/profiles/:userId` | exists | |
| `getJourneyTemplates` | GET | `/flow/journey-templates` | exists | |
| `getJourneyTemplateBySlug` | GET | `/flow/journey-templates/:slug` | exists | |
| `getLearningProgress` | GET | `/flow/learning-progress` | exists | |
| `createOrUpdateLearningProgress` | POST | `/flow/learning-progress` | exists | |
| `getMyTasks` | GET | `/flow/my-tasks` | exists | |

## 3) Task Events SSE (`flow-task-events`)

| React/Vue use case | HTTP | Path | Status | Notes |
|---|---|---|---|---|
| Subscribe task progress stream | GET (SSE) | `/flow/task-events/stream?taskId=...&token=...` | exists | token query is accepted but not validated in controller |
| Ingest task events | POST | `/flow/task-events` | exists | internal hook ingestion |
| Create task via sink | POST | `/flow/task-events/create-task` | exists | used by tool integrations |
| Update task status via sink | POST | `/flow/task-events/update-task-status` | exists | discovered in verification |
| Add task comment via sink | POST | `/flow/task-events/add-task-comment` | exists | discovered in verification |

## 4) Claude Panel Endpoints (`claudeCodeService.ts`)

**Phase 0 Decision (FLOW-VUE-002):** Claude panel is served by **Admin API** (port 6101) via `/admin/claude-pane/*` controller. Admin API spawns the `claude` CLI as a child process and streams output via SSE. Flow Vue will use the **shared UI path** (`packages/ui/claude-pane/`) and connect to Admin API.

| React method | HTTP | Admin API Path | Status | Notes |
|---|---|---|---|---|
| `isAvailable` | GET | `/admin/claude-pane/health` | resolved | Admin API, ClaudePaneController |
| `getCommands` | GET | `/admin/claude-pane/commands` | resolved | Admin API, ClaudePaneController |
| `getSkills` | GET | `/admin/claude-pane/skills` | resolved | Admin API, ClaudePaneController |
| `execute` | POST (SSE) | `/admin/claude-pane/execute` | resolved | Admin API, spawns `claude` CLI process |

React used `/super-admin/*` paths which were aliased to `/admin/claude-pane/*`. Vue will call Admin API directly.

## 5) Notebook/RAG Endpoints (`components/notebook/notebook-api.ts`)

**Phase 0 Decision (FLOW-VUE-004):** RAG is owned by **Compose API** (port 6300). Compose hosts all RAG controllers under `/api/rag/*`. Flow Vue notebook will call Compose API via Vite proxy.

| React method group | HTTP | Compose API Path | Status | Notes |
|---|---|---|---|---|
| Collections CRUD | GET/POST/DELETE | `/api/rag/collections` | resolved | Compose API, CollectionsController |
| Documents CRUD | GET/POST/DELETE | `/api/rag/collections/:id/documents` | resolved | Compose API, DocumentsController |
| Q&A (NotebookLM-style) | POST | `/api/rag/collections/:id/qa` | resolved | Compose API, QAController |
| Vector query | POST | `/api/rag/collections/:id/query` | resolved | Compose API, QueryController |

## 6) Contract Gaps — All Resolved

1. ~~`POST /teams/:teamId/shared-tasks/plan`~~ — **De-scoped.** Backend never implemented. React UI non-functional. (FLOW-VUE-003)
2. ~~Claude panel backend path~~ — **Resolved.** Use Admin API `/admin/claude-pane/*` + shared UI `packages/ui/claude-pane/`. (FLOW-VUE-002)
3. ~~Notebook/RAG endpoint ownership~~ — **Resolved.** Compose API owns `/api/rag/*`. Flow calls via proxy. (FLOW-VUE-004)
4. Team settings feature scope — aligned with current Teams API contract (CRUD + members). No gaps.

## 7) Additional Endpoints Discovered During Verification

| Endpoint group | Controller | Notes |
|---|---|---|
| `/auth/*` (login, signup, logout, refresh, me) | Auth controller in Flow API | Flow API has its own auth controller |
| `/api/rbac/*` (roles, permissions, orgs) | RBAC controller | Admin/RBAC features |
| `/feature-flags/*` | Feature flag controller | Runtime feature flags |
| `/system/*` (health, analytics, model-config) | System controller | System administration |
| `/health/*` (health, db, supabase) | Health controller | Infrastructure health checks |
| `/teams/:teamId/profiles` | Flow controller | Team-scoped profiles (in addition to `/flow/profiles`) |
