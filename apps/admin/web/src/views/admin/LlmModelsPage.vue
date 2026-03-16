<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>LLM Models</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading models...</p>
      </div>

      <div class="empty-state" v-else-if="models.length === 0">
        <ion-icon :icon="hardwareChipOutline" />
        <h3>No Models Configured</h3>
        <p>Model configuration will appear here once available.</p>
      </div>

      <div v-else class="master-detail-container">
        <!-- Master: Provider List -->
        <div class="master-panel">
          <div class="stats-banner">
            <div class="stat">
              <span class="stat-value">{{ providers.length }}</span>
              <span class="stat-label">Providers</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ models.length }}</span>
              <span class="stat-label">Models</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ enabledCount }}</span>
              <span class="stat-label">Enabled</span>
            </div>
          </div>

          <ion-list class="provider-list">
            <ion-item
              v-for="p in providers"
              :key="p.name"
              button
              @click="selectProvider(p.name)"
              :class="{ 'selected-provider': selectedProvider === p.name }"
            >
              <ion-label>
                <h2>{{ p.name }}</h2>
                <p>{{ p.modelCount }} model{{ p.modelCount !== 1 ? 's' : '' }} &middot; {{ p.usageCount.toLocaleString() }} calls</p>
              </ion-label>
              <ion-badge slot="end" :color="p.enabledCount === p.modelCount ? 'success' : 'medium'">
                {{ p.enabledCount }}/{{ p.modelCount }}
              </ion-badge>
            </ion-item>
          </ion-list>
        </div>

        <!-- Detail: Models for selected provider -->
        <div class="detail-panel" v-if="selectedProvider">
          <div class="provider-header">
            <h3>{{ selectedProvider }}</h3>
            <span class="provider-subtitle">{{ selectedModels.length }} model{{ selectedModels.length !== 1 ? 's' : '' }}</span>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Context</th>
                  <th>Input $/1k</th>
                  <th>Output $/1k</th>
                  <th>Usage</th>
                  <th>Last Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="model in selectedModels" :key="model.id">
                  <td>
                    <div class="model-name">{{ model.displayName }}</div>
                    <div class="model-slug mono">{{ model.slug }}</div>
                  </td>
                  <td class="mono">{{ formatContext(model.contextWindow) }}</td>
                  <td class="mono">${{ model.inputCostPer1k.toFixed(4) }}</td>
                  <td class="mono">${{ model.outputCostPer1k.toFixed(4) }}</td>
                  <td>{{ model.usageCount.toLocaleString() }}</td>
                  <td>{{ model.lastUsedAt ? formatDate(model.lastUsedAt) : '-' }}</td>
                  <td>
                    <span :class="['status-badge', model.enabled ? 'status-active' : 'status-inactive']">
                      {{ model.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Empty detail state -->
        <div class="detail-panel empty-details" v-else>
          <div class="empty-state">
            <ion-icon :icon="hardwareChipOutline" size="large" color="medium" />
            <h3>Select a provider</h3>
            <p>Choose a provider from the list to view its models</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonButton, IonIcon, IonSpinner, IonList, IonItem, IonLabel, IonBadge, toastController } from '@ionic/vue';
import { refreshOutline, hardwareChipOutline } from 'ionicons/icons';
import { adminApiService, type LlmModel } from '@/services/admin-api.service';
import { useLlmAnalyticsStore } from '@/stores/llm-analytics.store';

const store = useLlmAnalyticsStore();
const loading = ref(false);
const models = ref<LlmModel[]>([]);
const selectedProvider = ref<string | null>(null);

interface ProviderSummary {
  name: string;
  modelCount: number;
  enabledCount: number;
  usageCount: number;
}

const providers = computed<ProviderSummary[]>(() => {
  const map = new Map<string, ProviderSummary>();
  for (const m of models.value) {
    const existing = map.get(m.provider);
    if (existing) {
      existing.modelCount++;
      if (m.enabled) existing.enabledCount++;
      existing.usageCount += m.usageCount;
    } else {
      map.set(m.provider, {
        name: m.provider,
        modelCount: 1,
        enabledCount: m.enabled ? 1 : 0,
        usageCount: m.usageCount,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.usageCount - a.usageCount);
});

const enabledCount = computed(() => models.value.filter((m) => m.enabled).length);

const selectedModels = computed(() => {
  if (!selectedProvider.value) return [];
  return models.value
    .filter((m) => m.provider === selectedProvider.value)
    .sort((a, b) => b.usageCount - a.usageCount);
});

const selectProvider = (name: string) => {
  selectedProvider.value = name;
};

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();

const formatContext = (tokens: number) => {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return tokens.toLocaleString();
};

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getLlmModels();
    models.value = data;
    store.setModels(data);
    // Auto-select first provider
    if (providers.value.length > 0 && !selectedProvider.value) {
      selectedProvider.value = providers.value[0].name;
    }
  } catch (_err) {
    const msg = 'Failed to load LLM models';
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
}

/* Master-Detail Layout */
.master-detail-container {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  gap: 1rem;
  padding: 1rem;
}

.master-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.stats-banner {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #4a6fa1 0%, #2c4a7c 100%);
  border-radius: 8px;
  color: white;
}

.stats-banner .stat {
  text-align: center;
  flex: 1;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.7rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.provider-list {
  background: transparent;
  padding: 0;
}

.provider-list ion-item {
  cursor: pointer;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  --background: var(--ion-background-color);
  --border-color: var(--ion-border-color, var(--ion-color-light-shade));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  transition: all 0.2s ease;
}

.provider-list ion-item:hover {
  --background: var(--ion-color-step-50, var(--ion-color-light-tint));
  transform: translateX(2px);
}

.provider-list ion-item.selected-provider {
  --background: var(--ion-color-primary);
  --color: white;
  border-color: var(--ion-color-primary-shade);
  box-shadow: 0 2px 8px rgba(var(--ion-color-primary-rgb), 0.3);
}

.provider-list ion-item.selected-provider ion-label h2,
.provider-list ion-item.selected-provider ion-label p {
  color: white;
}

/* Detail Panel */
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding: 1rem;
}

.detail-panel.empty-details {
  justify-content: center;
  align-items: center;
}

.provider-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.provider-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.provider-subtitle {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
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
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.85rem;
  color: var(--ion-text-color);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.model-name {
  font-weight: 500;
}

.model-slug {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  margin-top: 0.1rem;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-inactive {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}

@media (max-width: 992px) {
  .master-detail-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .master-panel {
    max-height: 40vh;
  }
}
</style>
