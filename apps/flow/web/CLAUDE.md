# Flow Web (Productivity — Frontend, Vue 3)

## Why This Product Exists

Flow Web provides the UI for team productivity — tasks, sprints, teams, files. It's a focused productivity app, not an agent dashboard. Think task boards and sprint planning, not prediction charts or risk analysis.

## Core Architectural Philosophy

### Productivity UI, Not Agent UI

Flow Web shows tasks, teams, sprints, and files. It does not show:
- Agent dashboards (Forge Web)
- Agent conversations (Compose Web)
- External A2A management (Bridge Web)
- System administration (Admin Web)

### Currently Building from React Reference

The working React reference is at `apps/flow/web-react/`. Flow Web is the Vue 3 reimplementation. Convert each React feature as idiomatic Vue 3 Composition API — do not copy React code directly.

## Port Assignments

- Web: 6901 (dev) / 7901 (prod)
- Connects to Flow API at port 6900

## Architecture

```
apps/flow/web/src/
  views/
    TasksView.vue, TaskDetailView.vue
    TeamsView.vue, TeamDetailView.vue
    SprintsView.vue, SprintBoardView.vue
    SharedListsView.vue, FilesView.vue
  components/
    tasks/, teams/, sprints/, shared/
  stores/
    tasks.store.ts, teams.store.ts, sprints.store.ts, files.store.ts
  services/
    flow-api.service.ts             ← HTTP calls to Flow API (port 6900)
```

### Three-Layer Architecture

```
Component (view) → Store (Pinia) → Service (HTTP) → Flow API
```

## React to Vue 3 Conversion

| React | Vue 3 |
|-------|-------|
| `useState` | `ref()` / `reactive()` |
| `useEffect` | `onMounted()` / `watch()` |
| `useContext` | Pinia store |
| `useMemo` | `computed()` |

## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Flow API (port 6900)
