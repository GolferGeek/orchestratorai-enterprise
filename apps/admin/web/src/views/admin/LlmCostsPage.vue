<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>LLM Costs</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="stats-banner" v-if="costs.length > 0">
        <div class="stat">
          <span class="stat-value">${{ totalCost.toFixed(4) }}</span>
          <span class="stat-label">Total Cost (USD)</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ uniqueOrgs }}</span>
          <span class="stat-label">Organizations</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ uniqueProducts }}</span>
          <span class="stat-label">Products</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <select v-model="filterProduct" class="filter-select">
          <option value="">All Products</option>
          <option v-for="p in productOptions" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterOrg" class="filter-select">
          <option value="">All Orgs</option>
          <option v-for="o in orgOptions" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>

      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Organization</th>
              <th>Model</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Est. Cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in filteredCosts" :key="idx">
              <td><span class="badge badge-product">{{ row.product }}</span></td>
              <td class="mono">{{ row.orgSlug }}</td>
              <td class="mono">{{ row.model }}</td>
              <td>{{ row.totalInputTokens.toLocaleString() }}</td>
              <td>{{ row.totalOutputTokens.toLocaleString() }}</td>
              <td class="cost-cell">${{ row.totalEstimatedCostUsd.toFixed(4) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="filteredCosts.length > 0">
            <tr class="total-row">
              <td colspan="5"><strong>Total</strong></td>
              <td class="cost-cell"><strong>${{ totalCost.toFixed(4) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && filteredCosts.length === 0">
        <ion-icon :icon="cashOutline" />
        <h3>No Cost Data</h3>
        <p>Cost tracking data will appear here once LLM requests are made.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading cost data...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { refreshOutline, cashOutline } from 'ionicons/icons';
import { adminApiService, type LlmCostSummary } from '@/services/admin-api.service';
import { useLlmAnalyticsStore } from '@/stores/llm-analytics.store';

const store = useLlmAnalyticsStore();
const loading = ref(false);
const costs = ref<LlmCostSummary[]>([]);
const filterProduct = ref('');
const filterOrg = ref('');

const productOptions = computed(() => [...new Set(costs.value.map((r) => r.product))].sort());
const orgOptions = computed(() => [...new Set(costs.value.map((r) => r.orgSlug))].sort());

const filteredCosts = computed(() => {
  return costs.value.filter((row) => {
    if (filterProduct.value && row.product !== filterProduct.value) return false;
    if (filterOrg.value && row.orgSlug !== filterOrg.value) return false;
    return true;
  });
});

const totalCost = computed(() =>
  filteredCosts.value.reduce((sum, r) => sum + r.totalEstimatedCostUsd, 0),
);
const uniqueOrgs = computed(() => new Set(filteredCosts.value.map((r) => r.orgSlug)).size);
const uniqueProducts = computed(() => new Set(filteredCosts.value.map((r) => r.product)).size);

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getLlmCosts();
    costs.value = data;
    store.setCosts(data);
  } catch (_err) {
    const msg = 'Failed to load cost data';
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
  background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
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

.data-table tfoot td {
  border-top: 2px solid var(--ion-color-light-shade);
  border-bottom: none;
  background: var(--ion-color-light-tint);
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

.cost-cell {
  font-family: monospace;
  font-weight: 600;
  color: #10b981;
}

.total-row td {
  padding: 0.75rem 1rem;
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
