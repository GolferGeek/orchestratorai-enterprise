<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>LLM Usage</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Summary Cards -->
      <div class="stats-banner" v-if="usageData.length > 0">
        <div class="stat">
          <span class="stat-value">{{ totalRequests.toLocaleString() }}</span>
          <span class="stat-label">Total Requests</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ (totalTokens / 1000).toFixed(1) }}k</span>
          <span class="stat-label">Total Tokens</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ uniqueProducts }}</span>
          <span class="stat-label">Agents</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ uniqueModels }}</span>
          <span class="stat-label">Models</span>
        </div>
      </div>

      <!-- Filters (legacy aggregated view) -->
      <div class="filter-bar">
        <select v-model="filterProduct" class="filter-select">
          <option value="">All Agents</option>
          <option v-for="p in productOptions" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterModel" class="filter-select">
          <option value="">All Models</option>
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>

      <!-- Usage Table -->
      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Requests</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Total Tokens</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in filteredUsage" :key="idx">
              <td><span class="badge badge-product">{{ row.product }}</span></td>
              <td>{{ row.provider }}</td>
              <td class="mono">{{ row.model }}</td>
              <td>{{ row.totalRequests.toLocaleString() }}</td>
              <td>{{ row.totalInputTokens.toLocaleString() }}</td>
              <td>{{ row.totalOutputTokens.toLocaleString() }}</td>
              <td>{{ row.totalTokens.toLocaleString() }}</td>
              <td class="mono">{{ formatDate(row.periodEnd) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && filteredUsage.length === 0 && usageRows.length === 0">
        <ion-icon :icon="analyticsOutline" />
        <h3>No Usage Data</h3>
        <p>LLM usage data will appear here once requests are made.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading usage data...</p>
      </div>

      <!-- ==================== Per-Row Detail Section ==================== -->
      <div class="section-divider">
        <h3>Detailed Usage Log</h3>
      </div>

      <!-- Detail Filters -->
      <div class="filter-bar filter-bar--detail">
        <input
          v-model="detailFilters.orgSlug"
          class="filter-input"
          placeholder="Org slug"
          @input="onDetailFilterChange"
        />
        <input
          v-model="detailFilters.agentName"
          class="filter-input"
          placeholder="Agent name"
          @input="onDetailFilterChange"
        />
        <select v-model="detailFilters.provider" class="filter-select" @change="onDetailFilterChange">
          <option value="">All Providers</option>
          <option value="anthropic">anthropic</option>
          <option value="openai">openai</option>
          <option value="google">google</option>
          <option value="azure">azure</option>
        </select>
        <input
          v-model="detailFilters.model"
          class="filter-input"
          placeholder="Model"
          @input="onDetailFilterChange"
        />
        <input
          v-model="detailFilters.from"
          class="filter-input"
          type="date"
          @change="onDetailFilterChange"
        />
        <input
          v-model="detailFilters.to"
          class="filter-input"
          type="date"
          @change="onDetailFilterChange"
        />
        <select v-model="detailFilters.hasReasoning" class="filter-select" @change="onDetailFilterChange">
          <option value="">All</option>
          <option value="true">With Reasoning</option>
          <option value="false">Without Reasoning</option>
        </select>
      </div>

      <!-- Detail Table -->
      <div class="table-container" v-if="!detailLoading">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-expand"></th>
              <th>Org</th>
              <th>Workflow</th>
              <th>Node</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Input</th>
              <th>Output</th>
              <th>Total</th>
              <th>Thinking (ms)</th>
              <th>Reasoning</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in usageRows" :key="row.id">
              <tr :class="{ 'row--expanded': expandedRowId === row.id }">
                <td class="col-expand">
                  <button
                    v-if="row.hasReasoning"
                    class="expand-btn"
                    :aria-label="expandedRowId === row.id ? 'Collapse' : 'Expand'"
                    @click="toggleRowExpansion(row.id)"
                  >
                    {{ expandedRowId === row.id ? '▲' : '▼' }}
                  </button>
                </td>
                <td class="mono">{{ row.orgSlug }}</td>
                <td>
                  <span
                    class="badge badge-product"
                    :title="row.agentName ?? undefined"
                  >{{ row.workflowSlug ?? row.agentName }}</span>
                </td>
                <td class="node-cell">{{ row.nodeName ?? '—' }}</td>
                <td>{{ row.provider }}</td>
                <td class="mono">{{ row.model }}</td>
                <td>{{ row.inputTokens.toLocaleString() }}</td>
                <td>{{ row.outputTokens.toLocaleString() }}</td>
                <td>{{ row.totalTokens.toLocaleString() }}</td>
                <td class="mono">{{ row.thinkingDurationMs != null ? row.thinkingDurationMs.toLocaleString() : '—' }}</td>
                <td>
                  <span v-if="row.hasReasoning" class="badge badge-reasoning">reasoning</span>
                </td>
                <td class="mono">{{ formatDate(row.createdAt) }}</td>
              </tr>
              <!-- Expansion row -->
              <tr v-if="expandedRowId === row.id" class="expansion-row">
                <td colspan="12" class="expansion-cell">
                  <div v-if="reasoningLoadingId === row.id" class="reasoning-loading">
                    <ion-spinner name="dots" />
                    <span>Loading reasoning...</span>
                  </div>
                  <pre
                    v-else-if="reasoningCache[row.id]"
                    class="reasoning-pre"
                  >{{ reasoningCache[row.id].thinkingContent }}</pre>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <div class="table-footer" v-if="usageRows.length > 0">
          <span class="row-count">{{ usageRows.length }} rows</span>
          <button class="load-more-btn" @click="loadMoreDetailRows" :disabled="detailLoading">
            Load more
          </button>
        </div>
      </div>

      <div class="empty-state" v-if="!detailLoading && usageRows.length === 0">
        <ion-icon :icon="analyticsOutline" />
        <h3>No Detail Rows</h3>
        <p>Adjust filters or wait for new requests.</p>
      </div>

      <div class="loading-state" v-if="detailLoading">
        <ion-spinner />
        <p>Loading detail rows...</p>
      </div>
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { IonPage, IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { refreshOutline, analyticsOutline } from 'ionicons/icons';
import {
  adminApiService,
  type LlmUsageSummary,
  type LlmUsageRow,
  type LlmUsageReasoning,
  type LlmUsageListFilters,
} from '@/services/admin-api.service';
import { useLlmAnalyticsStore } from '@/stores/llm-analytics.store';

// ===================== Aggregated (legacy) section =====================

const store = useLlmAnalyticsStore();
const loading = ref(false);
const usageData = ref<LlmUsageSummary[]>([]);
const filterProduct = ref('');
const filterModel = ref('');

const productOptions = computed(() => [...new Set(usageData.value.map((r) => r.product))].sort());
const modelOptions = computed(() => [...new Set(usageData.value.map((r) => r.model))].sort());

const filteredUsage = computed(() => {
  return usageData.value
    .filter((row) => {
      if (filterProduct.value && row.product !== filterProduct.value) return false;
      if (filterModel.value && row.model !== filterModel.value) return false;
      return true;
    })
    .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));
});

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const totalRequests = computed(() =>
  filteredUsage.value.reduce((sum, r) => sum + r.totalRequests, 0),
);
const totalTokens = computed(() =>
  filteredUsage.value.reduce((sum, r) => sum + r.totalTokens, 0),
);
const uniqueProducts = computed(() => new Set(filteredUsage.value.map((r) => r.product)).size);
const uniqueModels = computed(() => new Set(filteredUsage.value.map((r) => r.model)).size);

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getLlmUsage();
    usageData.value = data;
    store.setUsageData(data);
  } catch (_err) {
    console.error('[LlmUsagePage] fetchUsage failed', _err);
    const msg = 'Failed to load LLM usage data';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
  // Also refresh the detail section
  await fetchDetailRows();
};

// ===================== Detail (per-row) section =====================

const detailLoading = ref(false);
const usageRows = ref<LlmUsageRow[]>([]);
const expandedRowId = ref<string | null>(null);
const reasoningLoadingId = ref<string | null>(null);
const reasoningCache = reactive<Record<string, LlmUsageReasoning>>({});
const detailOffset = ref(0);
const DETAIL_LIMIT = 50;

const detailFilters = reactive<{
  orgSlug: string;
  agentName: string;
  provider: string;
  model: string;
  from: string;
  to: string;
  hasReasoning: string;
}>({
  orgSlug: '',
  agentName: '',
  provider: '',
  model: '',
  from: '',
  to: '',
  hasReasoning: '',
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onDetailFilterChange() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    detailOffset.value = 0;
    usageRows.value = [];
    fetchDetailRows();
  }, 300);
}

function buildDetailFilters(): LlmUsageListFilters {
  const filters: LlmUsageListFilters = {
    limit: DETAIL_LIMIT,
    offset: detailOffset.value,
  };
  if (detailFilters.orgSlug) filters.orgSlug = detailFilters.orgSlug;
  if (detailFilters.agentName) filters.agentName = detailFilters.agentName;
  if (detailFilters.provider) filters.provider = detailFilters.provider;
  if (detailFilters.model) filters.model = detailFilters.model;
  if (detailFilters.from) filters.from = detailFilters.from;
  if (detailFilters.to) filters.to = detailFilters.to;
  if (detailFilters.hasReasoning === 'true') filters.hasReasoning = true;
  else if (detailFilters.hasReasoning === 'false') filters.hasReasoning = false;
  return filters;
}

const fetchDetailRows = async () => {
  detailLoading.value = true;
  try {
    const rows = await adminApiService.listLlmUsage(buildDetailFilters());
    if (detailOffset.value === 0) {
      usageRows.value = rows;
    } else {
      usageRows.value = [...usageRows.value, ...rows];
    }
  } catch (_err) {
    console.error('[LlmUsagePage] fetchDetailRows failed', _err);
    const msg = 'Failed to load usage detail rows';
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    detailLoading.value = false;
  }
};

const loadMoreDetailRows = async () => {
  detailOffset.value += DETAIL_LIMIT;
  await fetchDetailRows();
};

const toggleRowExpansion = async (rowId: string) => {
  if (expandedRowId.value === rowId) {
    expandedRowId.value = null;
    return;
  }

  expandedRowId.value = rowId;

  // If already cached, do not refetch
  if (reasoningCache[rowId]) {
    return;
  }

  reasoningLoadingId.value = rowId;
  try {
    const reasoning = await adminApiService.getLlmUsageReasoning(rowId);
    reasoningCache[rowId] = reasoning;
  } catch (_err) {
    console.error('[LlmUsagePage] getLlmUsageReasoning failed', _err);
    const msg = 'Failed to load reasoning content';
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    reasoningLoadingId.value = null;
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.stats-banner {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #4a6fa1 0%, #2c4a7c 100%);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  color: white;
}

.stats-banner .stat {
  text-align: center;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.8rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.filter-bar--detail {
  align-items: center;
}

.filter-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  background: var(--ion-item-background, white);
  font-size: 0.9rem;
  color: var(--ion-text-color, #333);
  cursor: pointer;
}

.filter-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  background: var(--ion-item-background, white);
  font-size: 0.9rem;
  color: var(--ion-text-color, #333);
  min-width: 120px;
}

.section-divider {
  margin: 2rem 0 1rem;
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding-top: 1rem;
}

.section-divider h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow: hidden;
  margin-bottom: 1rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.9rem;
  color: var(--ion-text-color);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.row--expanded td {
  background: var(--ion-color-light, #f4f5f8);
}

.col-expand {
  width: 2rem;
  padding: 0.5rem !important;
}

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #888);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: background 0.15s;
}

.expand-btn:hover {
  background: var(--ion-color-light-shade, #e0e0e0);
}

.expansion-row td {
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.expansion-cell {
  padding: 0 !important;
}

.reasoning-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  color: var(--dark-text-muted, #888);
  font-size: 0.9rem;
}

.reasoning-pre {
  margin: 0;
  padding: 1rem 1.5rem;
  font-family: monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--ion-color-light, #f4f5f8);
  max-height: 400px;
  overflow-y: auto;
  color: var(--ion-text-color, #333);
}

.mono {
  font-family: monospace;
  font-size: 0.85rem;
}

.node-cell {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
  font-family: monospace;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-product {
  background: rgba(59, 130, 246, 0.15);
  color: var(--ion-color-primary, #2c4a7c);
}

.badge-reasoning {
  background: rgba(139, 92, 246, 0.15);
  color: #5b21b6;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.row-count {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.load-more-btn {
  padding: 0.4rem 1rem;
  border: 1px solid var(--ion-color-primary, #2c4a7c);
  border-radius: 6px;
  background: none;
  color: var(--ion-color-primary, #2c4a7c);
  font-size: 0.85rem;
  cursor: pointer;
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}
</style>
