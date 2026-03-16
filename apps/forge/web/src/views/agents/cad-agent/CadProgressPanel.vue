<template>
  <div class="cad-progress-panel">
    <!-- Current Stage Indicator -->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Generation Progress</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <!-- Stage Steps -->
        <div class="stage-steps">
          <div
            v-for="stage in stages"
            :key="stage.id"
            class="stage-step"
            :class="{
              'active': currentStage === stage.id,
              'completed': isStageCompleted(stage.id),
              'failed': currentStage === 'failed',
            }"
          >
            <div class="stage-icon">
              <ion-icon
                :icon="isStageCompleted(stage.id) ? checkmarkCircle : stage.icon"
              />
            </div>
            <div class="stage-label">{{ stage.label }}</div>
          </div>
        </div>

        <!-- Progress Bar -->
        <ion-progress-bar
          :value="progressPercent / 100"
          :color="currentStage === 'failed' ? 'danger' : 'primary'"
        ></ion-progress-bar>

        <div class="progress-text">
          {{ currentStage ? formatStage(currentStage) : 'Initializing...' }} ({{ progressPercent }}%)
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Execution Log -->
    <ion-card v-if="executionLog.length > 0">
      <ion-card-header>
        <ion-card-title>Execution Log</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <div class="execution-log">
          <div
            v-for="entry in executionLog"
            :key="entry.id"
            class="log-entry"
          >
            <div class="log-time">{{ formatTime(entry.createdAt) }}</div>
            <div class="log-step">{{ entry.stepType }}</div>
            <div v-if="entry.message" class="log-message">{{ entry.message }}</div>
            <div v-if="entry.durationMs" class="log-duration">{{ entry.durationMs }}ms</div>
          </div>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Code Preview -->
    <ion-card v-if="generatedCode">
      <ion-card-header>
        <ion-card-title>
          Generated OpenCASCADE.js Code
          <ion-button fill="clear" size="small" @click="codeExpanded = !codeExpanded">
            <ion-icon :icon="codeExpanded ? chevronUpOutline : chevronDownOutline" />
          </ion-button>
        </ion-card-title>
      </ion-card-header>
      <ion-card-content v-if="codeExpanded">
        <!-- Code Validation Status -->
        <div v-if="isCodeValid !== null" class="code-validation">
          <ion-badge :color="isCodeValid ? 'success' : 'danger'">
            {{ isCodeValid ? 'Valid' : 'Invalid' }}
          </ion-badge>
          <span v-if="codeAttempt > 0" class="attempt-count">
            Attempt {{ codeAttempt }}
          </span>
        </div>

        <!-- Validation Errors -->
        <div v-if="validationErrors.length > 0" class="validation-errors">
          <h4>Validation Errors:</h4>
          <ul>
            <li v-for="(validationErr, index) in validationErrors" :key="index">{{ validationErr }}</li>
          </ul>
        </div>

        <!-- Code Display -->
        <div class="code-preview">
          <pre><code>{{ generatedCode }}</code></pre>
        </div>
      </ion-card-content>
    </ion-card>

    <!-- Error Display -->
    <ion-card v-if="error" color="danger">
      <ion-card-header>
        <ion-card-title>Error</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        {{ error }}
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonProgressBar,
  IonIcon,
  IonButton,
  IonBadge,
} from '@ionic/vue';
import {
  checkmarkCircle,
  codeSlashOutline,
  cubeOutline,
  settingsOutline,
  cloudUploadOutline,
  chevronUpOutline,
  chevronDownOutline,
} from 'ionicons/icons';
import { useCadAgentStore } from '@/stores/cadAgentStore';

const store = useCadAgentStore();

// Local state
const codeExpanded = ref(false);

// Stages definition
const stages = [
  { id: 'prompt_received', label: 'Prompt', icon: settingsOutline },
  { id: 'constraints_applied', label: 'Constraints', icon: settingsOutline },
  { id: 'llm_started', label: 'LLM Started', icon: codeSlashOutline },
  { id: 'llm_completed', label: 'LLM Done', icon: codeSlashOutline },
  { id: 'code_validation', label: 'Validate', icon: checkmarkCircle },
  { id: 'execution_started', label: 'Execute', icon: cubeOutline },
  { id: 'execution_completed', label: 'Complete', icon: cubeOutline },
  { id: 'export_completed', label: 'Export', icon: cloudUploadOutline },
];

// Computed properties from store
const currentStage = computed(() => store.currentStage);
const progressPercent = computed(() => store.progressPercent);
const executionLog = computed(() => store.executionLog);
const generatedCode = computed(() => store.generatedCode);
const isCodeValid = computed(() => store.isCodeValid);
const validationErrors = computed(() => store.validationErrors);
const codeAttempt = computed(() => store.codeAttempt);
const error = computed(() => store.error);

// Stage helpers
const stageOrder = [
  'prompt_received',
  'constraints_applied',
  'llm_started',
  'llm_completed',
  'code_validation',
  'execution_started',
  'execution_completed',
  'export_completed',
];

function isStageCompleted(stageId: string): boolean {
  if (!currentStage.value) return false;
  const currentIndex = stageOrder.indexOf(currentStage.value);
  const stageIndex = stageOrder.indexOf(stageId);
  return stageIndex < currentIndex;
}

function formatStage(stage: string): string {
  const stageLabels: Record<string, string> = {
    'prompt_received': 'Prompt Received',
    'constraints_applied': 'Constraints Applied',
    'llm_started': 'LLM Processing Started',
    'llm_completed': 'LLM Processing Completed',
    'code_validation': 'Validating Code',
    'execution_started': 'Executing Code',
    'execution_completed': 'Execution Completed',
    'export_completed': 'Export Completed',
    'failed': 'Failed',
  };
  return stageLabels[stage] || stage;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}
</script>

<style scoped>
.cad-progress-panel {
  padding: 16px;
}

/* Stage Steps */
.stage-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.stage-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.5;
  transition: opacity 0.3s, transform 0.3s;
  min-width: 60px;
}

.stage-step.active {
  opacity: 1;
  transform: scale(1.1);
}

.stage-step.completed {
  opacity: 1;
}

.stage-step.completed .stage-icon {
  color: var(--ion-color-success);
}

.stage-step.failed .stage-icon {
  color: var(--ion-color-danger);
}

.stage-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.stage-label {
  font-size: 0.7rem;
  text-align: center;
}

.progress-text {
  text-align: center;
  margin-top: 8px;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

/* Execution Log */
.execution-log {
  max-height: 300px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.85rem;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--ion-color-light);
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: var(--ion-color-medium);
  font-size: 0.75rem;
  min-width: 80px;
}

.log-step {
  font-weight: 600;
  min-width: 120px;
}

.log-message {
  flex: 1;
  color: var(--ion-color-medium-shade);
}

.log-duration {
  color: var(--ion-color-primary);
  font-size: 0.75rem;
  min-width: 60px;
  text-align: right;
}

/* Code Preview */
.code-validation {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.attempt-count {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.validation-errors {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--ion-color-danger-tint);
  border-radius: 8px;
}

.validation-errors h4 {
  margin: 0 0 8px 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.validation-errors ul {
  margin: 0;
  padding-left: 20px;
  font-size: 0.875rem;
}

.code-preview {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.code-preview pre {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.code-preview code {
  color: var(--ion-color-dark);
}

ion-card {
  margin-bottom: 16px;
}



html[data-theme="dark"] .code-preview {
  background: #2d3748;
}

html[data-theme="dark"] .code-preview code {
  color: #f7fafc;
}
</style>
