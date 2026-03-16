<template>
  <div class="tools-component">
    <div class="tools-header">
      <h3>Data Sources</h3>
      <div class="tools-stats">
        <span class="stat active">Active: {{ activeSourcesCount }}</span>
        <span class="stat">Total: {{ sources.length }}</span>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading sources...</span>
    </div>

    <div v-else-if="sources.length === 0" class="empty-state">
      No data sources configured yet.
    </div>

    <div v-else class="tools-list">
      <div
        v-for="source in sources"
        :key="source.id"
        class="tool-card"
        :class="[`tool-${source.active ? 'active' : 'disabled'}`]"
      >
        <div class="tool-header">
          <div class="tool-name-section">
            <div class="tool-name">{{ source.name }}</div>
            <div class="tool-identifier">{{ source.sourceType }} - {{ source.scopeLevel }}</div>
          </div>
          <div class="tool-status-badge" :class="[`status-${source.active ? 'active' : 'disabled'}`]">
            {{ source.active ? 'Active' : 'Disabled' }}
          </div>
        </div>

        <div class="tool-metrics">
          <div class="metric">
            <span class="metric-label">Scope Level:</span>
            <span class="metric-value">{{ source.scopeLevel }}</span>
          </div>

          <div v-if="source.domain" class="metric">
            <span class="metric-label">Domain:</span>
            <span class="metric-value">{{ source.domain }}</span>
          </div>

          <div v-if="source.lastCrawledAt" class="metric">
            <span class="metric-label">Last Crawled:</span>
            <span class="metric-value">{{ formatTime(source.lastCrawledAt) }}</span>
          </div>
          <div v-else class="metric">
            <span class="metric-label">Last Crawled:</span>
            <span class="metric-value empty">Never</span>
          </div>
        </div>

        <div v-if="source.crawlConfig" class="tool-config">
          <div class="config-header">Configuration</div>
          <div class="config-details">
            <span v-if="source.crawlConfig.url" class="config-item">
              URL: {{ truncateUrl(source.crawlConfig.url as string) }}
            </span>
            <span v-if="source.crawlConfig.frequency" class="config-item">
              Frequency: {{ source.crawlConfig.frequency }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePredictionStore } from '@/stores/predictionStore';
import { predictionDashboardService, type PredictionSource } from '@/services/predictionDashboardService';

const store = usePredictionStore();

const sources = ref<PredictionSource[]>([]);
const isLoading = computed(() => store.isLoading);

const activeSourcesCount = computed(() =>
  sources.value.filter((s) => s.active).length
);

onMounted(async () => {
  await loadSources();
});

async function loadSources() {
  store.setLoading(true);
  try {
    const response = await predictionDashboardService.listSources();
    if (response.content) {
      sources.value = response.content;
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load sources');
  } finally {
    store.setLoading(false);
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function truncateUrl(url: string): string {
  if (url.length <= 50) return url;
  return url.substring(0, 47) + '...';
}
</script>

<style scoped>
.tools-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tools-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.tools-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.tools-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.stat {
  color: #6b7280;
}

.stat.active {
  color: #10b981;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #6b7280;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid #e5e7eb;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tools-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1rem;
}

.tool-card {
  background-color: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: box-shadow 0.2s;
}

.tool-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.tool-card.tool-active {
  border-color: #10b981;
  background-color: #f0fdf4;
}

.tool-card.tool-disabled {
  border-color: #9ca3af;
  background-color: #f3f4f6;
  opacity: 0.7;
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
}

.tool-name-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tool-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
}

.tool-identifier {
  font-size: 0.75rem;
  color: #6b7280;
  font-family: monospace;
}

.tool-status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-active {
  background-color: #d1fae5;
  color: #065f46;
}

.status-disabled {
  background-color: #e5e7eb;
  color: #374151;
}

.tool-metrics {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 0.375rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.metric-label {
  color: #6b7280;
  font-weight: 500;
}

.metric-value {
  color: #111827;
  font-weight: 600;
}

.metric-value.empty {
  color: #9ca3af;
  font-style: italic;
}

.tool-config {
  padding: 0.75rem;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
}

.config-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.config-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.config-item {
  font-size: 0.75rem;
  color: #374151;
  font-family: monospace;
}
</style>
