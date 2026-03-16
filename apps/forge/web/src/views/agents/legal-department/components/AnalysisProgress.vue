<template>
  <div class="analysis-progress">
    <div class="progress-header">
      <h2>Analyzing Document</h2>
      <p>{{ currentPhaseText }}</p>
    </div>

    <!-- Progress Bar -->
    <div class="progress-bar-container">
      <ion-progress-bar :value="progressPercentage" />
      <p class="progress-text">{{ progressPercentage * 100 }}% Complete</p>
    </div>

    <!-- Phase Indicators -->
    <div class="phases">
      <div
        v-for="phase in phases"
        :key="phase.id"
        class="phase-item"
        :class="{
          'active': phase.id === currentPhase,
          'completed': isPhaseCompleted(phase.id),
        }"
      >
        <div class="phase-icon">
          <ion-icon
            v-if="isPhaseCompleted(phase.id)"
            :icon="checkmarkCircleOutline"
            color="success"
          />
          <ion-spinner
            v-else-if="phase.id === currentPhase"
            name="crescent"
          />
          <ion-icon
            v-else
            :icon="ellipseOutline"
            color="medium"
          />
        </div>
        <div class="phase-info">
          <h3>{{ phase.title }}</h3>
          <p>{{ phase.description }}</p>
        </div>
      </div>
    </div>

    <!-- Current Step -->
    <div v-if="currentStep" class="current-step">
      <ion-icon :icon="timeOutline" />
      <p>{{ currentStep }}</p>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-container">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ error }}</p>
      <ion-button @click="handleRetry">Retry</ion-button>
    </div>

    <!-- Live Updates (if using SSE) -->
    <div v-if="showLiveUpdates" class="live-updates">
      <div class="update-header">
        <ion-icon :icon="pulseOutline" />
        <h3>Live Updates</h3>
      </div>
      <div class="updates-list">
        <div
          v-for="update in recentUpdates"
          :key="update.id"
          class="update-item"
        >
          <span class="update-time">{{ formatTime(update.timestamp) }}</span>
          <span class="update-message">{{ update.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import {
  IonProgressBar,
  IonIcon,
  IonSpinner,
  IonButton,
} from '@ionic/vue';
import {
  checkmarkCircleOutline,
  ellipseOutline,
  alertCircleOutline,
  timeOutline,
  pulseOutline,
} from 'ionicons/icons';
import type { AnalysisPhase } from '../legalDepartmentTypes';

// Props
const props = defineProps<{
  currentPhase: AnalysisPhase;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  currentStep?: string;
  error?: string;
  showLiveUpdates?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: 'retry'): void;
}>();

// Phase definitions
const phases = [
  {
    id: 'initializing' as AnalysisPhase,
    title: 'Initializing',
    description: 'Preparing document for analysis',
  },
  {
    id: 'extracting' as AnalysisPhase,
    title: 'Extracting Content',
    description: 'Reading and parsing document content',
  },
  {
    id: 'analyzing' as AnalysisPhase,
    title: 'Analyzing Document',
    description: 'Identifying key terms and clauses',
  },
  {
    id: 'identifying_risks' as AnalysisPhase,
    title: 'Identifying Risks',
    description: 'Detecting potential legal risks',
  },
  {
    id: 'generating_recommendations' as AnalysisPhase,
    title: 'Generating Recommendations',
    description: 'Creating actionable recommendations',
  },
  {
    id: 'completed' as AnalysisPhase,
    title: 'Complete',
    description: 'Analysis finished successfully',
  },
];

// Recent updates for live feed
interface LiveUpdate {
  id: string;
  timestamp: string;
  message: string;
}

const recentUpdates = ref<LiveUpdate[]>([
  { id: '1', timestamp: new Date().toISOString(), message: 'Document uploaded successfully' },
  { id: '2', timestamp: new Date().toISOString(), message: 'Starting text extraction' },
]);

// Computed
const progressPercentage = computed(() => {
  return props.progress.percentage / 100;
});

const currentPhaseText = computed(() => {
  const phase = phases.find((p) => p.id === props.currentPhase);
  return phase ? phase.description : 'Processing...';
});

// Methods
function isPhaseCompleted(phaseId: AnalysisPhase): boolean {
  const phaseOrder: AnalysisPhase[] = [
    'initializing',
    'uploading',
    'extracting',
    'analyzing',
    'identifying_risks',
    'generating_recommendations',
    'completed',
  ];

  const currentIndex = phaseOrder.indexOf(props.currentPhase);
  const checkIndex = phaseOrder.indexOf(phaseId);

  return checkIndex < currentIndex;
}

function handleRetry() {
  emit('retry');
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
</script>

<style scoped>
.analysis-progress {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.progress-header {
  text-align: center;
  margin-bottom: 32px;
}

.progress-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.progress-header p {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 16px;
}

.progress-bar-container {
  margin-bottom: 48px;
}

.progress-text {
  text-align: center;
  margin-top: 8px;
  font-size: 14px;
  color: var(--ion-color-medium);
}

.phases {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.phase-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
  transition: all 0.3s ease;
}

.phase-item.active {
  background: rgba(var(--ion-color-primary-rgb), 0.12);
  border-left: 4px solid var(--ion-color-primary);
}

.phase-item.completed {
  opacity: 0.7;
}

.phase-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.phase-icon ion-icon {
  font-size: 32px;
}

.phase-icon ion-spinner {
  width: 28px;
  height: 28px;
}

.phase-info {
  flex: 1;
}

.phase-info h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
}

.phase-info p {
  margin: 0;
  font-size: 14px;
  color: var(--ion-color-medium);
}

.current-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  margin-bottom: 24px;
  border: 1px solid var(--ion-color-light-shade);
}

.current-step ion-icon {
  font-size: 24px;
  color: var(--ion-color-primary);
}

.current-step p {
  margin: 0;
  font-size: 14px;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: rgba(var(--ion-color-danger-rgb), 0.08);
  border-radius: 8px;
  margin-bottom: 24px;
}

.error-container ion-icon {
  font-size: 48px;
}

.error-container p {
  margin: 0;
  text-align: center;
  color: var(--ion-color-danger-shade);
}

.live-updates {
  margin-top: 32px;
  padding: 24px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
}

.update-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.update-header ion-icon {
  font-size: 24px;
  color: var(--ion-color-primary);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.update-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.updates-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.update-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ion-color-medium-tint);
}

.update-item:last-child {
  border-bottom: none;
}

.update-time {
  font-size: 12px;
  color: var(--ion-color-medium);
  min-width: 80px;
}

.update-message {
  font-size: 14px;
}
</style>
