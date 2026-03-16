<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="alerts-view">
    <header class="dashboard-header">
      <div class="header-left">
        <button class="back-button" @click="goBackToDashboard">
          <span class="back-icon">&larr;</span>
          Back to Dashboard
        </button>
        <h1>System Alerts</h1>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="runAnomalyDetection" :disabled="isDetecting">
          <span class="icon">&#128270;</span>
          {{ isDetecting ? 'Detecting...' : 'Run Anomaly Detection' }}
        </button>
        <button class="btn btn-secondary" @click="refreshData">
          <span class="icon">&#8635;</span>
          Refresh
        </button>
      </div>
    </header>

    <!-- Alert Stats -->
    <section class="stats-section">
      <div class="stat-card critical">
        <span class="stat-value">{{ alertCounts.critical }}</span>
        <span class="stat-label">Critical</span>
      </div>
      <div class="stat-card warning">
        <span class="stat-value">{{ alertCounts.warning }}</span>
        <span class="stat-label">Warnings</span>
      </div>
      <div class="stat-card info">
        <span class="stat-value">{{ alertCounts.info }}</span>
        <span class="stat-label">Info</span>
      </div>
      <div class="stat-card acknowledged">
        <span class="stat-value">{{ alertCounts.acknowledged }}</span>
        <span class="stat-label">Acknowledged</span>
      </div>
    </section>

    <!-- Filters -->
    <section class="filters-section">
      <div class="filter-group">
        <label for="status-filter">Status</label>
        <select id="status-filter" v-model="statusFilter" @change="filterAlerts">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="severity-filter">Severity</label>
        <select id="severity-filter" v-model="severityFilter" @change="filterAlerts">
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="type-filter">Type</label>
        <select id="type-filter" v-model="typeFilter" @change="filterAlerts">
          <option value="all">All Types</option>
          <option value="crawl.failure.threshold">Crawl Failures</option>
          <option value="crawl.degraded">Crawl Degraded</option>
          <option value="anomaly.signal_rate">Signal Rate Anomaly</option>
          <option value="anomaly.prediction_accuracy">Accuracy Anomaly</option>
        </select>
      </div>
    </section>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading alerts...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="btn btn-secondary" @click="refreshData">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredAlerts.length === 0" class="empty-state">
      <span class="empty-icon">&#9989;</span>
      <h3>No Alerts</h3>
      <p>All systems are operating normally.</p>
    </div>

    <!-- Alerts List -->
    <section v-else class="alerts-list">
      <div
        v-for="alert in filteredAlerts"
        :key="alert.id"
        class="alert-card"
        :class="[alert.severity, alert.status]"
      >
        <div class="alert-header">
          <div class="alert-badges">
            <span class="severity-badge" :class="alert.severity">
              {{ alert.severity }}
            </span>
            <span class="type-badge">
              {{ formatAlertType(alert.alert_type) }}
            </span>
            <span v-if="alert.status === 'acknowledged'" class="status-badge acknowledged">
              Acknowledged
            </span>
          </div>
          <span class="alert-time">{{ formatDate(alert.created_at) }}</span>
        </div>

        <h3 class="alert-title">{{ alert.title }}</h3>
        <p class="alert-message">{{ alert.message }}</p>

        <!-- Alert Details -->
        <div v-if="alert.details" class="alert-details">
          <div v-for="(value, key) in getDisplayDetails(alert.details)" :key="key" class="detail-item">
            <span class="detail-label">{{ formatDetailKey(key) }}:</span>
            <span class="detail-value">{{ value }}</span>
          </div>
        </div>

        <!-- Alert Actions -->
        <div class="alert-actions">
          <button
            v-if="alert.status === 'active'"
            class="btn btn-sm btn-acknowledge"
            @click="acknowledgeAlert(alert.id)"
            :disabled="isProcessing[alert.id]"
          >
            Acknowledge
          </button>
          <button
            v-if="alert.status !== 'resolved'"
            class="btn btn-sm btn-resolve"
            @click="resolveAlert(alert.id)"
            :disabled="isProcessing[alert.id]"
          >
            Resolve
          </button>
          <button
            v-if="alert.source_id"
            class="btn btn-sm btn-secondary"
            @click="viewSource(alert.source_id)"
          >
            View Source
          </button>
        </div>
      </div>
    </section>

    <!-- Recent Anomaly Detection Results -->
    <section v-if="lastDetectionResult" class="detection-results">
      <h2>Last Anomaly Detection</h2>
      <div class="detection-summary">
        <span class="detection-time">{{ formatDate(lastDetectionResult.timestamp) }}</span>
        <div class="detection-stats">
          <span>{{ lastDetectionResult.signal_rate_anomalies.length }} signal rate anomalies</span>
          <span>{{ lastDetectionResult.accuracy_anomalies.length }} accuracy anomalies</span>
          <span>{{ lastDetectionResult.alerts_created }} alerts created</span>
        </div>
      </div>
    </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';
import { predictionDashboardService as _predictionDashboardService } from '@/services/predictionDashboardService';

interface Alert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  source_id?: string;
  target_id?: string;
  universe_id?: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
}

interface AnomalyDetectionResult {
  timestamp: string;
  signal_rate_anomalies: unknown[];
  accuracy_anomalies: unknown[];
  alerts_created: number;
}

const router = useRouter();
const route = useRoute();
const alerts = ref<Alert[]>([]);
const isLoading = ref(false);
const isDetecting = ref(false);
const error = ref<string | null>(null);
const isProcessing = reactive<Record<string, boolean>>({});
const lastDetectionResult = ref<AnomalyDetectionResult | null>(null);

const statusFilter = ref<'all' | 'active' | 'acknowledged' | 'resolved'>('all');
const severityFilter = ref<'all' | 'critical' | 'warning' | 'info'>('all');
const typeFilter = ref<string>('all');

const alertCounts = computed(() => {
  const active = alerts.value.filter((a) => a.status === 'active');
  return {
    critical: active.filter((a) => a.severity === 'critical').length,
    warning: active.filter((a) => a.severity === 'warning').length,
    info: active.filter((a) => a.severity === 'info').length,
    acknowledged: alerts.value.filter((a) => a.status === 'acknowledged').length,
  };
});

const filteredAlerts = computed(() => {
  let result = [...alerts.value];

  // Filter by status
  if (statusFilter.value !== 'all') {
    result = result.filter((a) => a.status === statusFilter.value);
  }

  // Filter by severity
  if (severityFilter.value !== 'all') {
    result = result.filter((a) => a.severity === severityFilter.value);
  }

  // Filter by type
  if (typeFilter.value !== 'all') {
    result = result.filter((a) => a.alert_type === typeFilter.value);
  }

  // Sort by severity then date
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  result.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return result;
});

function formatAlertType(type: string): string {
  const typeMap: Record<string, string> = {
    'crawl.failure.threshold': 'Crawl Failure',
    'crawl.failure.resolved': 'Crawl Recovered',
    'crawl.degraded': 'Crawl Degraded',
    'anomaly.signal_rate': 'Signal Rate',
    'anomaly.prediction_accuracy': 'Accuracy',
  };
  return typeMap[type] || type;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDetailKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDisplayDetails(details: Record<string, unknown>): Record<string, string> {
  const displayable: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== null && value !== undefined) {
      if (typeof value === 'number') {
        displayable[key] = Number.isInteger(value) ? String(value) : value.toFixed(2);
      } else if (typeof value === 'string') {
        displayable[key] = value;
      }
    }
  }
  return displayable;
}

async function loadAlerts() {
  isLoading.value = true;
  error.value = null;

  try {
    // TODO: Implement alert loading when predictionDashboardService supports alerts
    // const response = await predictionDashboardService.listAlerts({
    //   status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
    // });
    // if (response.success && response.data) {
    //   alerts.value = response.data as Alert[];
    // }

    // Temporary: return empty alerts until API is implemented
    alerts.value = [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load alerts';
  } finally {
    isLoading.value = false;
  }
}

async function acknowledgeAlert(alertId: string) {
  isProcessing[alertId] = true;

  try {
    // TODO: Implement alert acknowledgement when predictionDashboardService supports alerts
    // await predictionDashboardService.acknowledgeAlert(alertId);
    console.warn('Alert acknowledgement not yet implemented for prediction dashboard');
    await loadAlerts();
  } catch (err) {
    console.error('Failed to acknowledge alert:', err);
  } finally {
    isProcessing[alertId] = false;
  }
}

async function resolveAlert(alertId: string) {
  isProcessing[alertId] = true;

  try {
    // TODO: Implement alert resolution when predictionDashboardService supports alerts
    // await predictionDashboardService.resolveAlert(alertId);
    console.warn('Alert resolution not yet implemented for prediction dashboard');
    await loadAlerts();
  } catch (err) {
    console.error('Failed to resolve alert:', err);
  } finally {
    isProcessing[alertId] = false;
  }
}

async function runAnomalyDetection() {
  isDetecting.value = true;

  try {
    // TODO: Implement anomaly detection when predictionDashboardService supports it
    // const response = await predictionDashboardService.runAnomalyDetection();
    // if (response.success && response.data) {
    //   lastDetectionResult.value = response.data as AnomalyDetectionResult;
    //   await loadAlerts();
    // }
    console.warn('Anomaly detection not yet implemented for prediction dashboard');
  } catch (err) {
    console.error('Failed to run anomaly detection:', err);
  } finally {
    isDetecting.value = false;
  }
}

function viewSource(sourceId: string) {
  router.push({ name: 'source-crawl-status', query: { sourceId } });
}

function filterAlerts() {
  // Computed property handles this
}

async function refreshData() {
  await loadAlerts();
}

function goBackToDashboard() {
  const agentSlug = route.query.agentSlug as string;
  router.push({
    name: 'PredictionDashboard',
    query: agentSlug ? { agentSlug } : undefined,
  });
}

onMounted(async () => {
  await loadAlerts();
});
</script>

<style scoped>
.alerts-view {
  padding: 1.5rem;
  max-width: 1200px;
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
  color: var(--ion-color-secondary, #15803d);
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

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-acknowledge {
  background-color: #fef3c7;
  color: #92400e;
}

.btn-acknowledge:hover {
  background-color: #fde68a;
}

.btn-resolve {
  background-color: #d1fae5;
  color: #065f46;
}

.btn-resolve:hover {
  background-color: #a7f3d0;
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

.stat-card.critical {
  border-left: 3px solid #ef4444;
}

.stat-card.critical .stat-value {
  color: #ef4444;
}

.stat-card.warning {
  border-left: 3px solid #eab308;
}

.stat-card.warning .stat-value {
  color: #ca8a04;
}

.stat-card.info {
  border-left: 3px solid #15803d;
}

.stat-card.info .stat-value {
  color: #15803d;
}

.stat-card.acknowledged {
  border-left: 3px solid #9ca3af;
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

/* States */
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
  border-top-color: var(--ion-color-secondary, #15803d);
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

.empty-icon {
  font-size: 3rem;
}

/* Alerts List */
.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.alert-card.critical {
  border-left: 4px solid #ef4444;
}

.alert-card.warning {
  border-left: 4px solid #eab308;
}

.alert-card.info {
  border-left: 4px solid #15803d;
}

.alert-card.acknowledged {
  opacity: 0.7;
}

.alert-card.resolved {
  opacity: 0.5;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.alert-badges {
  display: flex;
  gap: 0.5rem;
}

.severity-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-badge.critical {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.severity-badge.warning {
  background-color: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.severity-badge.info {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.type-badge {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.625rem;
  background-color: var(--badge-bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
}

.status-badge.acknowledged {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.625rem;
  background-color: rgba(156, 163, 175, 0.2);
  color: #6b7280;
}

.alert-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.alert-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  color: var(--text-primary, #111827);
}

.alert-message {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
}

.alert-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.5rem;
  background-color: var(--detail-bg, #f9fafb);
  border-radius: 4px;
  margin-bottom: 0.75rem;
}

.detail-item {
  font-size: 0.75rem;
}

.detail-label {
  color: var(--text-secondary, #6b7280);
}

.detail-value {
  color: var(--text-primary, #111827);
  font-weight: 500;
  margin-left: 0.25rem;
}

.alert-actions {
  display: flex;
  gap: 0.5rem;
}

/* Detection Results */
.detection-results {
  margin-top: 2rem;
  padding: 1rem;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
}

.detection-results h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--text-primary, #111827);
}

.detection-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detection-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.detection-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

/* Responsive */
@media (max-width: 768px) {
  .stats-section {
    grid-template-columns: repeat(2, 1fr);
  }

  .alert-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>
