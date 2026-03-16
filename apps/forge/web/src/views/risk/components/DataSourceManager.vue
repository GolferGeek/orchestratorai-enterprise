<template>
  <div class="data-source-manager">
    <div class="manager-header">
      <div class="header-left">
        <h3>Live Data Sources</h3>
        <span class="subtitle">Connect external data sources for automatic risk updates</span>
      </div>
      <div class="header-right">
        <button class="btn btn-primary" @click="showAddModal = true">
          <span class="icon">+</span>
          Add Source
        </button>
      </div>
    </div>

    <!-- Health Summary -->
    <div v-if="healthSummary" class="health-summary">
      <div class="health-stat">
        <span class="stat-value">{{ healthSummary.total }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="health-stat active">
        <span class="stat-value">{{ healthSummary.active }}</span>
        <span class="stat-label">Active</span>
      </div>
      <div class="health-stat paused">
        <span class="stat-value">{{ healthSummary.paused }}</span>
        <span class="stat-label">Paused</span>
      </div>
      <div class="health-stat error">
        <span class="stat-value">{{ healthSummary.error }}</span>
        <span class="stat-label">Error</span>
      </div>
      <div class="health-stat success">
        <span class="stat-value">{{ healthSummary.lastFetchSuccess }}</span>
        <span class="stat-label">Last Success</span>
      </div>
      <div class="health-stat failed">
        <span class="stat-value">{{ healthSummary.lastFetchFailed }}</span>
        <span class="stat-label">Last Failed</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading data sources...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="dataSources.length === 0" class="empty-state">
      <span class="empty-icon">📡</span>
      <h4>No Data Sources</h4>
      <p>Add external data sources to automatically update risk scores</p>
      <button class="btn btn-primary" @click="showAddModal = true">
        Add Your First Source
      </button>
    </div>

    <!-- Data Sources List -->
    <div v-else class="sources-list">
      <div
        v-for="source in dataSources"
        :key="source.id"
        class="source-card"
      >
        <div class="source-header">
          <div class="source-info">
            <span :class="['source-type-badge', source.sourceType]">
              {{ getSourceTypeIcon(source.sourceType) }} {{ formatSourceType(source.sourceType) }}
            </span>
            <h4 class="source-name">{{ source.name }}</h4>
          </div>
          <div class="source-status">
            <span :class="['status-badge', source.status]">
              {{ source.status }}
            </span>
          </div>
        </div>

        <div v-if="source.description" class="source-description">
          {{ source.description }}
        </div>

        <div class="source-details">
          <div class="detail-row">
            <span class="detail-label">Schedule:</span>
            <span class="detail-value">{{ formatSchedule(source.schedule) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Last Fetch:</span>
            <span class="detail-value">
              <span v-if="source.lastFetchAt">
                {{ formatRelativeTime(source.lastFetchAt) }}
                <span :class="['fetch-status', source.lastFetchStatus || 'unknown']">
                  ({{ source.lastFetchStatus || 'N/A' }})
                </span>
              </span>
              <span v-else>Never</span>
            </span>
          </div>
          <div v-if="source.nextFetchAt" class="detail-row">
            <span class="detail-label">Next Fetch:</span>
            <span class="detail-value">{{ formatRelativeTime(source.nextFetchAt) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Auto-Reanalyze:</span>
            <span class="detail-value">
              {{ source.autoReanalyze ? 'Yes' : 'No' }}
              <span v-if="source.autoReanalyze"> (threshold: {{ formatPercent(source.reanalyzeThreshold) }})</span>
            </span>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="source.errorMessage" class="error-message">
          <span class="error-icon">⚠️</span>
          {{ source.errorMessage }}
          <span v-if="source.errorCount > 1" class="error-count">({{ source.errorCount }} failures)</span>
        </div>

        <!-- Source Actions -->
        <div class="source-actions">
          <button
            class="action-btn"
            @click="fetchNow(source)"
            :disabled="isFetching[source.id]"
            title="Fetch now"
          >
            <span v-if="isFetching[source.id]" class="spinner-small"></span>
            <span v-else>🔄</span>
            Fetch
          </button>
          <button
            class="action-btn"
            @click="toggleStatus(source)"
            :title="source.status === 'active' ? 'Pause' : 'Resume'"
          >
            {{ source.status === 'active' ? '⏸️ Pause' : '▶️ Resume' }}
          </button>
          <button
            class="action-btn"
            @click="viewHistory(source)"
            title="View fetch history"
          >
            📜 History
          </button>
          <button
            class="action-btn"
            @click="editSource(source)"
            title="Edit source"
          >
            ✏️ Edit
          </button>
          <button
            class="action-btn danger"
            @click="deleteSource(source)"
            title="Delete source"
          >
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showAddModal || editingSource" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content large">
        <div class="modal-header">
          <h4>{{ editingSource ? 'Edit Data Source' : 'Add Data Source' }}</h4>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveSource">
            <!-- Basic Info -->
            <div class="form-section">
              <h5>Basic Information</h5>
              <div class="form-row">
                <div class="form-group">
                  <label>Name *</label>
                  <input
                    v-model="formData.name"
                    type="text"
                    class="form-control"
                    placeholder="E.g., CoinGecko API"
                    required
                  />
                </div>
                <div class="form-group">
                  <label>Source Type *</label>
                  <select
                    v-model="formData.sourceType"
                    class="form-control"
                    required
                  >
                    <option value="firecrawl">Firecrawl (Web Scraping)</option>
                    <option value="api">REST API</option>
                    <option value="rss">RSS Feed</option>
                    <option value="webhook">Webhook (Push)</option>
                    <option value="manual">Manual Entry</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea
                  v-model="formData.description"
                  class="form-control"
                  rows="2"
                  placeholder="Optional description"
                ></textarea>
              </div>
            </div>

            <!-- Source Configuration -->
            <div class="form-section">
              <h5>Source Configuration</h5>

              <!-- Firecrawl Config -->
              <div v-if="formData.sourceType === 'firecrawl'" class="config-fields">
                <div class="form-group">
                  <label>URL *</label>
                  <input
                    v-model="formData.config.url"
                    type="url"
                    class="form-control"
                    placeholder="https://example.com/data"
                    required
                  />
                </div>
                <div class="form-group">
                  <label>CSS Selector (optional)</label>
                  <input
                    v-model="formData.config.selector"
                    type="text"
                    class="form-control"
                    placeholder=".data-container"
                  />
                </div>
                <div class="form-group">
                  <label>Extract Fields (comma-separated)</label>
                  <input
                    v-model="extractFieldsText"
                    type="text"
                    class="form-control"
                    placeholder="price, volume, change"
                  />
                </div>
              </div>

              <!-- API Config -->
              <div v-if="formData.sourceType === 'api'" class="config-fields">
                <div class="form-row">
                  <div class="form-group">
                    <label>Endpoint URL *</label>
                    <input
                      v-model="formData.config.endpoint"
                      type="url"
                      class="form-control"
                      placeholder="https://api.example.com/v1/data"
                      required
                    />
                  </div>
                  <div class="form-group small">
                    <label>Method</label>
                    <select v-model="formData.config.method" class="form-control">
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label>Headers (JSON)</label>
                  <textarea
                    v-model="headersJson"
                    class="form-control mono"
                    rows="2"
                    placeholder="{&quot;Authorization&quot;: &quot;Bearer xxx&quot;}"
                  ></textarea>
                </div>
              </div>

              <!-- RSS Config -->
              <div v-if="formData.sourceType === 'rss'" class="config-fields">
                <div class="form-group">
                  <label>Feed URL *</label>
                  <input
                    v-model="formData.config.feedUrl"
                    type="url"
                    class="form-control"
                    placeholder="https://example.com/feed.xml"
                    required
                  />
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="formData.config.sentimentAnalysis" />
                    Enable Sentiment Analysis
                  </label>
                </div>
              </div>

              <!-- Webhook Config -->
              <div v-if="formData.sourceType === 'webhook'" class="config-fields">
                <div class="info-box">
                  <p>Webhooks receive data pushed from external systems. Configure the external system to POST data to:</p>
                  <code>POST /api/risk/webhooks/{{ formData.config.webhookId || 'YOUR_WEBHOOK_ID' }}</code>
                </div>
                <div class="form-group">
                  <label>Webhook ID</label>
                  <input
                    v-model="formData.config.webhookId"
                    type="text"
                    class="form-control"
                    placeholder="Auto-generated if empty"
                  />
                </div>
              </div>
            </div>

            <!-- Schedule -->
            <div class="form-section">
              <h5>Schedule</h5>
              <div class="form-group">
                <label>Fetch Schedule</label>
                <div class="schedule-options">
                  <button
                    type="button"
                    v-for="preset in schedulePresets"
                    :key="preset.value"
                    :class="['schedule-btn', { active: formData.schedule === preset.value }]"
                    @click="formData.schedule = preset.value"
                  >
                    {{ preset.label }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Reanalysis Settings -->
            <div class="form-section">
              <h5>Auto-Reanalysis</h5>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="formData.autoReanalyze" />
                  Automatically trigger risk reanalysis when data changes
                </label>
              </div>
              <div v-if="formData.autoReanalyze" class="form-group">
                <label>Change Threshold ({{ formatPercent(formData.reanalyzeThreshold) }})</label>
                <input
                  v-model.number="formData.reanalyzeThreshold"
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  class="form-control"
                />
                <span class="help-text">Trigger reanalysis when changes exceed this threshold</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="closeModal">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" :disabled="isSaving">
                {{ isSaving ? 'Saving...' : (editingSource ? 'Update Source' : 'Create Source') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- History Modal -->
    <div v-if="showHistoryModal" class="modal-overlay" @click.self="showHistoryModal = false">
      <div class="modal-content large">
        <div class="modal-header">
          <h4>Fetch History: {{ selectedSource?.name }}</h4>
          <button class="modal-close" @click="showHistoryModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="isLoadingHistory" class="loading-state">
            <div class="spinner"></div>
            <span>Loading history...</span>
          </div>
          <div v-else-if="fetchHistory.length === 0" class="empty-state">
            <span>No fetch history available</span>
          </div>
          <div v-else class="history-list">
            <div
              v-for="record in fetchHistory"
              :key="record.id"
              :class="['history-item', record.status]"
            >
              <div class="history-header">
                <span class="history-time">{{ formatDateTime(record.fetchedAt) }}</span>
                <span :class="['history-status', record.status]">{{ record.status }}</span>
              </div>
              <div class="history-details">
                <span v-if="record.fetchDurationMs" class="history-duration">
                  {{ record.fetchDurationMs }}ms
                </span>
                <span v-if="record.dimensionsUpdated?.length" class="history-dimensions">
                  {{ record.dimensionsUpdated.length }} dimensions updated
                </span>
                <span v-if="record.reanalysisTriggered" class="history-reanalysis">
                  Reanalysis triggered
                </span>
              </div>
              <div v-if="record.errorMessage" class="history-error">
                {{ record.errorMessage }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import type {
  DataSource,
  DataSourceType,
  DataSourceHealthSummary,
  FetchHistoryRecord,
  SourceConfig,
} from '@/types/risk-agent';

const props = defineProps<{
  scopeId: string;
}>();

const emit = defineEmits<{
  (e: 'source-updated'): void;
}>();

// State
const dataSources = ref<DataSource[]>([]);
const healthSummary = ref<DataSourceHealthSummary | null>(null);
const isLoading = ref(false);
const isSaving = ref(false);
const isFetching = ref<Record<string, boolean>>({});
const showAddModal = ref(false);
const editingSource = ref<DataSource | null>(null);
const showHistoryModal = ref(false);
const selectedSource = ref<DataSource | null>(null);
const fetchHistory = ref<FetchHistoryRecord[]>([]);
const isLoadingHistory = ref(false);

// Form data
const formData = reactive({
  name: '',
  description: '',
  sourceType: 'api' as DataSourceType,
  config: {} as Record<string, unknown>,
  schedule: 'daily',
  autoReanalyze: true,
  reanalyzeThreshold: 0.1,
});

// Schedule presets
const schedulePresets = [
  { value: 'realtime', label: 'Real-time (5min)' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

// Computed helpers for form fields
const extractFieldsText = computed({
  get: () => (formData.config.extractFields as string[] || []).join(', '),
  set: (val: string) => {
    formData.config.extractFields = val.split(',').map((s) => s.trim()).filter(Boolean);
  },
});

const headersJson = computed({
  get: () => {
    try {
      return formData.config.headers ? JSON.stringify(formData.config.headers, null, 2) : '';
    } catch {
      return '';
    }
  },
  set: (val: string) => {
    try {
      formData.config.headers = val ? JSON.parse(val) : undefined;
    } catch {
      // Ignore parse errors while typing
    }
  },
});

// Load data sources
async function loadDataSources() {
  isLoading.value = true;
  try {
    const [sourcesRes, healthRes] = await Promise.all([
      riskDashboardService.listDataSources({ scopeId: props.scopeId }),
      riskDashboardService.getDataSourceHealthSummary(props.scopeId),
    ]);

    if (sourcesRes.success && sourcesRes.content) {
      dataSources.value = sourcesRes.content;
    }
    if (healthRes.success && healthRes.content) {
      healthSummary.value = healthRes.content;
    }
  } catch (error) {
    console.error('Failed to load data sources:', error);
  } finally {
    isLoading.value = false;
  }
}

// Fetch now
async function fetchNow(source: DataSource) {
  isFetching.value[source.id] = true;
  try {
    const response = await riskDashboardService.fetchDataSource(source.id);
    if (response.success) {
      await loadDataSources();
      emit('source-updated');
    }
  } catch (error) {
    console.error('Failed to fetch data:', error);
  } finally {
    isFetching.value[source.id] = false;
  }
}

// Toggle status
async function toggleStatus(source: DataSource) {
  const newStatus = source.status === 'active' ? 'paused' : 'active';
  try {
    const response = await riskDashboardService.updateDataSource({
      dataSourceId: source.id,
      status: newStatus,
    });
    if (response.success) {
      await loadDataSources();
    }
  } catch (error) {
    console.error('Failed to update status:', error);
  }
}

// View history
async function viewHistory(source: DataSource) {
  selectedSource.value = source;
  showHistoryModal.value = true;
  isLoadingHistory.value = true;
  try {
    const response = await riskDashboardService.getFetchHistory({
      dataSourceId: source.id,
      limit: 50,
    });
    if (response.success && response.content) {
      fetchHistory.value = response.content;
    }
  } catch (error) {
    console.error('Failed to load history:', error);
  } finally {
    isLoadingHistory.value = false;
  }
}

// Edit source
function editSource(source: DataSource) {
  editingSource.value = source;
  formData.name = source.name;
  formData.description = source.description || '';
  formData.sourceType = source.sourceType;
  formData.config = { ...source.config } as Record<string, unknown>;
  formData.schedule = source.schedule || 'daily';
  formData.autoReanalyze = source.autoReanalyze;
  formData.reanalyzeThreshold = source.reanalyzeThreshold;
}

// Delete source
async function deleteSource(source: DataSource) {
  if (!confirm(`Are you sure you want to delete "${source.name}"?`)) return;

  try {
    const response = await riskDashboardService.deleteDataSource(source.id);
    if (response.success) {
      await loadDataSources();
      emit('source-updated');
    }
  } catch (error) {
    console.error('Failed to delete source:', error);
  }
}

// Save source
async function saveSource() {
  isSaving.value = true;
  try {
    if (editingSource.value) {
      // Update existing
      const response = await riskDashboardService.updateDataSource({
        dataSourceId: editingSource.value.id,
        name: formData.name,
        description: formData.description || undefined,
        config: formData.config as SourceConfig,
        schedule: formData.schedule,
        autoReanalyze: formData.autoReanalyze,
        reanalyzeThreshold: formData.reanalyzeThreshold,
      });
      if (response.success) {
        closeModal();
        await loadDataSources();
        emit('source-updated');
      }
    } else {
      // Create new
      const response = await riskDashboardService.createDataSource({
        scopeId: props.scopeId,
        name: formData.name,
        description: formData.description || undefined,
        sourceType: formData.sourceType,
        config: formData.config as SourceConfig,
        schedule: formData.schedule,
        autoReanalyze: formData.autoReanalyze,
        reanalyzeThreshold: formData.reanalyzeThreshold,
      });
      if (response.success) {
        closeModal();
        await loadDataSources();
        emit('source-updated');
      }
    }
  } catch (error) {
    console.error('Failed to save source:', error);
  } finally {
    isSaving.value = false;
  }
}

// Close modal and reset form
function closeModal() {
  showAddModal.value = false;
  editingSource.value = null;
  resetForm();
}

function resetForm() {
  formData.name = '';
  formData.description = '';
  formData.sourceType = 'api';
  formData.config = {};
  formData.schedule = 'daily';
  formData.autoReanalyze = true;
  formData.reanalyzeThreshold = 0.1;
}

// Formatting helpers
function getSourceTypeIcon(type: DataSourceType): string {
  const icons: Record<DataSourceType, string> = {
    firecrawl: '🕷️',
    api: '🔌',
    rss: '📰',
    webhook: '🪝',
    manual: '✍️',
  };
  return icons[type] || '📡';
}

function formatSourceType(type: DataSourceType): string {
  const labels: Record<DataSourceType, string> = {
    firecrawl: 'Web Scraping',
    api: 'REST API',
    rss: 'RSS Feed',
    webhook: 'Webhook',
    manual: 'Manual',
  };
  return labels[type] || type;
}

function formatSchedule(schedule: string | null): string {
  if (!schedule) return 'Manual';
  const labels: Record<string, string> = {
    realtime: 'Every 5 minutes',
    hourly: 'Every hour',
    daily: 'Daily',
    weekly: 'Weekly',
  };
  return labels[schedule] || schedule;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 0) {
    // Future
    const absDiff = Math.abs(diff);
    if (absDiff < 60000) return 'in a moment';
    if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)} min`;
    if (absDiff < 86400000) return `in ${Math.round(absDiff / 3600000)} hours`;
    return `in ${Math.round(absDiff / 86400000)} days`;
  }

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} hours ago`;
  return `${Math.round(diff / 86400000)} days ago`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

// Initialize
onMounted(() => {
  loadDataSources();
});
</script>

<style scoped>
.data-source-manager {
  background: var(--card-bg, #1e1e1e);
  border-radius: 12px;
  padding: 24px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.header-left h3 {
  margin: 0;
  color: var(--text-primary, #e0e0e0);
  font-size: 20px;
}

.subtitle {
  color: var(--text-secondary, #888);
  font-size: 14px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent-color, #a87c4f);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, #c89660);
}

.btn-secondary {
  background: var(--bg-secondary, #2a2a2a);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border-color, #3a3a3a);
}

.btn-secondary:hover {
  background: var(--bg-hover, #333);
}

/* Health Summary */
.health-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 8px;
}

.health-stat {
  text-align: center;
  flex: 1;
}

.health-stat .stat-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.health-stat .stat-label {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.health-stat.active .stat-value { color: #10b981; }
.health-stat.paused .stat-value { color: #f59e0b; }
.health-stat.error .stat-value { color: #ef4444; }
.health-stat.success .stat-value { color: #10b981; }
.health-stat.failed .stat-value { color: #ef4444; }

/* Loading & Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-secondary, #888);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color, #3a3a3a);
  border-top-color: var(--accent-color, #a87c4f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color, #3a3a3a);
  border-top-color: var(--accent-color, #a87c4f);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 48px;
}

.empty-state h4 {
  margin: 0;
  color: var(--text-primary, #e0e0e0);
}

.empty-state p {
  margin: 0 0 16px 0;
}

/* Sources List */
.sources-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.source-card {
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 12px;
  padding: 16px;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.source-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-secondary, #888);
}

.source-name {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #e0e0e0);
}

.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.active {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.status-badge.paused {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.status-badge.error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.status-badge.disabled {
  background: rgba(107, 114, 128, 0.2);
  color: #6b7280;
}

.source-description {
  font-size: 13px;
  color: var(--text-secondary, #888);
  margin-bottom: 12px;
}

.source-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.detail-label {
  color: var(--text-muted, #666);
  min-width: 100px;
}

.detail-value {
  color: var(--text-primary, #e0e0e0);
}

.fetch-status {
  font-size: 12px;
}

.fetch-status.success { color: #10b981; }
.fetch-status.failed { color: #ef4444; }

.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #ef4444;
}

.error-icon {
  margin-right: 8px;
}

.error-count {
  font-size: 12px;
  opacity: 0.8;
}

.source-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 6px 10px;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 6px;
  color: var(--text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-hover, #333);
  color: var(--text-primary, #e0e0e0);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.danger:hover {
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--card-bg, #1e1e1e);
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-content.large {
  max-width: 700px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
}

.modal-header h4 {
  margin: 0;
  color: var(--text-primary, #e0e0e0);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary, #888);
  font-size: 24px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Form */
.form-section {
  margin-bottom: 24px;
}

.form-section h5 {
  margin: 0 0 12px 0;
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
}

.form-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group.small {
  max-width: 150px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary, #888);
  font-size: 13px;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-secondary, #2a2a2a);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 8px;
  color: var(--text-primary, #e0e0e0);
  font-size: 14px;
}

.form-control:focus {
  outline: none;
  border-color: var(--accent-color, #a87c4f);
}

.form-control.mono {
  font-family: monospace;
  font-size: 13px;
}

textarea.form-control {
  resize: vertical;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.help-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #666);
}

.config-fields {
  background: var(--bg-primary, #1e1e1e);
  border-radius: 8px;
  padding: 16px;
}

.info-box {
  background: rgba(21, 128, 61, 0.1);
  border: 1px solid rgba(21, 128, 61, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.info-box code {
  display: block;
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: var(--accent-color, #a87c4f);
}

.schedule-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.schedule-btn {
  padding: 8px 14px;
  background: var(--bg-secondary, #2a2a2a);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 6px;
  color: var(--text-secondary, #888);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-btn:hover {
  border-color: var(--accent-color, #a87c4f);
  color: var(--text-primary, #e0e0e0);
}

.schedule-btn.active {
  background: var(--accent-color, #a87c4f);
  border-color: var(--accent-color, #a87c4f);
  color: white;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #3a3a3a);
}

/* History */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 8px;
  padding: 12px;
  border-left: 3px solid var(--border-color, #3a3a3a);
}

.history-item.success {
  border-left-color: #10b981;
}

.history-item.failed {
  border-left-color: #ef4444;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-time {
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.history-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.history-status.success {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.history-status.failed {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.history-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted, #666);
}

.history-reanalysis {
  color: var(--accent-color, #a87c4f);
}

.history-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ef4444;
}
</style>
