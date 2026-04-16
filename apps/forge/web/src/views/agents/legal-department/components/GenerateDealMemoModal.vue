<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="onDismissed"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="generate-memo-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Generate Deal Memo</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p class="description">
          Draft an acquisition agreement memo from this DD Room's findings.
          The memo workflow is read-only against the parent room and produces
          a markdown + DOCX deliverable.
        </p>

        <fieldset class="structure-group">
          <legend>Deal structure</legend>
          <label
            v-for="opt in DEAL_STRUCTURE_OPTIONS"
            :key="opt.value"
            class="structure-option"
            :class="{ active: dealStructure === opt.value }"
          >
            <input
              type="radio"
              name="dealStructure"
              :value="opt.value"
              v-model="dealStructure"
            />
            <div class="structure-text">
              <strong>{{ opt.label }}</strong>
              <span class="structure-hint">{{ opt.hint }}</span>
            </div>
          </label>
        </fieldset>

        <label class="notes-label">
          Reviewer notes (optional)
          <textarea
            v-model="reviewerNotes"
            rows="3"
            class="notes-textarea"
            placeholder="Anything specialists should pay extra attention to in the draft (e.g. focus on IP indemnification carve-outs)…"
          />
        </label>

        <div class="error" v-if="error">{{ error }}</div>

        <ion-button
          expand="block"
          :disabled="!dealStructure || submitting"
          @click="submit"
          class="submit"
        >
          <ion-spinner v-if="submitting" name="dots" />
          <span v-else>Generate Deal Memo</span>
        </ion-button>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSpinner,
} from '@ionic/vue';
import {
  legalJobsService,
  type DealStructure,
  type ExecutionContextLike,
} from '../legalJobsService';

const DEAL_STRUCTURE_OPTIONS: ReadonlyArray<{
  value: DealStructure;
  label: string;
  hint: string;
}> = [
  {
    value: 'stock-purchase',
    label: 'Stock Purchase',
    hint: 'Buyer acquires the target company by purchasing its equity.',
  },
  {
    value: 'asset-purchase',
    label: 'Asset Purchase',
    hint: 'Buyer acquires specific assets and assumes specified liabilities.',
  },
  {
    value: 'merger',
    label: 'Merger',
    hint: 'Two entities combine; surviving entity inherits the rest.',
  },
];

const props = defineProps<{
  open: boolean;
  parentJobId: string;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (
    e: 'queued',
    payload: { jobId: string; conversationId: string; status: string },
  ): void;
}>();

const dealStructure = ref<DealStructure>('stock-purchase');
const reviewerNotes = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

function resetForm(): void {
  dealStructure.value = 'stock-purchase';
  reviewerNotes.value = '';
  error.value = null;
}

function onDismissed(): void {
  resetForm();
}

async function submit(): Promise<void> {
  if (!props.context) {
    error.value =
      'No active organization context — pick an organization in the workspace before generating a memo.';
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    const result = await legalJobsService.generateDealMemo(
      props.parentJobId,
      props.context,
      {
        dealStructure: dealStructure.value,
        ...(reviewerNotes.value.trim()
          ? { reviewerNotes: reviewerNotes.value.trim() }
          : {}),
      },
    );
    emit('queued', {
      jobId: result.jobId,
      conversationId: result.conversationId,
      status: result.status,
    });
    submitting.value = false;
    resetForm();
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    submitting.value = false;
  }
}
</script>

<style scoped>
.generate-memo-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 560px;
  --max-width: 92vw;
  --height: 580px;
  --max-height: 92vh;
  --border-radius: 12px;
}

.description {
  font-size: 0.9em;
  color: var(--ion-color-medium);
  margin-bottom: 16px;
}

.structure-group {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  padding: 12px;
  margin: 0 0 16px 0;
}

.structure-group legend {
  padding: 0 6px;
  font-size: 0.78em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ion-color-medium);
}

.structure-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.structure-option:hover {
  background: var(--ion-color-step-50);
}

.structure-option.active {
  background: var(--ion-color-primary-tint);
  border-color: var(--ion-color-primary);
}

.structure-option input[type='radio'] {
  margin-top: 4px;
}

.structure-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.structure-text strong {
  font-size: 0.95em;
  color: var(--ion-text-color);
}

.structure-hint {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.notes-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--ion-text-color);
  font-weight: 600;
}

.notes-textarea {
  width: 100%;
  font-family: var(--ion-font-family, inherit);
  font-size: 13px;
  padding: 8px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  resize: vertical;
}

.notes-textarea:focus {
  outline: none;
  border-color: var(--ion-color-primary);
}

.error {
  color: var(--ion-color-danger);
  padding: 12px;
  border-radius: 6px;
  background: var(--ion-color-danger-tint);
  margin: 12px 0;
}

.submit {
  margin-top: 16px;
}
</style>
