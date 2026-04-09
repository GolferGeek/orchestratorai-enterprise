---
name: forge-workflow-frontend
description: Frontend patterns for async LangGraph workflow UIs in Forge (Vue 3 + Ionic)
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Forge Workflow Frontend Pattern

This skill covers the Vue 3 + Ionic frontend for async LangGraph workflow workspaces in Forge. It documents the activity list, job detail modal, HITL review modal, upload modal, stage ladder, SSE event stream, and service layer patterns.

## Canonical Reference Files

- **Workspace view**: `apps/forge/web/src/views/agents/legal-department/LegalDepartmentWorkspace.vue`
- **Document onboarding page**: `apps/forge/web/src/views/agents/legal-department/DocumentOnboardingPage.vue`
- **Activity list**: `apps/forge/web/src/views/agents/legal-department/components/JobActivityList.vue`
- **Job detail modal**: `apps/forge/web/src/views/agents/legal-department/components/JobDetailModal.vue`
- **HITL review modal**: `apps/forge/web/src/views/agents/legal-department/components/LegalJobReviewModal.vue`
- **Upload modal**: `apps/forge/web/src/views/agents/legal-department/components/OnboardDocumentModal.vue`
- **Stage ladder**: `apps/forge/web/src/views/agents/legal-department/components/StageLadder.vue`
- **Report markdown**: `apps/forge/web/src/views/agents/legal-department/components/ReportMarkdown.vue`
- **In-row ticker**: `apps/forge/web/src/views/agents/legal-department/components/InRowTicker.vue`
- **Source viewer**: `apps/forge/web/src/views/agents/legal-department/components/JobSourceViewer.vue`
- **HTTP service**: `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`
- **SSE composable**: `apps/forge/web/src/views/agents/legal-department/composables/useJobEventStream.ts`
- **Workflow presentation**: `apps/forge/web/src/views/agents/legal-department/composables/useWorkflowPresentation.ts`
- **Thinking states**: `apps/forge/web/src/views/agents/legal-department/composables/useThinkingStates.ts`
- **Job modal route**: `apps/forge/web/src/views/agents/legal-department/composables/useJobModalRoute.ts`

## 1. Workspace Layout

The workspace is a single-column layout with modals as siblings of `<ion-content>`:

```vue
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ workspaceTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="uploadModalOpen = true">New</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="single-column">
        <JobActivityList
          :org-slug="orgSlug"
          :selected-id="openJobId"
          @select="onSelect"
        />
      </div>
    </ion-content>

    <!-- Modals are permanently mounted; ion-modal transitions based on :is-open -->
    <OnboardDocumentModal :open="uploadModalOpen" :context="context" @close="..." @queued="..." />
    <JobDetailModal :open="detailOpen" :job-id="openJobId" :org-slug="orgSlug" @close="..." />
    <LegalJobReviewModal :open="reviewOpen" :job-id="openJobId" :org-slug="orgSlug" :context="context" @close="..." @reviewed="..." />
  </ion-page>
</template>
```

### Modal Routing Logic

The workspace tracks which modal to show based on the job's status at open time:

```typescript
const openJobStatus = ref<string | null>(null);

const detailOpen = computed(
  () => !!openJobId.value && openJobStatus.value !== 'awaiting_review',
);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);
```

The `useJobModalRoute` composable manages URL-synced job IDs so refreshing the page reopens the correct modal.

### ExecutionContext Construction

The frontend builds ExecutionContext from the RBAC store. The wildcard `*` org is rejected:

```typescript
const context = computed<ExecutionContextLike | null>(() => {
  if (!orgSlug.value || orgSlug.value === '*' || !user.value?.id) return null;
  return {
    orgSlug: orgSlug.value,
    userId: user.value.id,
    conversationId: 'placeholder', // server overrides at enqueue
    agentSlug: '{domain}',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
});
```

## 2. Activity List with Mine/All Toggle

`JobActivityList.vue` is a reusable component that polls the job list and renders status-badged rows.

Props:
- `orgSlug: string` -- tenant scope
- `title: string` -- header text
- `emptyHint: string` -- shown when no jobs exist
- `selectedId?: string` -- highlights the selected row
- `capabilitySlug?: string` -- optional filter

Events:
- `@select(job: AgentJobRow)` -- emitted when a clickable row is clicked

### Key Behaviors

- **Polling**: Refreshes on a 5-second interval via `setInterval`. Stops on unmount.
- **Clickability**: Only `completed`, `failed`, and `awaiting_review` jobs are clickable. `queued` and `processing` rows are visually muted.
- **In-row ticker**: Processing jobs render an `<InRowTicker>` component that subscribes to SSE for live step updates.
- **Status icons and colors**: Each status maps to an Ionicons icon and Ionic color (e.g., `hourglass` + `warning` for `queued`, `checkmarkCircle` + `success` for `completed`).
- **Timing display**: Shows relative queue time, running duration for processing jobs, and total duration for completed jobs.

### userId Filter

The activity list supports a `userId` query parameter for filtering to "my jobs" vs "all jobs". The workspace can expose a toggle that sets the userId filter:

```typescript
const jobs = await legalJobsService.listJobs(orgSlug, { userId: showMine ? currentUserId : undefined });
```

## 3. Upload Modal

`OnboardDocumentModal.vue` provides multi-file upload with drag-and-drop:

```vue
<div class="dropzone" :class="{ active: dragActive }"
  @dragover.prevent="dragActive = true"
  @dragleave.prevent="dragActive = false"
  @drop.prevent="onDrop">
  <ion-icon :icon="cloudUploadOutline" size="large" />
  <ul v-if="files.length > 0" class="file-list">
    <li v-for="f in files" :key="f.name">
      <strong>{{ f.name }}</strong> ({{ formatBytes(f.size) }})
    </li>
  </ul>
  <input type="file" ref="fileInput" @change="onPick" accept="..." multiple hidden />
  <ion-button @click="fileInput?.click()">Choose files</ion-button>
</div>
```

Props: `open: boolean`, `context: ExecutionContextLike`, `capabilitySlug?: string`.
Events: `@close`, `@queued({ jobId, conversationId })`.

Submit calls `legalJobsService.uploadFiles(context, files, capabilitySlug)`.

## 4. Stage Ladder

`StageLadder.vue` renders a vertical list of workflow stages with state-driven icons:

```vue
<ul class="stage-ladder">
  <li v-for="stage in stages" :key="stage.id" :class="`stage--${stage.state}`">
    <span class="stage-icon">{{ icon(stage, thinkingStates?.[stage.id]) }}</span>
    <div class="stage-body">
      <div class="stage-label">{{ stage.label }}</div>
      <div v-if="thinkingStates?.[stage.id]" class="stage-thinking-badge">
        {{ thinkingPhaseLabel(thinkingStates[stage.id]) }}
      </div>
    </div>
    <span v-if="duration(stage)" class="stage-duration">{{ duration(stage) }}</span>
  </li>
</ul>
```

Props: `stages: StageState[]`, `thinkingStates?: ThinkingStateMap`.

### Stage States

Each stage has one of: `pending`, `active`, `done`, `failed`, `skipped`. Icons:
- `pending` -> `"o"` (open circle)
- `active` -> `"..."` (spinner), or `brain` emoji if reasoning, or `pen` emoji if writing
- `done` -> `checkmark`
- `failed` -> `"x"`
- `skipped` -> `"--"` (dash)

### Workflow Presentation

The `useWorkflowPresentation` composable fetches a manifest from `GET /agents/:slug/presentation` once per session (module-scoped cache). The manifest defines the stages and their mapping to observability events. The `presentationWalker` from `@orchestrator-ai/transport-types` processes events into `StageState[]`.

## 5. SSE Subscription (useJobEventStream)

The `useJobEventStream` composable merges historical events from the REST API with live SSE events:

```typescript
export function useJobEventStream(opts: {
  jobId: string;
  conversationId: string;
  orgSlug: string;
}): {
  events: Ref<ObservabilityEvent[]>;
  streaming: Ref<boolean>;
  reloadHistory: () => Promise<void>;
  cleanup: () => void;
}
```

### Merge and Dedupe Logic

1. **History fetch**: `GET /jobs/:id/events` returns rows from `public.observability_events` with `{ id, created_at }`.
2. **Live SSE**: `GET /observability/stream?conversationId=...` pushes in-memory events with `{ hook_event_type, timestamp }` and NO `id`/`created_at`.
3. **Dedupe key**: History events use `db:{id}`. Live events use `live:{hook_event_type}:{timestamp}`. A `Set<string>` tracks seen keys.
4. **Connected wrapper filter**: The SSE controller emits a `{event_type:"connected"}` wrapper that must be ignored (it has no `hook_event_type` or `id`).
5. **Sort**: Events are sorted by `created_at` after each add. Live events get `created_at` backfilled from `timestamp`.

### Lifecycle

- On mount: fetch history, then open SSE stream.
- On job change: call `cleanup()` to close the EventSource and clear state.
- On unmount: call `cleanup()`.

## 6. HITL Review Modal

`LegalJobReviewModal.vue` opens when a user clicks an `awaiting_review` job. It renders the review payload from the API.

### Structure

1. **Documents section**: Tab strip for multi-document jobs (one tab per document). Shows name, type, and character count.
2. **Synthesis section**: Executive summary, overall risk level (with color coding), key findings (with severity tags), and recommendations.
3. **Specialist outputs section**: One `<details>` accordion per specialist. Uses a recursive `SpecialistView` renderer that walks the JSON object and renders scalars as text, arrays as bullet lists, objects as labeled sections.
4. **Reasoning accordion**: Nested inside each specialist accordion. Only shown when `reasoningSpecialistKeys` includes that specialist. Lazy-loads content on expand via `getReasoningForSpecialist()`. See the `forge-reasoning-capture` skill.
5. **Decision tabs**: Three buttons -- Approve (green), Reject (red), Modify (yellow).
6. **Feedback textarea**: Shown for reject and modify decisions.
7. **Modify mode**: When "Modify" is selected, specialist outputs switch to editable JSON textareas.
8. **Submit button**: Posts `{ context, decision: ReviewDecisionPayload }` to `POST /jobs/:id/review`.

### Review Payload Source

The review payload comes from `GET /jobs/:id` when `status === 'awaiting_review'`. The API reads the LangGraph checkpointer snapshot and returns:

```typescript
reviewPayload: {
  specialistOutputs: Record<string, unknown>;  // keyed by specialist name
  synthesis?: SynthesisOutput;
  documentsSummary: Array<{ name: string; type?: string; length: number }>;
}
```

### Decision Submission

```typescript
await legalJobsService.review(jobId, context, {
  decision: 'approve' | 'reject' | 'modify',
  feedback?: string,          // required for reject, optional for modify
  editedOutputs?: Record<string, unknown>, // required for modify
});
```

The API records the decision and re-queues the job (status -> `queued`). The worker picks it up and resumes the graph with `Command({ resume: decision })`.

## 7. Cancel Button UX

The cancel button behavior varies by job status:

- **queued, awaiting_review**: Cancel is immediate. Button shows "Cancel". Job transitions to `canceled`.
- **processing**: Cancel is deferred. Button shows "Cancel". API sets status to `cancel_requested`. The worker checks between node transitions and honors the request.
- **cancel_requested**: Button is disabled or shows "Cancellation requested..." as a muted label.
- **completed, failed, canceled**: No cancel button shown.

## 8. HTTP Service Layer (legalJobsService.ts)

The service is a singleton object (not a class) exporting typed methods:

```typescript
export const legalJobsService = {
  baseUrl: FORGE_API_URL,

  async listJobs(orgSlug, opts?): Promise<AgentJobRow[]>,
  async getJob(id, orgSlug): Promise<AgentJobRow>,
  async getJobEvents(id, orgSlug): Promise<ObservabilityEvent[]>,
  async enqueueJsonJob(context, content): Promise<{ jobId, conversationId, status }>,
  async uploadFile(context, file, capabilitySlug?): Promise<{ jobId, conversationId, status }>,
  async uploadFiles(context, files, capabilitySlug?): Promise<{ jobId, conversationId, status }>,
  async review(jobId, context, decision): Promise<{ jobId, status }>,
  async cancelJob(jobId, orgSlug): Promise<void>,
  openEventStream(conversationId): EventSource,
  async getReasoningForJob(jobId, orgSlug): Promise<string[]>,
  async getReasoningForSpecialist(jobId, orgSlug, specialistKey): Promise<{ thinkingContent, ... }>,
  async getCapabilityModels(capabilitySlug): Promise<CapabilityModelConfigRow[]>,
  async putCapabilityModel(capabilitySlug, role, provider, model): Promise<CapabilityModelConfigRow>,
};
```

### Key Types

```typescript
interface ExecutionContextLike {
  orgSlug: string; userId: string; conversationId: string;
  agentSlug: string; agentType: string; provider: string; model: string;
}

interface ObservabilityEvent {
  id?: number;                  // DB primary key (history events)
  hook_event_type: string;      // e.g. 'agent.node.started'
  status?: string | null;
  message?: string | null;
  step?: string | null;
  progress?: number | null;
  payload?: unknown;
  created_at?: string;          // ISO timestamp (history)
  timestamp?: number;           // Unix ms (live SSE)
}
```

### URL resolution

The `FORGE_API_URL` is read from `import.meta.env.VITE_FORGE_API_URL` with fallback to `http://localhost:5200`. The `getJob()` method resolves relative `originalFileUrl` paths to absolute URLs against the API host.

## Scaffolding Checklist

When building a new workflow frontend:

1. Create `apps/forge/web/src/views/agents/{domain}/` directory.
2. Create `legalJobsService.ts` equivalent with typed methods for all API endpoints.
3. Create `composables/useJobEventStream.ts` (copy the dedupe + merge logic verbatim).
4. Create `composables/useWorkflowPresentation.ts` (copy, change agent slug).
5. Create `composables/useJobModalRoute.ts` for URL-synced modal state.
6. Create `components/JobActivityList.vue` with polling, status icons, and in-row tickers.
7. Create `components/JobDetailModal.vue` with stage ladder and report rendering.
8. Create `components/StageLadder.vue` (reusable as-is with StageState[]).
9. Create `components/{Domain}ReviewModal.vue` with decision tabs and specialist rendering.
10. Create `components/OnboardDocumentModal.vue` if the workflow supports file uploads.
11. Create the workspace view that wires activity list + modals.
12. Register the route in the Forge web router.
