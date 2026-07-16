<template>
  <ion-modal :is-open="open" @did-dismiss="handleDismiss" class="prep-deposition-modal">
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Prep a Deposition</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="handleDismiss">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <form class="modal-form" @submit.prevent="handleSubmit">

          <!-- Case Facts -->
          <div class="form-field">
            <label class="field-label" for="case-facts">
              Case Facts <span class="required">*</span>
            </label>
            <ion-textarea
              id="case-facts"
              v-model="form.caseFacts"
              placeholder="Describe the facts of the case..."
              :rows="5"
              auto-grow
              :class="{ 'field-error': showErrors && !form.caseFacts.trim() }"
            />
            <p v-if="showErrors && !form.caseFacts.trim()" class="error-hint">
              Case facts are required.
            </p>
          </div>

          <!-- Witness Background -->
          <div class="form-field">
            <label class="field-label" for="witness-background">
              Witness Background <span class="required">*</span>
            </label>
            <ion-textarea
              id="witness-background"
              v-model="form.witnessBackground"
              placeholder="Describe the witness's background, role, and history..."
              :rows="4"
              auto-grow
              :class="{ 'field-error': showErrors && !form.witnessBackground.trim() }"
            />
            <p v-if="showErrors && !form.witnessBackground.trim()" class="error-hint">
              Witness background is required.
            </p>
          </div>

          <!-- Witness Type -->
          <div class="form-field">
            <label class="field-label" for="witness-type">
              Witness Type <span class="required">*</span>
            </label>
            <ion-select
              id="witness-type"
              v-model="form.witnessType"
              placeholder="Select witness type"
              interface="popover"
              :class="{ 'field-error': showErrors && !form.witnessType }"
            >
              <ion-select-option value="corporate-officer">Corporate Officer</ion-select-option>
              <ion-select-option value="expert-witness">Expert Witness</ion-select-option>
              <ion-select-option value="fact-witness">Fact Witness</ion-select-option>
            </ion-select>
            <p v-if="showErrors && !form.witnessType" class="error-hint">
              Witness type is required.
            </p>
          </div>

          <!-- Deposition Topics -->
          <div class="form-field">
            <label class="field-label" for="deposition-topics">
              Deposition Topics
              <span class="hint-text">(comma-separated)</span>
            </label>
            <ion-input
              id="deposition-topics"
              v-model="form.depositionTopicsRaw"
              placeholder="e.g. Q3 disclosures, Board communications, Contract terms"
            />
          </div>

          <!-- Prior Statements -->
          <div class="form-field">
            <label class="field-label" for="prior-statements">
              Prior Statements
              <span class="hint-text">(optional)</span>
            </label>
            <ion-textarea
              id="prior-statements"
              v-model="form.priorStatements"
              placeholder="Paste any relevant prior statements, deposition excerpts, or declarations..."
              :rows="3"
              auto-grow
            />
          </div>

          <!-- Opposing Counsel Name -->
          <div class="form-field">
            <label class="field-label" for="opposing-counsel">
              Opposing Counsel Name
              <span class="hint-text">(optional — enhances strategy prediction)</span>
            </label>
            <ion-input
              id="opposing-counsel"
              v-model="form.opposingCounselName"
              placeholder="e.g. Jane Smith"
            />
          </div>

          <!-- Document Upload -->
          <div class="form-field">
            <label class="field-label">
              Supporting Documents
              <span class="hint-text">(optional)</span>
            </label>
            <div class="upload-area">
              <input
                type="file"
                ref="fileInputRef"
                multiple
                accept=".pdf,.txt,.doc,.docx"
                style="display:none"
                @change="onFilesSelected"
              />
              <ion-button fill="outline" size="small" @click="fileInputRef?.click()">
                Choose Files
              </ion-button>
              <div v-if="selectedFiles.length > 0" class="file-list">
                <div v-for="(f, i) in selectedFiles" :key="i" class="file-item">
                  <span>{{ f.name }}</span>
                  <ion-button fill="clear" size="small" @click="removeFile(i)">✕</ion-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Output Selection -->
          <div class="form-field">
            <label class="field-label">Output Type <span class="required">*</span></label>
            <div class="output-options">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  v-model="form.generateOutline"
                />
                <span>Preparation Outline</span>
                <span class="output-desc">Strategic question plan, exhibit list, red flags</span>
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  v-model="form.generateCrossExam"
                />
                <span>Predicted Cross-Examination</span>
                <span class="output-desc">Questions opposing counsel will ask, with answer coaching</span>
              </label>
            </div>
            <p v-if="showErrors && !form.generateOutline && !form.generateCrossExam" class="error-hint">
              Select at least one output type.
            </p>
          </div>

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
              {{ submitting ? 'Submitting...' : 'Generate' }}
            </ion-button>
          </div>

        </form>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, type Ref } from 'vue';
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
  IonSpinner,
  IonIcon,
} from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { legalJobsService, type ExecutionContextLike } from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike | null;
}>();

interface QueuedPayload {
  outlineJobId: string | null;
  crossExamJobId: string | null;
  caseFacts: string;
  witnessBackground: string;
  priorStatements?: string;
}

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'queued', payload: QueuedPayload): void;
}>();

interface FormState {
  caseFacts: string;
  witnessBackground: string;
  witnessType: string;
  depositionTopicsRaw: string;
  priorStatements: string;
  opposingCounselName: string;
  generateOutline: boolean;
  generateCrossExam: boolean;
}

function defaultForm(): FormState {
  return {
    caseFacts: '',
    witnessBackground: '',
    witnessType: '',
    depositionTopicsRaw: '',
    priorStatements: '',
    opposingCounselName: '',
    generateOutline: true,
    generateCrossExam: false,
  };
}

const form = ref<FormState>(defaultForm());
const showErrors = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const selectedFiles = ref<File[]>([]);
const fileInputRef: Ref<HTMLInputElement | null> = ref(null);

function onFilesSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(input.files)];
    input.value = '';
  }
}

function removeFile(index: number): void {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
}

watch(
  () => props.open,
  (nowOpen) => {
    if (nowOpen) {
      form.value = defaultForm();
      showErrors.value = false;
      submitError.value = null;
    }
  },
);

function handleDismiss(): void {
  if (!submitting.value) {
    emit('close');
  }
}

async function handleSubmit(): Promise<void> {
  showErrors.value = true;

  if (
    !form.value.caseFacts.trim() ||
    !form.value.witnessBackground.trim() ||
    !form.value.witnessType ||
    (!form.value.generateOutline && !form.value.generateCrossExam)
  ) {
    return;
  }

  if (!props.context) {
    submitError.value = 'No execution context available. Please select an organization.';
    return;
  }

  submitting.value = true;
  submitError.value = null;

  const depositionTopics = form.value.depositionTopicsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  // Read uploaded files as text content
  const documents: Array<{ name: string; content: string; type?: string }> = await Promise.all(
    selectedFiles.value.map(
      (file) =>
        new Promise<{ name: string; content: string; type?: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({ name: file.name, content: (e.target?.result as string) ?? '', type: file.type });
          };
          reader.readAsText(file);
        }),
    ),
  );

  const baseInput = {
    caseFacts: form.value.caseFacts.trim(),
    witnessBackground: form.value.witnessBackground.trim(),
    witnessType: form.value.witnessType,
    depositionTopics,
    priorStatements: form.value.priorStatements.trim() || undefined,
    opposingCounselName: form.value.opposingCounselName.trim() || undefined,
    documents: documents.length > 0 ? documents : undefined,
  };

  try {
    let outlineJobId: string | null = null;
    let crossExamJobId: string | null = null;

    if (form.value.generateOutline) {
      const result = await legalJobsService.prepDeposition(props.context, {
        ...baseInput,
        mode: 'preparation-outline',
      });
      outlineJobId = result.jobId;
    }

    if (form.value.generateCrossExam) {
      const result = await legalJobsService.prepDeposition(props.context, {
        ...baseInput,
        mode: 'predicted-cross-exam',
      });
      crossExamJobId = result.jobId;
    }

    emit('queued', {
      outlineJobId,
      crossExamJobId,
      caseFacts: baseInput.caseFacts,
      witnessBackground: baseInput.witnessBackground,
      priorStatements: baseInput.priorStatements,
    });
    emit('close');
    selectedFiles.value = [];
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.prep-deposition-modal {
  --width: min(640px, 100%);
  --height: 90vh;
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
}

.hint-text {
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

.output-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.checkbox-label span:first-of-type {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--ion-color-light);
}

.output-desc {
  font-size: 0.8em !important;
  font-weight: 400 !important;
  color: var(--ion-color-medium) !important;
  display: block;
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
