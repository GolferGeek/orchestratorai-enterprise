# Flow React Feature Inventory (Frozen Baseline)

This file is the migration source of truth for React -> Vue parity.

- Source app: `apps/flow/web-react`
- Scope type: user-visible behavior + supporting hooks/services
- Last audited against code: current repository state

## 1) App Shell, Routing, and Navigation

### Top-level routes

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/Index.tsx` | Main authenticated Flow workspace |
| `/auth` | `pages/Auth.tsx` | Sign in + sign up UI |
| `*` | `pages/NotFound.tsx` | 404 fallback |

### Main shell behaviors (`pages/Index.tsx`)

- Header with product identity, current team, sign-out.
- Desktop + mobile tab switchers.
- Tabs: `timer`, `kanban`, `messages`, `documents`, `notebook`.
- Right-side Claude entry + panel.
- Cross-app menu link.
- Online users + notifications in header.

### Tab content

| Tab | Primary components |
|---|---|
| `timer` | `Timer`, `NotifyButton`, `TaskPanel` |
| `kanban` | `TeamSidebar`, `KanbanBoard` |
| `messages` | `MessagesTab` |
| `documents` | `DocumentsTab` |
| `notebook` | `NotebookTab` |

## 2) Major User Features

### Kanban / Planning

- `KanbanBoard`, `KanbanColumn`, `KanbanCard`
- `SprintColumn`
- `HierarchySidebar`
- `TaskDetailDialog`
- Drag/drop board flow with status columns, sprint placement, hierarchy integration.
- Selected-user filtering via team sidebar selection.

### Timer / Productivity

- `Timer` + `useSharedTimer`
- `usePartyFoul`
- Focus/break cycle with pomodoro increments
- Team-aware timer behavior

### Personal task side panel

- `TaskPanel` using cross-team `getMyTasks` behavior.
- Subtask expand/collapse and completion updates.

### Team collaboration

- `TeamSidebar`
- `OnlineUsers` + `useTeamPresence`
- `TaskDetailDialog` collaboration controls
- `useTaskCollaboration`

### Messaging + notifications

- `MessagesTab` + `useChannelMessages`
- `NotificationBell` + `useNotifications`
- `NotifyButton`
- `useNotificationSound`

### Claude integration

- `ClaudeCodeButton`
- `ClaudeCodePanel`
- `ClaudeTaskPlannerDialog`
- `TaskProgressDialog`, `TaskProgressPanel`, `TaskProgressBadge`
- Supporting internal Claude panel pieces:
  - `AutoCompleteDropdown`
  - `PinnedCommands`
  - `ToolProgress`
  - `OutputEntry`
  - `StatsFooter`

### Documents + notebook

- Documents:
  - `DocumentsTab`
  - `DocumentsSidebar`
  - `DocumentEditor`
  - `FileTreeItem`
- Notebook:
  - `NotebookTab`
  - `CollectionBrowser`
  - `DocumentManager`
  - `QAChat`

### Auth

- `Auth` page supports sign-in and sign-up toggling with validation and error handling.

## 3) Hook Inventory (Behavioral Backbone)

| Hook | Purpose |
|---|---|
| `useSharedTasks` | Shared task polling + optimistic updates + filtering |
| `useHierarchy` | Effort/project/task hierarchy CRUD |
| `useSprints` | Sprint fetch/create/update/delete flows |
| `useSharedTimer` | Timer polling + local countdown + transitions |
| `usePartyFoul` | Team accountability check on timer completion |
| `useTeamPresence` | Heartbeat + online user status |
| `useTaskCollaboration` | Collaborators/watchers/update requests |
| `useChannelMessages` | Channels/messages polling + send |
| `useNotifications` | Notification polling + read state |
| `useNotificationSound` | Notification sound effect |
| `useTaskProgress` | SSE task progress stream |
| `useTeamFiles` | Document tree + file CRUD |
| `useJourneyTemplates` | Journey template operations |
| `useLearningProgress` | Learning milestone progress |
| `useClaudeCodePanel` | Claude panel state + execution lifecycle |
| `useTeamsApi` | Teams/members API integration |
| `useAuth` | Auth/session/user/profile flows |
| `useIsMobile` | Mobile breakpoint behavior |
| `useOrchFlow` | OrchFlow-specific integrations |
| `useToast` | Toast notification display |

## 4) Supporting Contexts/Stores in React

| Context/Store | Responsibility |
|---|---|
| `AuthProvider` (Zustand: `auth-store.ts`) | User/profile/session lifecycle, token refresh, SSO cookie handling |
| `TeamProvider` (`TeamContext.tsx`) | Team selection and member context |
| `ClaudeCodeProvider` (`ClaudeCodeContext.tsx`) | Claude panel open/close + task prompt context |

## 5) Service/API Surface Used by React

| Service file | Purpose |
|---|---|
| `services/flowApiService.ts` | Core Flow features (tasks/sprints/timer/collab/channels/files/templates/progress) |
| `services/teamsApiService.ts` | Teams and membership APIs |
| `services/claudeCodeService.ts` | Claude panel `/super-admin/*` endpoints |
| `components/notebook/notebook-api.ts` | Notebook/RAG `/api/rag/*` endpoints |

## 6) Guest-Mode Relevant Behaviors to Track

These appear in React data models/API calls and must be explicitly parity-tested where supported:

- `guestName` in notifications.
- `guestName` in task collaboration/watchers/update requests.
- `guestName` in channel messages.
- Fallback display behavior for non-authenticated names where applicable.

## 7) Additional Service/Config Files

| File | Purpose |
|---|---|
| `config/api-config.ts` | API URL configuration (main API, auth API) |
| `lib/userColors.ts` | User color assignment with guestName support |
| `lib/utils.ts` | Shadcn/ui utilities (cn, clsx) |

## 8) Explicitly Out of Scope

| Feature | Reason |
|---|---|
| `ClaudeTaskPlannerDialog` + `planClaudeTask` | Backend never implemented. React UI non-functional. De-scoped in Phase 0 (FLOW-VUE-003). |

## 9) Inventory Freeze

**Status: FROZEN** (Phase 0, FLOW-VUE-006)
This inventory was verified against the actual React codebase and confirmed complete.
No features may be added or removed without explicit approval and update to this document.
