---
name: forge-reasoning-capture
description: Reasoning capture and display patterns for LangGraph workflows with thinking-capable models
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Forge Reasoning Capture Pattern

This skill covers the end-to-end pattern for capturing, storing, and displaying LLM reasoning (thinking content) in async LangGraph workflows. It bridges the LLM service's thinking capture, the observability event pipeline, the REST API endpoints, and the frontend rendering.

## Canonical Reference Files

- **LLM service (thinking capture)**: `packages/planes/llm/fine-control/llm.service.ts` -- `callLLMMaybeWithReasoning()` helper and `emitLlmObservabilityEvent()` for thinking events
- **Repository (reasoning queries)**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts` -- `findReasoningForSpecialist()`, `listSpecialistKeysWithReasoning()`
- **Controller (reasoning endpoint)**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts` -- `GET /jobs/:id/reasoning`
- **Frontend service (reasoning fetch)**: `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts` -- `getReasoningForJob()`, `getReasoningForSpecialist()`
- **Thinking states composable**: `apps/forge/web/src/views/agents/legal-department/composables/useThinkingStates.ts`
- **Stage ladder (thinking overlay)**: `apps/forge/web/src/views/agents/legal-department/components/StageLadder.vue`
- **Review modal (reasoning accordion)**: `apps/forge/web/src/views/agents/legal-department/components/LegalJobReviewModal.vue`

## 1. callLLMMaybeWithReasoning Helper

The LLM service provides a helper that automatically captures thinking content when the model supports extended thinking (e.g., Codex with `thinking` block type). The helper:

1. Calls the LLM with the user's prompt.
2. If the response includes `thinking` content blocks, extracts `thinkingContent`, `thinkingDurationMs`, and `thinkingTokenCount`.
3. Writes these fields to the `public.llm_usage` row for the call.
4. Emits two observability events via `emitLlmObservabilityEvent()`:
   - `agent.llm.thinking_started` -- when the model begins reasoning
   - `agent.llm.thinking_completed` -- when the model transitions to output generation

Both events carry `payload.callerName` (e.g., `legal-department:contract-agent`) which links the thinking event to the correct workflow stage.

### llm_usage Table Columns

The reasoning data is stored in existing `public.llm_usage` columns:

| Column | Type | Description |
|--------|------|-------------|
| `thinking_content` | TEXT | The full thinking/reasoning text from the model |
| `thinking_duration_ms` | INTEGER | Duration of the thinking phase in milliseconds |
| `thinking_token_count` | INTEGER | Number of tokens in the thinking content |
| `agent_name` | TEXT | The callerName (e.g., `legal-department:contract-agent`) |
| `conversation_id` | TEXT | The job's conversation_id, used for cross-schema joins |

## 2. Stage Ladder Thinking Overlay

The `useThinkingStates` composable derives a per-stage thinking sub-state from the raw observability event stream:

```typescript
export type ThinkingPhase = 'reasoning' | 'writing';
export type ThinkingStateMap = Record<string, ThinkingPhase>;

export function useThinkingStates(
  events: Ref<ObservabilityEvent[]>,
  stages: Ref<StageState[]>,
): Ref<ThinkingStateMap>
```

### callerName to Stage ID Mapping

The composable maps `payload.callerName` from thinking events to stage IDs:

```typescript
// Strip 'legal-department:' prefix, then optional '-agent' suffix
// legal-department:contract-agent -> contract
// legal-department:synthesis      -> synthesize (exception)
// legal-department:report-generation -> report (exception)
// legal-department:real-estate-agent -> real_estate (hyphens to underscores)
```

### Lifecycle

1. `agent.llm.thinking_started` event -> set stage to `'reasoning'` (unless already `'writing'`)
2. `agent.llm.thinking_completed` event -> set stage to `'writing'` (model finished thinking, now outputting)
3. Stage completes (via normal walker path) -> overlay is suppressed (only shown for `'active'` stages)

### StageLadder Rendering

The `StageLadder.vue` component accepts an optional `thinkingStates` prop and renders:

- Active stage with `reasoning` phase: brain emoji icon + `"reasoning..."` badge
- Active stage with `writing` phase: pen emoji icon + `"writing..."` badge
- Normal active stage (no thinking): spinner icon

```vue
<span class="stage-icon">{{ icon(stage, thinkingStates?.[stage.id]) }}</span>
<div v-if="thinkingStates?.[stage.id] && stage.state === 'active'" class="stage-thinking-badge">
  {{ thinkingPhaseLabel(thinkingStates[stage.id]) }}
</div>
```

## 3. Review Modal Reasoning Accordion

Inside the HITL review modal, each specialist's `<details>` accordion can contain a nested reasoning accordion:

```vue
<details
  v-if="reasoningSpecialistKeys.includes(key)"
  class="reasoning-accordion"
  @toggle="(e) => e.target.open && onReasoningExpand(key)"
>
  <summary class="reasoning-accordion-summary">
    <span class="reasoning-icon">brain emoji</span> Reasoning
  </summary>
  <div class="reasoning-body">
    <div v-if="reasoningLoading[key]" class="reasoning-loading">Loading reasoning...</div>
    <pre v-else-if="reasoningContentCache[key]" class="reasoning-pre">{{ reasoningContentCache[key] }}</pre>
  </div>
</details>
```

### Lazy Loading

Reasoning content is NOT fetched upfront. Instead:

1. On modal open, call `getReasoningForJob(jobId, orgSlug)` to get the list of specialist keys that have reasoning.
2. Store in `reasoningSpecialistKeys: string[]`. Only specialists in this list render the accordion.
3. When the user expands a reasoning accordion (`@toggle`), call `getReasoningForSpecialist(jobId, orgSlug, specialistKey)`.
4. Cache the result in `reasoningContentCache: Record<string, string>` so re-toggling doesn't re-fetch.

```typescript
const reasoningSpecialistKeys = ref<string[]>([]);
const reasoningContentCache = ref<Record<string, string>>({});
const reasoningLoading = ref<Record<string, boolean>>({});

// On modal open
reasoningSpecialistKeys.value = await legalJobsService.getReasoningForJob(jobId, orgSlug);

// On accordion expand
async function onReasoningExpand(key: string) {
  if (reasoningContentCache.value[key] !== undefined) return;
  reasoningLoading.value[key] = true;
  const result = await legalJobsService.getReasoningForSpecialist(jobId, orgSlug, key);
  reasoningContentCache.value[key] = result.thinkingContent;
  reasoningLoading.value[key] = false;
}
```

## 4. REST API Reasoning Endpoint

The controller exposes a dual-mode `GET /jobs/:id/reasoning` endpoint:

### Probe Mode (no specialistKey)

```
GET /jobs/:id/reasoning?orgSlug=acme
Response: { jobId: "...", specialistKeys: ["contract", "compliance", "privacy"] }
```

Returns the list of specialist keys that have captured reasoning. Empty array when the model is not reasoning-capable.

### Fetch Mode (with specialistKey)

```
GET /jobs/:id/reasoning?orgSlug=acme&specialistKey=contract
Response: {
  jobId: "...",
  specialistKey: "contract",
  thinkingContent: "Let me analyze this contract clause by clause...",
  thinkingDurationMs: 4523,
  thinkingTokenCount: 1847
}
```

Returns 404 when no reasoning was captured for that specialist.

### Repository Queries

Both queries use cross-schema joins from `public.llm_usage` to `{domain}.agent_jobs`:

```sql
-- Probe: list specialist keys
SELECT DISTINCT u.agent_name
FROM public.llm_usage u
JOIN {schema}.agent_jobs j ON j.conversation_id = u.conversation_id
WHERE j.id = $1 AND j.org_slug = $2
  AND u.thinking_content IS NOT NULL
  AND u.agent_name LIKE '{domain}:%'

-- Fetch: get thinking content
SELECT u.thinking_content, u.thinking_duration_ms, u.thinking_token_count
FROM public.llm_usage u
JOIN {schema}.agent_jobs j ON j.conversation_id = u.conversation_id
WHERE j.id = $1 AND j.org_slug = $2
  AND u.thinking_content IS NOT NULL
  AND (u.agent_name = $3 OR u.agent_name = $4)  -- with and without -agent suffix
ORDER BY u.started_at DESC
LIMIT 1
```

The `agent_name` column in `llm_usage` stores the callerName in the format `{domain}:{specialistKey}-agent` or `{domain}:{specialistKey}`. The query tries both patterns.

## Scaffolding Checklist

When adding reasoning capture to a new workflow:

1. Ensure all LLM calls in graph nodes use `callLLMMaybeWithReasoning()` with a proper `callerName` in the format `{domain}:{nodeKey}` or `{domain}:{nodeKey}-agent`.
2. Add `findReasoningForSpecialist(jobId, orgSlug, specialistKey)` and `listSpecialistKeysWithReasoning(jobId, orgSlug)` to the repository with cross-schema joins.
3. Add `GET /jobs/:id/reasoning` endpoint to the controller with probe and fetch modes.
4. Add `getReasoningForJob()` and `getReasoningForSpecialist()` to the frontend service.
5. Create a `useThinkingStates` composable mapping callerNames to stage IDs (update the exceptions map for your domain).
6. Pass `thinkingStates` prop to the StageLadder component.
7. Add reasoning accordion to the review modal with lazy-load on expand.
