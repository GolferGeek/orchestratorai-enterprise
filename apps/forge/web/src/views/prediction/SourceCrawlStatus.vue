<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="source-crawl-status">
    <header class="dashboard-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>Source Crawl Status</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="refreshData">
          <span class="icon">&#8635;</span>
          Refresh
        </button>
      </div>
    </header>

    <!-- Stats Summary -->
    <section class="stats-section">
      <div class="stat-card">
        <span class="stat-value">{{ stats.totalSources }}</span>
        <span class="stat-label">Total Sources</span>
      </div>
      <div class="stat-card healthy">
        <span class="stat-value">{{ stats.healthySources }}</span>
        <span class="stat-label">Healthy</span>
      </div>
      <div class="stat-card warning">
        <span class="stat-value">{{ stats.degradedSources }}</span>
        <span class="stat-label">Degraded</span>
      </div>
      <div class="stat-card error">
        <span class="stat-value">{{ stats.failingSources }}</span>
        <span class="stat-label">Failing</span>
      </div>
    </section>

    <!-- Filters -->
    <section class="filters-section">
      <div class="filter-group">
        <label for="universe-filter">Portfolio</label>
        <select id="universe-filter" v-model="selectedUniverse" @change="loadSources">
          <option :value="null">All Portfolios</option>
          <option v-for="u in universes" :key="u.id" :value="u.id">
            {{ u.name }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label for="status-filter">Status</label>
        <select id="status-filter" v-model="statusFilter" @change="filterSources">
          <option value="all">All Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="failing">Failing</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="sort-filter">Sort By</label>
        <select id="sort-filter" v-model="sortBy" @change="sortSources">
          <option value="last_crawl">Last Crawl</option>
          <option value="errors">Consecutive Errors</option>
          <option value="name">Name</option>
          <option value="success_rate">Success Rate</option>
        </select>
      </div>
    </section>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading sources...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="refreshData">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredSources.length === 0" class="empty-state">
      <span class="empty-icon">&#128269;</span>
      <h3>No Sources Found</h3>
      <p>No sources match your current filters.</p>
    </div>

    <!-- Sources Table -->
    <section v-else class="sources-table-section">
      <table class="sources-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Source Name</th>
            <th>Type</th>
            <th>Last Crawl</th>
            <th>Next Crawl</th>
            <th>Success Rate</th>
            <th>Consecutive Errors</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in filteredSources" :key="source.id" :class="getStatusClass(source)">
            <td>
              <span class="status-badge" :class="getStatusClass(source)">
                {{ getStatusLabel(source) }}
              </span>
            </td>
            <td>
              <strong>{{ source.name }}</strong>
              <span class="source-url">{{ source.url }}</span>
            </td>
            <td>{{ source.source_type }}</td>
            <td>
              <span v-if="source.last_crawl_at">{{ formatDate(source.last_crawl_at) }}</span>
              <span v-else class="no-data">Never</span>
            </td>
            <td>
              <span v-if="source.next_crawl_at">{{ formatDate(source.next_crawl_at) }}</span>
              <span v-else class="no-data">-</span>
            </td>
            <td>
              <span v-if="source.success_rate !== null" :class="getSuccessRateClass(source.success_rate)">
                {{ source.success_rate.toFixed(1) }}%
              </span>
              <span v-else class="no-data">-</span>
            </td>
            <td>
              <span :class="{ 'error-count': source.consecutive_errors > 0 }">
                {{ source.consecutive_errors || 0 }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Recent Crawl History -->
    <section v-if="recentCrawls.length > 0" class="crawl-history-section">
      <h2>Recent Crawl History</h2>
      <div class="crawl-history-list">
        <div v-for="crawl in recentCrawls" :key="crawl.id" class="crawl-item" :class="crawl.status">
          <div class="crawl-info">
            <strong>{{ crawl.source_name }}</strong>
            <span class="crawl-time">{{ formatDate(crawl.started_at) }}</span>
          </div>
          <div class="crawl-stats">
            <span>{{ crawl.items_found }} items</span>
            <span>{{ crawl.signals_created }} signals</span>
            <span class="crawl-duration">{{ formatDuration(crawl.duration_ms) }}</span>
          </div>
          <span class="crawl-status" :class="crawl.status">{{ crawl.status }}</span>
        </div>
      </div>
    </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { predictionDashboardService } from '@/services/predictionDashboardService';

const router = useRouter();
const route = useRoute();

interface Source {
  id: string;
  name: string;
  url: string;
  source_type: string;
  last_crawl_at: string | null;
  next_crawl_at: string | null;
  consecutive_errors: number;
  last_error: string | null;
  success_rate: number | null;
  crawl_frequency_minutes: number;
  universe_id: string;
}

interface Universe {
  id: string;
  name: string;
}

interface CrawlRecord {
  id: string;
  source_id: string;
  source_name: string;
  status: 'success' | 'failed';
  started_at: string;
  completed_at: string;
  items_found: number;
  signals_created: number;
  duration_ms: number;
  error_message: string | null;
}

const sources = ref<Source[]>([]);
const universes = ref<Universe[]>([]);
const recentCrawls = ref<CrawlRecord[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

const selectedUniverse = ref<string | null>(null);
const statusFilter = ref<'all' | 'healthy' | 'degraded' | 'failing'>('all');
const sortBy = ref<'last_crawl' | 'errors' | 'name' | 'success_rate'>('last_crawl');

const stats = computed(() => {
  const total = sources.value.length;
  const healthy = sources.value.filter((s) => s.consecutive_errors === 0 && (s.success_rate === null || s.success_rate >= 80)).length;
  const degraded = sources.value.filter((s) => s.consecutive_errors > 0 && s.consecutive_errors < 3).length;
  const failing = sources.value.filter((s) => s.consecutive_errors >= 3).length;

  return {
    totalSources: total,
    healthySources: healthy,
    degradedSources: degraded,
    failingSources: failing,
  };
});

const filteredSources = computed(() => {
  let result = [...sources.value];

  // Filter by universe
  if (selectedUniverse.value) {
    result = result.filter((s) => s.universe_id === selectedUniverse.value);
  }

  // Filter by status
  if (statusFilter.value !== 'all') {
    result = result.filter((s) => {
      if (statusFilter.value === 'healthy') return s.consecutive_errors === 0;
      if (statusFilter.value === 'degraded') return s.consecutive_errors > 0 && s.consecutive_errors < 3;
      if (statusFilter.value === 'failing') return s.consecutive_errors >= 3;
      return true;
    });
  }

  // Sort
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'errors':
        return (b.consecutive_errors || 0) - (a.consecutive_errors || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'success_rate':
        return (b.success_rate ?? 0) - (a.success_rate ?? 0);
      case 'last_crawl':
      default:
        if (!a.last_crawl_at) return 1;
        if (!b.last_crawl_at) return -1;
        return new Date(b.last_crawl_at).getTime() - new Date(a.last_crawl_at).getTime();
    }
  });

  return result;
});

function getStatusClass(source: Source): string {
  if (source.consecutive_errors >= 3) return 'failing';
  if (source.consecutive_errors > 0) return 'degraded';
  return 'healthy';
}

function getStatusLabel(source: Source): string {
  if (source.consecutive_errors >= 3) return 'Failing';
  if (source.consecutive_errors > 0) return 'Degraded';
  return 'Healthy';
}

function getSuccessRateClass(rate: number): string {
  if (rate >= 90) return 'success-rate-good';
  if (rate >= 70) return 'success-rate-warning';
  return 'success-rate-bad';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function loadSources() {
  isLoading.value = true;
  error.value = null;

  try {
    // Load sources via dashboard service
    const response = await predictionDashboardService.listSources({
      universeId: selectedUniverse.value ?? undefined,
    });

    if (response.content) {
      sources.value = response.content as unknown as Source[];
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load sources';
  } finally {
    isLoading.value = false;
  }
}

async function loadUniverses() {
  try {
    const response = await predictionDashboardService.listUniverses({});
    if (response.content) {
      universes.value = response.content as Universe[];
    }
  } catch (err) {
    console.error('Failed to load universes:', err);
  }
}

async function loadRecentCrawls() {
  try {
    // Note: There's no specific recent crawls endpoint, so this functionality is disabled
    // TODO: Add a dashboard endpoint for recent crawl history if needed
    recentCrawls.value = [];
  } catch (err) {
    console.error('Failed to load recent crawls:', err);
  }
}

function filterSources() {
  // Computed property handles this
}

function sortSources() {
  // Computed property handles this
}

async function refreshData() {
  await Promise.all([loadSources(), loadRecentCrawls()]);
}

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

onMounted(async () => {
  await loadUniverses();
  await refreshData();
});
</script>

<style scoped>
.source-crawl-status {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  background: none;
  border: none;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: color 0.2s;
}

.back-button:hover {
  color: var(--primary-color, #15803d);
}

.back-icon {
  font-size: 1rem;
}

.dashboard-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Stats */
.stats-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-card.healthy .stat-value {
  color: #22c55e;
}

.stat-card.warning .stat-value {
  color: #eab308;
}

.stat-card.error .stat-value {
  color: #ef4444;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

/* Filters */
.filters-section {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-group label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.filter-group select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
  background-color: var(--input-bg, #ffffff);
  color: var(--text-primary, #111827);
  min-width: 160px;
}

/* Loading, Error, Empty states */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #15803d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 50%;
  font-weight: bold;
}

/* Sources Table */
.sources-table-section {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.sources-table {
  width: 100%;
  border-collapse: collapse;
}

.sources-table th,
.sources-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.sources-table th {
  background: var(--table-header-bg, #f9fafb);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary, #6b7280);
}

.sources-table tr.failing {
  background-color: rgba(239, 68, 68, 0.05);
}

.sources-table tr.degraded {
  background-color: rgba(234, 179, 8, 0.05);
}

.source-url {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.healthy {
  background-color: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-badge.degraded {
  background-color: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.status-badge.failing {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.no-data {
  color: var(--text-secondary, #9ca3af);
  font-style: italic;
}

.error-count {
  color: #ef4444;
  font-weight: 600;
}

.success-rate-good {
  color: #22c55e;
}

.success-rate-warning {
  color: #ca8a04;
}

.success-rate-bad {
  color: #ef4444;
}

/* Crawl History */
.crawl-history-section {
  margin-top: 2rem;
}

.crawl-history-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-primary, #111827);
}

.crawl-history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.crawl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
}

.crawl-item.failed {
  border-left: 3px solid #ef4444;
}

.crawl-item.success {
  border-left: 3px solid #22c55e;
}

.crawl-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.crawl-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.crawl-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.crawl-status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.crawl-status.success {
  background-color: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.crawl-status.failed {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Responsive */
@media (max-width: 768px) {
  .stats-section {
    grid-template-columns: repeat(2, 1fr);
  }

  .sources-table-section {
    overflow-x: auto;
  }
}
</style>
