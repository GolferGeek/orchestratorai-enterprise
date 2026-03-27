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

      <!-- Filters -->
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

      <div class="empty-state" v-if="!loading && filteredUsage.length === 0">
        <ion-icon :icon="analyticsOutline" />
        <h3>No Usage Data</h3>
        <p>LLM usage data will appear here once requests are made.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading usage data...</p>
      </div>
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonPage, IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { refreshOutline, analyticsOutline } from 'ionicons/icons';
import { adminApiService, type LlmUsageSummary } from '@/services/admin-api.service';
import { useLlmAnalyticsStore } from '@/stores/llm-analytics.store';

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
    const msg = 'Failed to load LLM usage data';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
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
  gap: 1rem;
  margin-bottom: 1.5rem;
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

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow: hidden;
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

.mono {
  font-family: monospace;
  font-size: 0.85rem;
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
