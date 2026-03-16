<template>
  <div class="report-generator">
    <div class="generator-header">
      <div class="header-left">
        <h3>PDF Report Generator</h3>
        <span class="subtitle">Generate professional risk analysis reports</span>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" @click="showHistory = !showHistory">
          <span class="icon">📜</span>
          {{ showHistory ? 'Configure' : 'History' }}
        </button>
      </div>
    </div>

    <!-- Configuration View -->
    <div v-if="!showHistory" class="configuration-view">
      <!-- Report Type Selection -->
      <div class="config-section">
        <h4>Report Type</h4>
        <div class="report-types">
          <label
            v-for="type in reportTypes"
            :key="type.value"
            :class="['report-type-card', { selected: selectedType === type.value }]"
          >
            <input
              type="radio"
              v-model="selectedType"
              :value="type.value"
              class="hidden-radio"
            />
            <span class="type-icon">{{ type.icon }}</span>
            <span class="type-name">{{ type.label }}</span>
            <span class="type-description">{{ type.description }}</span>
          </label>
        </div>
      </div>

      <!-- Section Selection -->
      <div class="config-section">
        <h4>Include Sections</h4>
        <div class="section-toggles">
          <label
            v-for="section in sections"
            :key="section.key"
            class="section-toggle"
          >
            <input
              type="checkbox"
              v-model="config[section.key as keyof typeof config]"
              :disabled="isRequiredSection(section.key)"
            />
            <span class="toggle-icon">{{ section.icon }}</span>
            <span class="toggle-label">{{ section.label }}</span>
            <span v-if="isRequiredSection(section.key)" class="required-badge">Required</span>
          </label>
        </div>
      </div>

      <!-- Date Range (Optional) -->
      <div class="config-section">
        <h4>Date Range (Optional)</h4>
        <div class="date-range">
          <div class="date-input">
            <label>From</label>
            <input type="date" v-model="dateRange.start" />
          </div>
          <div class="date-input">
            <label>To</label>
            <input type="date" v-model="dateRange.end" />
          </div>
          <button class="btn btn-small btn-secondary" @click="clearDateRange">
            Clear
          </button>
        </div>
      </div>

      <!-- Report Title -->
      <div class="config-section">
        <h4>Report Title</h4>
        <input
          v-model="reportTitle"
          type="text"
          placeholder="Enter report title..."
          class="title-input"
        />
      </div>

      <!-- Generate Button -->
      <div class="generate-section">
        <button
          class="btn btn-primary btn-generate"
          @click="onGenerateReport"
          :disabled="isGenerating || !reportTitle.trim()"
        >
          <span v-if="isGenerating" class="spinner-small"></span>
          <span v-else class="icon">📄</span>
          {{ isGenerating ? 'Generating Report...' : 'Generate PDF Report' }}
        </button>
        <p class="generate-note">
          Report generation may take a few moments depending on the data size.
        </p>
      </div>

      <!-- Active Generation Status -->
      <div v-if="activeReport" class="active-report-status">
        <div class="status-header">
          <span class="status-title">{{ activeReport.title }}</span>
          <span :class="['status-badge', activeReport.status]">
            {{ formatStatus(activeReport.status) }}
          </span>
        </div>
        <div v-if="activeReport.status === 'generating'" class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div v-if="activeReport.status === 'completed'" class="download-section">
          <button class="btn btn-primary" @click="onDownload(activeReport)">
            <span class="icon">⬇️</span>
            Download Report
          </button>
          <span class="file-size">{{ formatFileSize(activeReport.fileSize) }}</span>
        </div>
        <div v-if="activeReport.status === 'failed'" class="error-section">
          <span class="error-message">{{ activeReport.errorMessage }}</span>
          <button class="btn btn-secondary" @click="onGenerateReport">
            Retry
          </button>
        </div>
      </div>
    </div>

    <!-- History View -->
    <div v-else class="history-view">
      <div v-if="isLoadingHistory" class="loading-state">
        <div class="spinner"></div>
        <span>Loading report history...</span>
      </div>

      <div v-else-if="reports.length === 0" class="empty-state">
        <span class="empty-icon">📋</span>
        <h4>No Reports Yet</h4>
        <p>Generate your first report to see it here.</p>
      </div>

      <div v-else class="reports-list">
        <div
          v-for="report in reports"
          :key="report.id"
          class="report-card"
        >
          <div class="report-info">
            <div class="report-header">
              <span class="report-title">{{ report.title }}</span>
              <span :class="['status-badge', report.status]">
                {{ formatStatus(report.status) }}
              </span>
            </div>
            <div class="report-meta">
              <span class="report-type">{{ formatReportType(report.reportType) }}</span>
              <span class="report-date">{{ formatDate(report.createdAt) }}</span>
              <span v-if="report.fileSize" class="report-size">
                {{ formatFileSize(report.fileSize) }}
              </span>
            </div>
          </div>
          <div class="report-actions">
            <button
              v-if="report.status === 'completed'"
              class="btn btn-small btn-primary"
              @click="onDownload(report)"
            >
              Download
            </button>
            <button
              v-if="report.status === 'generating'"
              class="btn btn-small btn-secondary"
              @click="refreshReportStatus(report.id)"
            >
              Refresh
            </button>
            <button
              class="btn btn-small btn-danger"
              @click="onDeleteReport(report.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { riskDashboardService } from '@/services/riskDashboardService';
import type { Report, ReportConfig, ReportType, ReportStatus } from '@/types/risk-agent';

const props = defineProps<{
  scopeId: string;
  scopeName?: string;
}>();

const emit = defineEmits<{
  'report-generated': [report: Report];
  'error': [error: string];
}>();

// Report types
const reportTypes = [
  {
    value: 'comprehensive' as ReportType,
    label: 'Comprehensive',
    icon: '📊',
    description: 'Full analysis with all sections',
  },
  {
    value: 'executive' as ReportType,
    label: 'Executive Summary',
    icon: '📈',
    description: 'High-level overview for executives',
  },
  {
    value: 'detailed' as ReportType,
    label: 'Detailed Analysis',
    icon: '🔍',
    description: 'Deep dive into specific subjects',
  },
];

// Section options
const sections = [
  { key: 'includeExecutiveSummary', label: 'Executive Summary', icon: '📋' },
  { key: 'includeHeatmap', label: 'Risk Heatmap', icon: '🗺️' },
  { key: 'includeSubjectDetails', label: 'Subject Details', icon: '📑' },
  { key: 'includeCorrelations', label: 'Correlation Matrix', icon: '🔗' },
  { key: 'includeTrends', label: 'Historical Trends', icon: '📈' },
  { key: 'includeDimensionAnalysis', label: 'Dimension Analysis', icon: '📊' },
];

// State
const selectedType = ref<ReportType>('comprehensive');
const reportTitle = ref('');
const config = reactive<ReportConfig>({
  includeExecutiveSummary: true,
  includeHeatmap: true,
  includeSubjectDetails: true,
  includeCorrelations: true,
  includeTrends: true,
  includeDimensionAnalysis: true,
});
const dateRange = reactive({
  start: '',
  end: '',
});
const reports = ref<Report[]>([]);
const activeReport = ref<Report | null>(null);
const showHistory = ref(false);

// Loading states
const isGenerating = ref(false);
const isLoadingHistory = ref(false);

// Computed
const requiredSections = computed(() => {
  switch (selectedType.value) {
    case 'executive':
      return ['includeExecutiveSummary'];
    case 'detailed':
      return ['includeSubjectDetails', 'includeDimensionAnalysis'];
    default:
      return [];
  }
});

// Methods
function isRequiredSection(key: string): boolean {
  return requiredSections.value.includes(key);
}

async function loadReportHistory() {
  isLoadingHistory.value = true;
  try {
    const response = await riskDashboardService.listReports({
      scopeId: props.scopeId,
    });
    if (response.success && Array.isArray(response.content)) {
      reports.value = response.content;
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to load reports');
  } finally {
    isLoadingHistory.value = false;
  }
}

async function onGenerateReport() {
  if (!reportTitle.value.trim()) return;

  isGenerating.value = true;
  try {
    const reportConfig: ReportConfig = {
      ...config,
    };

    // Add date range if specified
    if (dateRange.start && dateRange.end) {
      reportConfig.dateRange = {
        start: dateRange.start,
        end: dateRange.end,
      };
    }

    // Ensure required sections are enabled
    requiredSections.value.forEach(key => {
      (reportConfig as unknown as Record<string, boolean>)[key] = true;
    });

    const response = await riskDashboardService.generateReport({
      scopeId: props.scopeId,
      title: reportTitle.value,
      reportType: selectedType.value,
      config: reportConfig,
    });

    if (response.success && response.content) {
      activeReport.value = response.content;
      reports.value = [response.content, ...reports.value];
      emit('report-generated', response.content);

      // Poll for completion if generating
      if (response.content.status === 'generating') {
        pollReportStatus(response.content.id);
      }
    } else {
      throw new Error(response.error?.message || 'Failed to generate report');
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to generate report');
  } finally {
    isGenerating.value = false;
  }
}

async function pollReportStatus(reportId: string) {
  const maxAttempts = 30;
  let attempts = 0;

  const poll = async () => {
    if (attempts >= maxAttempts) {
      emit('error', 'Report generation timed out');
      return;
    }

    attempts++;
    try {
      const response = await riskDashboardService.getReport(reportId);
      if (response.success && response.content) {
        const report = response.content;

        // Update active report
        activeReport.value = report;

        // Update in list
        const idx = reports.value.findIndex(r => r.id === reportId);
        if (idx !== -1) {
          reports.value[idx] = report;
        }

        // Continue polling if still generating
        if (report.status === 'generating') {
          setTimeout(poll, 2000);
        }
      }
    } catch {
      // Ignore polling errors
    }
  };

  setTimeout(poll, 2000);
}

async function refreshReportStatus(reportId: string) {
  try {
    const response = await riskDashboardService.getReport(reportId);
    if (response.success && response.content) {
      const idx = reports.value.findIndex(r => r.id === reportId);
      if (idx !== -1) {
        reports.value[idx] = response.content;
      }
      if (activeReport.value?.id === reportId) {
        activeReport.value = response.content;
      }
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to refresh status');
  }
}

async function onDownload(report: Report) {
  if (!report.downloadUrl) {
    // Try to refresh the download URL
    try {
      const response = await riskDashboardService.refreshDownloadUrl(report.id);
      if (response.success && response.content?.downloadUrl) {
        window.open(response.content.downloadUrl, '_blank');
        return;
      }
    } catch {
      // Fall through to error
    }
    emit('error', 'Download URL not available');
    return;
  }

  window.open(report.downloadUrl, '_blank');
}

async function onDeleteReport(reportId: string) {
  try {
    await riskDashboardService.deleteReport(reportId);
    reports.value = reports.value.filter(r => r.id !== reportId);
    if (activeReport.value?.id === reportId) {
      activeReport.value = null;
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : 'Failed to delete report');
  }
}

function clearDateRange() {
  dateRange.start = '';
  dateRange.end = '';
}

function formatStatus(status: ReportStatus): string {
  const statusMap: Record<ReportStatus, string> = {
    pending: 'Pending',
    generating: 'Generating...',
    completed: 'Completed',
    failed: 'Failed',
  };
  return statusMap[status] || status;
}

function formatReportType(type: ReportType): string {
  const typeMap: Record<ReportType, string> = {
    comprehensive: 'Comprehensive',
    executive: 'Executive',
    detailed: 'Detailed',
  };
  return typeMap[type] || type;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Watch for report type changes to update required sections
watch(selectedType, (type) => {
  // Set default title based on type
  if (!reportTitle.value) {
    const scopeName = props.scopeName || 'Portfolio';
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    reportTitle.value = `${scopeName} Risk Report - ${date}`;
  }

  // Enable required sections
  if (type === 'executive') {
    config.includeExecutiveSummary = true;
    config.includeSubjectDetails = false;
    config.includeDimensionAnalysis = false;
  } else if (type === 'detailed') {
    config.includeSubjectDetails = true;
    config.includeDimensionAnalysis = true;
  } else {
    // Comprehensive - enable all
    Object.keys(config).forEach(key => {
      (config as unknown as Record<string, boolean>)[key] = true;
    });
  }
});

// Lifecycle
onMounted(() => {
  // Set default title
  const scopeName = props.scopeName || 'Portfolio';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  reportTitle.value = `${scopeName} Risk Report - ${date}`;
});

watch(showHistory, (show) => {
  if (show) {
    loadReportHistory();
  }
});

watch(() => props.scopeId, () => {
  reports.value = [];
  activeReport.value = null;
  if (showHistory.value) {
    loadReportHistory();
  }
});

// Expose for parent components
defineExpose({
  generate: onGenerateReport,
  refresh: loadReportHistory,
});
</script>

<style scoped>
.report-generator {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.5rem;
}

.generator-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.header-left h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
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
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background-color: var(--btn-secondary-bg, #f3f4f6);
  color: var(--btn-secondary-text, #374151);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--btn-secondary-hover, #e5e7eb);
}

.btn-primary {
  background-color: var(--primary-color, #a87c4f);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #8f693f);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-small {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
}

.btn-danger {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.btn-danger:hover {
  background-color: rgba(239, 68, 68, 0.2);
}

.icon {
  font-size: 1rem;
}

.spinner,
.spinner-small {
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color, #e5e7eb);
  border-top-color: var(--primary-color, #a87c4f);
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Configuration View */
.config-section {
  margin-bottom: 1.5rem;
}

.config-section h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

/* Report Types */
.report-types {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
}

.report-type-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: var(--panel-bg, #f9fafb);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.report-type-card:hover {
  background: var(--hover-bg, #f3f4f6);
}

.report-type-card.selected {
  border-color: var(--primary-color, #a87c4f);
  background: rgba(168, 124, 79, 0.05);
}

.hidden-radio {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.type-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.type-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin-bottom: 0.25rem;
}

.type-description {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

/* Section Toggles */
.section-toggles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--panel-bg, #f9fafb);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.section-toggle:hover {
  background: var(--hover-bg, #f3f4f6);
}

.section-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary-color, #a87c4f);
}

.toggle-icon {
  font-size: 1rem;
}

.toggle-label {
  flex: 1;
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
}

.required-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: var(--ion-color-secondary, #15803d);
  color: white;
  border-radius: 4px;
  text-transform: uppercase;
}

/* Date Range */
.date-range {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.date-input {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.date-input label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.date-input input {
  padding: 0.5rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
}

/* Title Input */
.title-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 0.875rem;
}

/* Generate Section */
.generate-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.btn-generate {
  padding: 0.75rem 2rem;
  font-size: 1rem;
}

.generate-note {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin: 0;
}

/* Active Report Status */
.active-report-status {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--panel-bg, #f9fafb);
  border-radius: 8px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.status-title {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status-badge.pending {
  background: var(--badge-bg, #e5e7eb);
  color: var(--text-secondary, #6b7280);
}

.status-badge.generating {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-badge.completed {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-badge.failed {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.progress-bar {
  height: 4px;
  background: var(--border-color, #e5e7eb);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-fill {
  height: 100%;
  width: 0%;
  background: var(--ion-color-secondary, #15803d);
  animation: progress 2s ease-in-out infinite;
}

@keyframes progress {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}

.download-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.file-size {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.error-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.error-message {
  flex: 1;
  font-size: 0.875rem;
  color: #dc2626;
}

/* History View */
.history-view {
  min-height: 200px;
}

.reports-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.report-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--panel-bg, #f9fafb);
  border-radius: 8px;
}

.report-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.report-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.report-title {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.report-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.report-actions {
  display: flex;
  gap: 0.5rem;
}

/* Loading/Empty States */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.empty-icon {
  font-size: 2.5rem;
}

.empty-state h4 {
  margin: 0;
  color: var(--text-primary, #111827);
}

.empty-state p {
  margin: 0;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .report-generator {
    --text-primary: #f9fafb;
    --text-secondary: #9ca3af;
    --border-color: #374151;
    --card-bg: #1f2937;
    --panel-bg: #374151;
    --hover-bg: #4b5563;
    --btn-secondary-bg: #4b5563;
    --btn-secondary-text: #f9fafb;
    --btn-secondary-hover: #6b7280;
    --badge-bg: #4b5563;
  }

  .title-input,
  .date-input input {
    background: var(--panel-bg, #374151);
    color: var(--text-primary, #f9fafb);
  }
}
</style>
