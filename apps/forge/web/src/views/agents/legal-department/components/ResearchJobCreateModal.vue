<template>
  <ion-modal :is-open="open" @did-dismiss="handleDismiss" class="research-create-modal">
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Research a Legal Question</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="handleDismiss">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <form class="modal-form" @submit.prevent="handleSubmit">

          <!-- Legal question -->
          <div class="form-field">
            <label class="field-label" for="legal-question">
              Legal Question <span class="required">*</span>
            </label>
            <ion-textarea
              id="legal-question"
              v-model="form.question"
              placeholder="Describe the legal question you need researched…"
              :rows="4"
              auto-grow
              :class="{ 'field-error': showErrors && !form.question.trim() }"
            />
            <p v-if="showErrors && !form.question.trim()" class="error-hint">
              A legal question is required.
            </p>
          </div>

          <!-- Jurisdiction -->
          <div class="form-field">
            <label class="field-label" for="jurisdiction">Jurisdiction</label>
            <ion-input
              id="jurisdiction"
              v-model="form.jurisdiction"
              placeholder="e.g. California, Federal, EU, Delaware"
            />
          </div>

          <!-- Practice area -->
          <div class="form-field">
            <label class="field-label" for="practice-area">Practice Area</label>
            <ion-select
              id="practice-area"
              v-model="form.practiceArea"
              placeholder="Select a practice area (optional)"
              interface="popover"
            >
              <ion-select-option value="">None</ion-select-option>
              <ion-select-option value="Employment">Employment</ion-select-option>
              <ion-select-option value="IP">IP</ion-select-option>
              <ion-select-option value="Corporate">Corporate</ion-select-option>
              <ion-select-option value="Litigation">Litigation</ion-select-option>
              <ion-select-option value="Privacy">Privacy</ion-select-option>
              <ion-select-option value="Compliance">Compliance</ion-select-option>
              <ion-select-option value="Real Estate">Real Estate</ion-select-option>
              <ion-select-option value="Other">Other</ion-select-option>
            </ion-select>
          </div>

          <!-- Key facts -->
          <div class="form-field">
            <label class="field-label" for="key-facts">Key Facts</label>
            <ion-textarea
              id="key-facts"
              v-model="form.keyFacts"
              placeholder="Relevant facts, context, or background information…"
              :rows="3"
              auto-grow
            />
          </div>

          <!-- Research controls accordion -->
          <details class="controls-accordion">
            <summary class="controls-summary">
              <ion-icon :icon="settingsOutline" />
              Research Controls
            </summary>

            <div class="controls-body">

              <div class="form-field">
                <label class="field-label" for="max-depth">
                  Max Depth
                  <span class="field-hint">How many levels of sub-questions</span>
                </label>
                <ion-input
                  id="max-depth"
                  type="number"
                  :min="1"
                  :max="10"
                  v-model="form.maxDepth"
                />
              </div>

              <div class="form-field">
                <label class="field-label" for="max-sub-questions">
                  Max Sub-questions Per Level
                  <span class="field-hint">How many sub-questions to generate at each depth</span>
                </label>
                <ion-input
                  id="max-sub-questions"
                  type="number"
                  :min="1"
                  :max="10"
                  v-model="form.maxSubQuestionsPerLevel"
                />
              </div>

              <div class="form-field">
                <label class="field-label">
                  Token Budget
                  <span class="field-hint">Maximum tokens to consume (leave unlimited for no cap)</span>
                </label>
                <div class="budget-row">
                  <ion-toggle v-model="tokenBudgetUnlimited" />
                  <span class="toggle-label">{{ tokenBudgetUnlimited ? 'Unlimited' : 'Limited' }}</span>
                  <ion-input
                    v-if="!tokenBudgetUnlimited"
                    type="number"
                    :min="1000"
                    v-model="form.tokenBudget"
                    placeholder="e.g. 50000"
                    class="budget-input"
                  />
                </div>
              </div>

              <div class="form-field">
                <label class="field-label">
                  Time Budget
                  <span class="field-hint">Maximum duration in milliseconds (leave unlimited for no cap)</span>
                </label>
                <div class="budget-row">
                  <ion-toggle v-model="timeBudgetUnlimited" />
                  <span class="toggle-label">{{ timeBudgetUnlimited ? 'Unlimited' : 'Limited' }}</span>
                  <ion-input
                    v-if="!timeBudgetUnlimited"
                    type="number"
                    :min="1000"
                    v-model="form.timeBudgetMs"
                    placeholder="e.g. 300000"
                    class="budget-input"
                  />
                </div>
              </div>

            </div>
          </details>

          <!-- Submit error -->
          <div v-if="submitError" class="submit-error">
            <ion-icon :icon="alertCircleOutline" color="danger" />
            <span>{{ submitError }}</span>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <ion-button
              type="submit"
              expand="block"
              color="primary"
              :disabled="submitting"
            >
              <ion-spinner v-if="submitting" name="crescent" slot="start" />
              {{ submitting ? 'Submitting…' : 'Start Research' }}
            </ion-button>
          </div>

        </form>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonTextarea,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonSpinner,
  IonIcon,
} from '@ionic/vue';
import { alertCircleOutline, settingsOutline } from 'ionicons/icons';
import type { ExecutionContextLike } from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', jobId: string): void;
}>();

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  question: string;
  jurisdiction: string;
  practiceArea: string;
  keyFacts: string;
  maxDepth: number;
  maxSubQuestionsPerLevel: number;
  tokenBudget: number | null;
  timeBudgetMs: number | null;
}

function defaultForm(): FormState {
  return {
    question: '',
    jurisdiction: '',
    practiceArea: '',
    keyFacts: '',
    maxDepth: 3,
    maxSubQuestionsPerLevel: 3,
    tokenBudget: null,
    timeBudgetMs: null,
  };
}

const form = ref<FormState>(defaultForm());
const tokenBudgetUnlimited = ref(true);
const timeBudgetUnlimited = ref(true);
const showErrors = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

// Reset the form whenever the modal opens
watch(
  () => props.open,
  (nowOpen) => {
    if (nowOpen) {
      form.value = defaultForm();
      tokenBudgetUnlimited.value = true;
      timeBudgetUnlimited.value = true;
      showErrors.value = false;
      submitError.value = null;
    }
  },
);

// ── Handlers ──────────────────────────────────────────────────────────────────

function handleDismiss(): void {
  if (!submitting.value) {
    emit('close');
  }
}

async function handleSubmit(): Promise<void> {
  showErrors.value = true;
  if (!form.value.question.trim()) return;
  if (!props.context) {
    submitError.value = 'No execution context available. Please select an organization.';
    return;
  }

  submitting.value = true;
  submitError.value = null;

  try {
    const payload = {
      context: props.context,
      data: {
        content: form.value.question.trim(),
        contentType: 'text/plain',
        jurisdiction: form.value.jurisdiction.trim() || undefined,
        practiceArea: form.value.practiceArea || undefined,
        keyFacts: form.value.keyFacts.trim() || undefined,
        researchConfig: {
          maxDepth: Number(form.value.maxDepth) || 3,
          maxSubQuestionsPerLevel: Number(form.value.maxSubQuestionsPerLevel) || 3,
          tokenBudget: tokenBudgetUnlimited.value
            ? null
            : (Number(form.value.tokenBudget) || null),
          timeBudgetMs: timeBudgetUnlimited.value
            ? null
            : (Number(form.value.timeBudgetMs) || null),
        },
      },
      metadata: {
        jobType: 'legal-research',
      },
    };

    const result = await enqueueResearchJob(payload);
    emit('created', result.jobId);
    emit('close');
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}

// ── HTTP call ────────────────────────────────────────────────────────────────

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL || 'http://localhost:5200';

async function enqueueResearchJob(payload: {
  context: ExecutionContextLike;
  data: { content: string; contentType: string };
  metadata: Record<string, unknown>;
}): Promise<{ jobId: string; conversationId: string; status: string }> {
  const token = localStorage.getItem('authToken');
  const res = await fetch(`${FORGE_API_URL}/legal-department/jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as { jobId: string; conversationId: string; status: string };
}

</script>

<style scoped>
.research-create-modal {
  --width: min(680px, 100%);
  --height: 85vh;
  --border-radius: 12px;
}

.modal-form {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.88em;
  font-weight: 600;
  color: var(--ion-color-dark);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.field-hint {
  font-weight: 400;
  color: var(--ion-color-medium);
  font-size: 0.9em;
}

.required {
  color: var(--ion-color-danger);
}

.field-error {
  --border-color: var(--ion-color-danger);
}

.error-hint {
  margin: 0;
  font-size: 0.8em;
  color: var(--ion-color-danger);
}

.controls-accordion {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  overflow: hidden;
}

.controls-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  cursor: pointer;
  font-size: 0.88em;
  font-weight: 600;
  background: var(--ion-color-step-50);
  user-select: none;
  list-style: none;
}

.controls-summary::-webkit-details-marker {
  display: none;
}

.controls-body {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 1px solid var(--ion-color-step-150);
}

.budget-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toggle-label {
  font-size: 0.88em;
  color: var(--ion-color-medium);
  min-width: 60px;
}

.budget-input {
  flex: 1;
  min-width: 160px;
}

.submit-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--ion-color-danger-tint);
  border-radius: 6px;
  font-size: 0.88em;
  color: var(--ion-color-danger-shade);
}

.form-actions {
  padding-bottom: 8px;
}
</style>
