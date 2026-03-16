<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isVisible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content analysis-progress-modal" :class="{ 'batch-mode': batchMode }">
          <!-- Batch Header (shown when in batch mode) -->
          <div v-if="batchMode && batchProgress" class="batch-header">
            <div class="batch-title">
              <span class="batch-label">Batch Analysis:</span>
              <span class="batch-subject">{{ batchProgress.currentSubject }}</span>
              <span class="batch-count">({{ batchProgress.current }} of {{ batchProgress.total }})</span>
            </div>
            <div class="batch-progress-dots">
              <span
                v-for="subject in batchProgress.subjects"
                :key="subject"
                class="batch-dot"
                :class="{
                  'completed': batchProgress.completedSubjects.includes(subject),
                  'current': subject === batchProgress.currentSubject,
                  'pending': !batchProgress.completedSubjects.includes(subject) && subject !== batchProgress.currentSubject
                }"
                :title="subject"
              >
                {{ batchProgress.completedSubjects.includes(subject) ? '✓' : (subject === batchProgress.currentSubject ? '◉' : '○') }}
              </span>
            </div>
            <div class="batch-phase">
              <span class="phase-label">Phase:</span>
              <span class="phase-value" :class="batchProgress.currentPhase">
                {{ batchProgress.currentPhase === 'analysis' ? 'Risk Analysis' : batchProgress.currentPhase === 'debate' ? 'Red vs Blue Debate' : 'Executive Summary' }}
              </span>
            </div>
          </div>

          <div class="modal-header">
            <h3>{{ modalTitle }}</h3>
            <div class="header-badge" :class="statusClass">{{ statusLabel }}</div>
          </div>

          <div class="modal-body">
            <!-- Subject Info -->
            <div class="subject-info">
              <span class="subject-label">{{ batchMode ? 'Current:' : 'Analyzing:' }}</span>
              <span class="subject-name">{{ subjectIdentifier }}</span>
            </div>

            <!-- Progress Bar -->
            <div class="progress-container">
              <div class="progress-bar-wrapper">
                <div
                  class="progress-bar"
                  :style="{ width: `${progress}%` }"
                  :class="{ 'progress-complete': progress >= 100 }"
                ></div>
              </div>
              <span class="progress-text">{{ progress }}%</span>
            </div>

            <!-- Current Step -->
            <div class="current-step">
              <span class="step-icon" :class="stepIconClass">{{ stepIcon }}</span>
              <span class="step-message">{{ currentMessage }}</span>
            </div>

            <!-- Dimension Progress -->
            <div v-if="dimensionProgress.length > 0" class="dimensions-progress">
              <h4>Dimension Analysis</h4>
              <div class="dimension-list">
                <div
                  v-for="dim in dimensionProgress"
                  :key="dim.slug"
                  class="dimension-item"
                  :class="dim.status"
                >
                  <span class="dim-status-icon">{{ getDimIcon(dim.status) }}</span>
                  <span class="dim-name">{{ dim.name }}</span>
                  <span v-if="dim.score !== null" class="dim-score">{{ formatScore(dim.score) }}</span>
                </div>
              </div>
            </div>

            <!-- Error Message -->
            <div v-if="error" class="error-message">
              <span class="error-icon">⚠</span>
              <span>{{ error }}</span>
            </div>

            <!-- No Data Message -->
            <div v-if="isNoData" class="no-data-message">
              <div class="no-data-icon">📭</div>
              <div class="no-data-title">No Analysis Data Available</div>
              <div class="no-data-text">{{ noDataMessage }}</div>
              <div class="no-data-hint">Analysis requires recent market data from processed articles. Try again after new articles are processed.</div>
            </div>

            <!-- Result Summary (when complete) - Analysis Mode -->
            <div v-if="isComplete && result && mode === 'analysis'" class="result-summary">
              <div class="result-row">
                <span class="result-label">Overall Risk Score:</span>
                <span class="result-value score-value" :class="getScoreClass(result.overallScore / 100)">
                  {{ formatScore(result.overallScore) }}
                </span>
              </div>
              <div class="result-row">
                <span class="result-label">Confidence:</span>
                <span class="result-value">{{ formatPercent(result.confidence) }}</span>
              </div>
              <div class="result-row">
                <span class="result-label">Dimensions Analyzed:</span>
                <span class="result-value">{{ result.assessmentCount }}</span>
              </div>
              <div v-if="result.debateTriggered" class="result-row debate-triggered">
                <span class="result-label">Red vs Blue Debate:</span>
                <span class="result-value">Triggered</span>
              </div>
            </div>

            <!-- Result Summary (when complete) - Debate Mode -->
            <div v-if="isComplete && result && mode === 'debate'" class="result-summary">
              <div class="result-row">
                <span class="result-label">Final Score:</span>
                <span class="result-value score-value" :class="getScoreClass(result.overallScore / 100)">
                  {{ formatScore(result.overallScore) }}
                </span>
              </div>
              <div class="result-row">
                <span class="result-label">Agents Completed:</span>
                <span class="result-value">{{ result.assessmentCount }} (Blue, Red, Arbiter)</span>
              </div>
            </div>

            <!-- Result Summary (when complete) - Summary Mode -->
            <div v-if="isComplete && mode === 'summary'" class="result-summary">
              <div class="result-row">
                <span class="result-label">Summary Generated:</span>
                <span class="result-value" style="color: #10b981;">Complete</span>
              </div>
              <div class="result-row">
                <span class="result-label">Key Findings:</span>
                <span class="result-value">{{ result?.assessmentCount || 0 }} findings</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button
              v-if="!isComplete && !isNoData"
              class="btn-cancel"
              @click="handleCancel"
              :disabled="progress > 80"
            >
              Cancel
            </button>
            <button
              v-if="isComplete || isNoData"
              class="btn-close"
              @click="handleClose"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { tokenStorage } from '@/services/tokenStorageService';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

interface DimensionProgress {
  slug: string;
  name: string;
  status: 'pending' | 'analyzing' | 'complete' | 'error';
  score: number | null;
}

interface AnalysisResult {
  overallScore: number;
  confidence: number;
  assessmentCount: number;
  debateTriggered: boolean;
}

interface ProgressEvent {
  step: string;
  message: string;
  progress: number;
  dimensionSlug?: string;
  currentDimension?: string;
  totalDimensions?: number;
  overallScore?: number;
  confidence?: number;
  assessmentCount?: number;
  debateTriggered?: boolean;
}

interface BatchProgress {
  current: number;
  total: number;
  subjects: string[];
  currentSubject: string;
  completedSubjects: string[];
  currentPhase: 'analysis' | 'debate' | 'summary';
}

interface Props {
  isVisible: boolean;
  subjectIdentifier: string;
  taskId?: string;
  mode?: 'analysis' | 'debate' | 'summary';
  batchMode?: boolean;
  batchProgress?: BatchProgress | null;
}

const props = withDefaults(defineProps<Props>(), {
  taskId: undefined,
  mode: 'analysis',
  batchMode: false,
  batchProgress: null,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'cancel'): void;
  (e: 'complete', result: AnalysisResult): void;
}>();

// State
const progress = ref(0);
const currentStep = ref('initializing');
const currentMessage = ref('Initializing analysis...');
const dimensionProgress = ref<DimensionProgress[]>([]);
const error = ref<string | null>(null);
const isComplete = ref(false);
const isNoData = ref(false);
const noDataMessage = ref<string | null>(null);
const result = ref<AnalysisResult | null>(null);

// SSE connection
let eventSource: EventSource | null = null;

// Computed
const modalTitle = computed(() => {
  switch (props.mode) {
    case 'debate': return 'Red vs Blue Debate';
    case 'summary': return 'Executive Summary';
    default: return 'Risk Analysis';
  }
});

const statusClass = computed(() => {
  if (error.value) return 'status-error';
  if (isNoData.value) return 'status-no-data';
  if (isComplete.value) return 'status-complete';
  return 'status-running';
});

const statusLabel = computed(() => {
  if (error.value) return 'Error';
  if (isNoData.value) return 'No Data';
  if (isComplete.value) return 'Complete';
  return 'Running';
});

const stepIcon = computed(() => {
  if (error.value) return '⚠';
  if (isNoData.value) return 'ℹ️';
  if (isComplete.value) return '✔';
  if (currentStep.value.startsWith('analyzing-')) return '🔍';
  // Debate-specific icons
  if (currentStep.value === 'running-blue-agent' || currentStep.value === 'blue-complete') return '🛡️';
  if (currentStep.value === 'running-red-agent' || currentStep.value === 'red-complete') return '⚔️';
  if (currentStep.value === 'running-arbiter' || currentStep.value === 'arbiter-complete') return '⚖️';
  if (currentStep.value === 'running-debate' || currentStep.value.startsWith('debate-')) return '⚔';
  // Summary-specific icons
  if (currentStep.value === 'gathering-data' || currentStep.value === 'data-gathered') return '📊';
  if (currentStep.value === 'generating-summary' || currentStep.value === 'summary-generated') return '📝';
  if (currentStep.value.startsWith('summary-')) return '📋';
  return '⏳';
});

const stepIconClass = computed(() => {
  if (error.value) return 'icon-error';
  if (isNoData.value) return 'icon-no-data';
  if (isComplete.value) return 'icon-complete';
  return 'icon-running';
});

// Methods
// formatPercent: For 0-1 values like confidence
function formatPercent(value: number): string {
  if (value === undefined || value === null) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

// formatScore: For 0-100 values like overallScore (from API)
function formatScore(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  // Score is already 0-100, just format it
  return `${value.toFixed(1)}%`;
}

function getScoreClass(score: number): string {
  if (score >= 0.7) return 'score-high';
  if (score >= 0.4) return 'score-medium';
  return 'score-low';
}

function getDimIcon(status: string): string {
  switch (status) {
    case 'complete': return '✔';
    case 'analyzing': return '⏳';
    case 'error': return '✘';
    default: return '○';
  }
}

function handleProgressEvent(event: ProgressEvent) {
  progress.value = event.progress;
  currentStep.value = event.step;
  currentMessage.value = event.message;

  // Update dimension progress
  if (event.dimensionSlug && event.currentDimension) {
    const existingIndex = dimensionProgress.value.findIndex(d => d.slug === event.dimensionSlug);
    if (existingIndex >= 0) {
      dimensionProgress.value[existingIndex].status = 'analyzing';
    } else {
      dimensionProgress.value.push({
        slug: event.dimensionSlug,
        name: event.currentDimension,
        status: 'analyzing',
        score: null,
      });
    }
  }

  // Handle completion
  if (event.step === 'complete') {
    isComplete.value = true;
    result.value = {
      overallScore: event.overallScore || 0,
      confidence: event.confidence || 0,
      assessmentCount: event.assessmentCount || 0,
      debateTriggered: event.debateTriggered || false,
    };

    // Mark all dimensions as complete
    dimensionProgress.value = dimensionProgress.value.map(d => ({
      ...d,
      status: 'complete' as const,
    }));

    emit('complete', result.value);
  }
}

async function connectToSSE() {
  if (!props.taskId) {
    console.log('[AnalysisProgressModal] No taskId provided, skipping SSE connection');
    return;
  }

  const baseUrl = getSecureApiBaseUrl();

  // Use /observability/stream endpoint like prediction does
  // Filter client-side by taskId since the endpoint doesn't have that filter
  try {
    const jwtToken = await tokenStorage.getAccessToken();
    console.log('[AnalysisProgressModal] Got JWT token:', jwtToken ? 'yes' : 'no');

    if (!jwtToken) {
      console.error('[AnalysisProgressModal] No JWT token available');
      return;
    }

    const queryParams = new URLSearchParams();
    queryParams.append('token', jwtToken);
    // No server-side taskId filter, but we can filter by source app
    // Events will be filtered client-side by taskId

    const url = `${baseUrl}/observability/stream?${queryParams.toString()}`;
    console.log('[AnalysisProgressModal] Connecting to observability stream for taskId:', props.taskId);
    eventSource = new EventSource(url);
  } catch (err) {
    console.error('[AnalysisProgressModal] Error connecting to SSE:', err);
    return;
  }

  // Handle observability stream messages (same format as prediction activity feed)
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // Skip connection events
      if (data.event_type === 'connected') {
        console.log('[AnalysisProgressModal] Connected to observability stream');
        return;
      }

      // Filter by taskId - only process events for our specific task
      const eventTaskId = data.context?.taskId;
      if (eventTaskId !== props.taskId) {
        // Not our task, ignore
        return;
      }

      // Check if this is a risk analysis, debate, or summary progress event
      const isAnalysisEvent = data.source_app === 'risk-analysis' || data.hook_event_type === 'risk.analysis.progress';
      const isDebateEvent = data.source_app === 'risk-debate' || data.hook_event_type === 'risk.debate.progress';
      const isSummaryEvent = data.source_app === 'risk-summary' || data.hook_event_type === 'risk.summary.progress';

      if (isAnalysisEvent || isDebateEvent || isSummaryEvent) {
        console.log('[AnalysisProgressModal] Risk progress event:', data.step, data.message);

        // Extract progress data from observability event format
        const payload = data.payload || {};
        handleProgressEvent({
          step: data.step || payload.step || 'unknown',
          message: data.message || '',
          progress: data.progress || payload.progress || 0,
          dimensionSlug: payload.dimensionSlug,
          currentDimension: payload.currentDimension,
          totalDimensions: payload.totalDimensions,
          overallScore: payload.overallScore,
          confidence: payload.confidence,
          assessmentCount: payload.assessmentCount,
          debateTriggered: payload.debateTriggered,
        });
      }
    } catch (e) {
      console.warn('[AnalysisProgressModal] Failed to parse SSE message:', e);
    }
  };

  eventSource.onopen = () => {
    console.log('[AnalysisProgressModal] SSE connection opened');
  };

  eventSource.onerror = (e) => {
    console.warn('[AnalysisProgressModal] SSE error:', e);
    // SSE connection lost - may happen if task completes
    if (!isComplete.value && progress.value < 100) {
      // Only show error if we weren't done
      console.warn('[AnalysisProgressModal] SSE connection lost while in progress');
    }
  };
}

function disconnectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function handleCancel() {
  disconnectSSE();
  emit('cancel');
}

function handleClose() {
  disconnectSSE();
  emit('close');
}

// Watch for visibility and taskId to connect/disconnect SSE
watch([() => props.isVisible, () => props.taskId], ([visible, taskId]) => {
  console.log('[AnalysisProgressModal] Watch triggered: visible=', visible, 'taskId=', taskId);
  if (visible && taskId) {
    // Reset state
    progress.value = 0;
    currentStep.value = 'initializing';
    currentMessage.value = 'Initializing analysis...';
    dimensionProgress.value = [];
    error.value = null;
    isComplete.value = false;
    isNoData.value = false;
    noDataMessage.value = null;
    result.value = null;

    // connectToSSE is async but we don't need to await it
    void connectToSSE();
  } else if (!visible) {
    disconnectSSE();
  }
}, { immediate: true });

// Cleanup on unmount
onUnmounted(() => {
  disconnectSSE();
});

// Expose method for parent to push progress updates (polling fallback)
defineExpose({
  handleProgressEvent,
  setError: (msg: string) => { error.value = msg; },
  setNoData: (msg: string) => {
    console.log('[AnalysisProgressModal] setNoData called with:', msg);
    isNoData.value = true;
    noDataMessage.value = msg;
    progress.value = 100;
    currentStep.value = 'no-data';
    currentMessage.value = msg;
    console.log('[AnalysisProgressModal] No data state set');
  },
  setComplete: (res: AnalysisResult) => {
    console.log('[AnalysisProgressModal] setComplete called with:', res);
    isComplete.value = true;
    progress.value = 100;
    result.value = res;
    currentStep.value = 'complete';
    // Set appropriate completion message based on mode
    if (props.mode === 'summary') {
      currentMessage.value = `Executive summary generated with ${res.assessmentCount} key findings`;
    } else if (props.mode === 'debate') {
      currentMessage.value = `Debate complete: final score ${res.overallScore.toFixed(0)}%`;
    } else {
      // overallScore is already 0-100 from API, no need to multiply
      currentMessage.value = `Analysis complete: ${res.overallScore.toFixed(0)}% risk score`;
    }
    // Mark all dimensions as complete
    dimensionProgress.value = dimensionProgress.value.map(d => ({
      ...d,
      status: 'complete' as const,
    }));
    console.log('[AnalysisProgressModal] State updated - isComplete:', isComplete.value, 'progress:', progress.value, 'result:', result.value);
  },
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: var(--ion-card-background, #fff);
  border-radius: 12px;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
  background: var(--ion-color-light, #f4f5f8);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.header-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-running {
  background: #15803d;
  color: white;
}

.status-complete {
  background: #10b981;
  color: white;
}

.status-error {
  background: #ef4444;
  color: white;
}

.status-no-data {
  background: #6b7280;
  color: white;
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  max-height: calc(80vh - 130px);
}

.subject-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.subject-label {
  color: #4b5563;
  font-size: 0.875rem;
}

.subject-name {
  font-weight: 600;
  font-size: 1rem;
  color: #1f2937;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.progress-bar-wrapper {
  flex: 1;
  height: 8px;
  background: var(--ion-color-light, #e0e0e0);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #15803d, #16a34a);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar.progress-complete {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
  color: #1f2937;
}

.current-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.step-icon {
  font-size: 1.25rem;
}

.icon-running {
  animation: pulse 1.5s ease-in-out infinite;
}

.icon-complete {
  color: #10b981;
}

.icon-error {
  color: #ef4444;
}

.icon-no-data {
  color: #6b7280;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.step-message {
  font-size: 0.875rem;
  color: #1f2937;
}

.dimensions-progress {
  margin-bottom: 1rem;
}

.dimensions-progress h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: #4b5563;
}

.dimension-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dimension-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8125rem;
}

.dimension-item.pending {
  opacity: 0.5;
}

.dimension-item.analyzing {
  background: rgba(21, 128, 61, 0.1);
}

.dimension-item.complete {
  background: rgba(16, 185, 129, 0.1);
}

.dimension-item.error {
  background: rgba(239, 68, 68, 0.1);
}

.dim-status-icon {
  width: 16px;
  text-align: center;
}

.dim-name {
  flex: 1;
}

.dim-score {
  font-weight: 600;
  color: var(--ion-color-primary, #3880ff);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.error-icon {
  font-size: 1.25rem;
}

.no-data-message {
  text-align: center;
  padding: 1.5rem;
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 12px;
  margin-bottom: 1rem;
}

.no-data-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
}

.no-data-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.5rem;
}

.no-data-text {
  font-size: 0.875rem;
  color: #4b5563;
  margin-bottom: 0.75rem;
}

.no-data-hint {
  font-size: 0.75rem;
  color: #6b7280;
  font-style: italic;
}

.result-summary {
  background: var(--ion-color-light, #f4f5f8);
  border-radius: 8px;
  padding: 1rem;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.result-row:last-child {
  border-bottom: none;
}

.result-label {
  color: #4b5563;
  font-size: 0.875rem;
}

.result-value {
  font-weight: 600;
  font-size: 0.9375rem;
  color: #1f2937;
}

.score-value {
  font-size: 1.125rem;
}

.score-high {
  color: #dc2626;
}

.score-medium {
  color: #f59e0b;
}

.score-low {
  color: #10b981;
}

.debate-triggered .result-value {
  color: #8b5cf6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
  background: var(--ion-color-light, #f4f5f8);
}

.btn-cancel,
.btn-close {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--ion-color-medium, #666);
  color: var(--ion-color-medium, #666);
}

.btn-cancel:hover:not(:disabled) {
  background: var(--ion-color-light-shade, #e0e0e0);
}

.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-close {
  background: var(--ion-color-primary, #3880ff);
  border: none;
  color: white;
}

.btn-close:hover {
  background: var(--ion-color-primary-shade, #3171e0);
}

/* Modal transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* Batch Mode Styles */
.modal-content.batch-mode {
  max-width: 540px;
}

.batch-header {
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, var(--ion-color-primary, #3880ff) 0%, var(--ion-color-primary-shade, #3171e0) 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.batch-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.batch-label {
  font-size: 0.8125rem;
  opacity: 0.9;
}

.batch-subject {
  font-weight: 600;
  font-size: 1rem;
}

.batch-count {
  font-size: 0.8125rem;
  opacity: 0.8;
}

.batch-progress-dots {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.batch-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 0.75rem;
  border-radius: 50%;
  transition: all 0.2s;
}

.batch-dot.completed {
  background: rgba(255, 255, 255, 0.3);
  color: white;
}

.batch-dot.current {
  background: white;
  color: var(--ion-color-primary, #3880ff);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.batch-dot.pending {
  background: transparent;
  opacity: 0.5;
}

.batch-phase {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.phase-label {
  opacity: 0.8;
}

.phase-value {
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-weight: 500;
}

.phase-value.analysis {
  background: rgba(21, 128, 61, 0.3);
}

.phase-value.debate {
  background: rgba(239, 68, 68, 0.3);
}

.phase-value.summary {
  background: rgba(16, 185, 129, 0.3);
}

/* Dark mode */
html.ion-palette-dark .analysis-progress-modal,
html[data-theme="dark"] .analysis-progress-modal {
  background: var(--dark-bg-secondary, #1f2937);
}

html.ion-palette-dark .analysis-progress-modal .modal-header,
html[data-theme="dark"] .analysis-progress-modal .modal-header,
html.ion-palette-dark .analysis-progress-modal .modal-footer,
html[data-theme="dark"] .analysis-progress-modal .modal-footer {
  background: var(--dark-bg-tertiary, #2d3748);
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .analysis-progress-modal .current-step,
html[data-theme="dark"] .analysis-progress-modal .current-step,
html.ion-palette-dark .analysis-progress-modal .result-summary,
html[data-theme="dark"] .analysis-progress-modal .result-summary,
html.ion-palette-dark .analysis-progress-modal .no-data-message,
html[data-theme="dark"] .analysis-progress-modal .no-data-message {
  background: var(--dark-bg-tertiary, #2d3748);
}

html.ion-palette-dark .analysis-progress-modal .progress-bar-wrapper,
html[data-theme="dark"] .analysis-progress-modal .progress-bar-wrapper {
  background: var(--dark-bg-quaternary, #374151);
}

html.ion-palette-dark .analysis-progress-modal .result-row,
html[data-theme="dark"] .analysis-progress-modal .result-row {
  border-color: var(--dark-border-subtle, #374151);
}

html.ion-palette-dark .analysis-progress-modal .batch-header,
html[data-theme="dark"] .analysis-progress-modal .batch-header {
  background: linear-gradient(135deg, rgba(21, 128, 61, 0.2) 0%, rgba(21, 128, 61, 0.15) 100%);
}

html.ion-palette-dark .analysis-progress-modal .btn-cancel,
html[data-theme="dark"] .analysis-progress-modal .btn-cancel {
  border-color: var(--dark-text-muted, #a0aec0);
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .analysis-progress-modal .btn-cancel:hover:not(:disabled),
html[data-theme="dark"] .analysis-progress-modal .btn-cancel:hover:not(:disabled) {
  background: var(--dark-bg-quaternary, #374151);
}
</style>
