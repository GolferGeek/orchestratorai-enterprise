<template>
  <section class="memos-panel">
    <header class="memos-header">
      <h3>Deal Memos</h3>
      <span v-if="memos.length > 0" class="memos-count"
        >{{ memos.length }} {{ memos.length === 1 ? 'memo' : 'memos' }}</span
      >
    </header>

    <div v-if="loading" class="memos-empty">Loading…</div>
    <div v-else-if="error" class="memos-error">{{ error }}</div>
    <div v-else-if="memos.length === 0" class="memos-empty">
      No deal memos yet. Use "Generate Deal Memo" above to draft one.
    </div>
    <ul v-else class="memos-list">
      <li v-for="memo in memos" :key="memo.id" class="memo-row">
        <button class="memo-link" @click="openMemo(memo.id)">
          <div class="memo-row-main">
            <span class="memo-structure" :class="`structure-${dealStructure(memo)}`">
              {{ structureLabel(dealStructure(memo)) }}
            </span>
            <span class="memo-status" :class="`status-${memo.status}`">{{
              memo.status
            }}</span>
          </div>
          <div class="memo-row-sub">
            <span class="memo-date">{{ formatDate(memo.queued_at) }}</span>
            <span class="memo-id">{{ memo.id.slice(0, 8) }}</span>
          </div>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  legalJobsService,
  type AgentJobRow,
  type DealStructure,
} from '../legalJobsService';

const props = defineProps<{
  parentJobId: string;
  orgSlug: string;
  /** Bumping this number forces a re-fetch (parent emits after queueing a memo). */
  refreshToken?: number;
}>();

const router = useRouter();
const memos = ref<AgentJobRow[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    memos.value = await legalJobsService.listDealMemosForRoom(
      props.orgSlug,
      props.parentJobId,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function dealStructure(row: AgentJobRow): DealStructure | 'unknown' {
  const data = row.input?.data as Record<string, unknown> | undefined;
  const value = data?.dealStructure as DealStructure | undefined;
  return value ?? 'unknown';
}

function structureLabel(s: DealStructure | 'unknown'): string {
  switch (s) {
    case 'stock-purchase':
      return 'Stock Purchase';
    case 'asset-purchase':
      return 'Asset Purchase';
    case 'merger':
      return 'Merger';
    default:
      return 'Memo';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function openMemo(memoJobId: string): void {
  void router.push(
    `/forge/agents/legal-department/dd/${encodeURIComponent(props.parentJobId)}/memo/${encodeURIComponent(memoJobId)}`,
  );
}

/**
 * Periodic refresh so memo status updates (processing → awaiting_review →
 * completed) surface in the panel without the user having to reload the
 * DD Room view. The poll is short enough to feel live but long enough to
 * leave room for the memo workspace's own SSE stream to dominate when the
 * user is focused on a single memo.
 */
const POLL_INTERVAL_MS = 8000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    void load();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(() => {
  void load();
  startPolling();
});

onUnmounted(stopPolling);

watch(
  () => [props.parentJobId, props.orgSlug, props.refreshToken],
  () => {
    void load();
    // Reset the timer on prop changes so the next tick fires from "now".
    startPolling();
  },
);
</script>

<style scoped>
.memos-panel {
  margin: 16px;
  padding: 12px 16px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  background: var(--ion-color-step-50);
}

.memos-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.memos-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.memos-count {
  font-size: 0.78em;
  color: var(--ion-color-medium);
}

.memos-empty {
  font-size: 0.85em;
  color: var(--ion-color-medium);
  padding: 8px 0;
}

.memos-error {
  font-size: 0.85em;
  color: var(--ion-color-danger);
  padding: 8px 0;
}

.memos-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.memo-row {
  border-radius: 6px;
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-100);
}

.memo-link {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ion-text-color);
  border-radius: 6px;
}

.memo-link:hover {
  background: var(--ion-color-step-100);
}

.memo-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.memo-structure {
  font-weight: 600;
  font-size: 0.88em;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--ion-color-step-150);
  color: var(--ion-text-color);
  text-transform: none;
}

.memo-structure.structure-stock-purchase {
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-shade);
}
.memo-structure.structure-asset-purchase {
  background: var(--ion-color-tertiary-tint);
  color: var(--ion-color-tertiary-shade);
}
.memo-structure.structure-merger {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}

.memo-status {
  font-size: 0.78em;
  text-transform: capitalize;
  color: var(--ion-color-medium);
}
.memo-status.status-completed {
  color: var(--ion-color-success);
  font-weight: 600;
}
.memo-status.status-failed {
  color: var(--ion-color-danger);
  font-weight: 600;
}
.memo-status.status-awaiting_review {
  color: var(--ion-color-warning);
  font-weight: 600;
}
.memo-status.status-processing,
.memo-status.status-queued {
  color: var(--ion-color-primary);
}

.memo-row-sub {
  display: flex;
  gap: 12px;
  font-size: 0.78em;
  color: var(--ion-color-medium);
}

.memo-id {
  font-family: var(--ion-font-family, monospace);
}
</style>
