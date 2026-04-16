<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="onDismissed"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="dd-room-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Create Due Diligence Room</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- File Upload -->
        <div
          class="dropzone"
          :class="{ active: dragActive }"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <ion-icon :icon="cloudUploadOutline" size="large" />
          <p v-if="files.length === 0">
            Drop files here or click below. Supports PDF, DOCX, TXT, and ZIP.
          </p>
          <div v-else class="file-summary">
            <strong>{{ files.length }} file{{ files.length !== 1 ? 's' : '' }}</strong>
            <span class="file-size">({{ formatBytes(totalSize) }} total)</span>
          </div>
          <input
            type="file"
            ref="fileInput"
            @change="onPick"
            accept=".txt,.md,.json,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif,.zip"
            multiple
            hidden
          />
          <ion-button size="small" fill="outline" @click="fileInput?.click()">
            Choose files
          </ion-button>
          <p class="hint">Up to 500 files. 50MB per file, 1GB total.</p>
        </div>

        <!-- Size warnings -->
        <div class="error" v-if="sizeError">{{ sizeError }}</div>

        <!-- Deal Context Form -->
        <div class="deal-context-form">
          <h3>Deal Context</h3>

          <ion-item>
            <ion-select
              v-model="dealContext.transactionType"
              label="Transaction Type"
              label-placement="stacked"
              interface="popover"
            >
              <ion-select-option value="acquisition">Acquisition</ion-select-option>
              <ion-select-option value="merger">Merger</ion-select-option>
              <ion-select-option value="investment">Investment</ion-select-option>
              <ion-select-option value="joint_venture">Joint Venture</ion-select-option>
              <ion-select-option value="asset_purchase">Asset Purchase</ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-input
              v-model="dealContext.targetCompany"
              label="Target Company"
              label-placement="stacked"
              placeholder="e.g. AcmeCorp"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="dealContext.buyerCompany"
              label="Buyer Company"
              label-placement="stacked"
              placeholder="e.g. OrchestratorAI"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="dealContext.dealValueRange"
              label="Deal Value Range (optional)"
              label-placement="stacked"
              placeholder="e.g. $10M-$50M"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="jurisdictionsInput"
              label="Jurisdictions (comma-separated)"
              label-placement="stacked"
              placeholder="e.g. US, UK, EU"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="focusAreasInput"
              label="Focus Areas (optional, comma-separated)"
              label-placement="stacked"
              placeholder="e.g. IP rights, employment obligations"
            />
          </ion-item>

          <ion-item>
            <ion-input
              v-model="financialFocusAreasInput"
              label="Financial Focus Areas (optional, comma-separated)"
              label-placement="stacked"
              placeholder="e.g. revenue concentration, debt covenants, related-party transactions"
              list="dd-financial-focus-suggestions"
            />
            <datalist id="dd-financial-focus-suggestions">
              <option value="revenue concentration" />
              <option value="working capital" />
              <option value="debt covenants" />
              <option value="off-balance-sheet liabilities" />
              <option value="related-party transactions" />
            </datalist>
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="dealContext.knownIssuesText"
              label="Known Issues (optional)"
              label-placement="stacked"
              placeholder="Any known risks or areas of concern..."
              :rows="3"
            />
          </ion-item>
        </div>

        <div class="error" v-if="error">{{ error }}</div>

        <ion-button
          expand="block"
          :disabled="!canSubmit || submitting"
          @click="submit"
          class="submit"
        >
          <ion-spinner v-if="submitting" name="dots" />
          <span v-else>Create DD Room</span>
        </ion-button>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonSpinner,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/vue';
import { cloudUploadOutline } from 'ionicons/icons';
import {
  legalJobsService,
  type ExecutionContextLike,
} from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'queued', payload: { jobId: string; conversationId: string }): void;
}>();

const files = ref<File[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);
const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const dealContext = ref({
  transactionType: 'acquisition',
  targetCompany: '',
  buyerCompany: '',
  dealValueRange: '',
  knownIssuesText: '',
});
const jurisdictionsInput = ref('');
const focusAreasInput = ref('');
const financialFocusAreasInput = ref('');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1GB
const MAX_FILES = 500;

const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0));

const sizeError = computed(() => {
  if (files.value.length > MAX_FILES) {
    return `Too many files: ${files.value.length} exceeds the maximum of ${MAX_FILES}.`;
  }
  const oversized = files.value.find((f) => f.size > MAX_FILE_SIZE);
  if (oversized) {
    return `File "${oversized.name}" is ${formatBytes(oversized.size)} — exceeds the 50MB per-file limit.`;
  }
  if (totalSize.value > MAX_TOTAL_SIZE) {
    return `Total size ${formatBytes(totalSize.value)} exceeds the 1GB limit.`;
  }
  return null;
});

const canSubmit = computed(
  () =>
    files.value.length > 0 &&
    !sizeError.value &&
    dealContext.value.targetCompany.trim() !== '' &&
    dealContext.value.transactionType !== '',
);

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  files.value = Array.from(input.files ?? []);
  error.value = null;
}

function onDrop(e: DragEvent): void {
  dragActive.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (dropped.length > 0) {
    files.value = dropped;
    error.value = null;
  }
}

function resetForm(): void {
  files.value = [];
  error.value = null;
  dealContext.value = {
    transactionType: 'acquisition',
    targetCompany: '',
    buyerCompany: '',
    dealValueRange: '',
    knownIssuesText: '',
  };
  jurisdictionsInput.value = '';
  focusAreasInput.value = '';
  financialFocusAreasInput.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function onDismissed(): void {
  resetForm();
}

function splitTags(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const financialFocusAreas = splitTags(financialFocusAreasInput.value);
    const dc = {
      transactionType: dealContext.value.transactionType,
      targetCompany: dealContext.value.targetCompany.trim(),
      buyerCompany: dealContext.value.buyerCompany.trim(),
      dealValueRange: dealContext.value.dealValueRange.trim() || undefined,
      jurisdictions: splitTags(jurisdictionsInput.value),
      focusAreas: splitTags(focusAreasInput.value),
      knownIssues: dealContext.value.knownIssuesText.trim()
        ? [dealContext.value.knownIssuesText.trim()]
        : [],
      ...(financialFocusAreas.length > 0 && { financialFocusAreas }),
    };

    const result = await legalJobsService.createDDRoom(
      props.context,
      files.value,
      dc,
    );

    emit('queued', {
      jobId: result.jobId,
      conversationId: result.conversationId,
    });
    submitting.value = false;
    resetForm();
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    submitting.value = false;
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<style scoped>
.dd-room-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 600px;
  --max-width: 95vw;
  --height: 85vh;
  --max-height: 95vh;
  --border-radius: 12px;
}

.dropzone {
  border: 2px dashed var(--ion-color-step-200);
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 16px;
}
.dropzone.active {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.file-summary {
  margin: 8px 0;
}
.file-size {
  color: var(--ion-color-medium);
  margin-left: 4px;
}

.hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-top: 8px;
}

.deal-context-form {
  margin-top: 8px;
}
.deal-context-form h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.error {
  color: var(--ion-color-danger);
  font-size: 0.9rem;
  padding: 8px 0;
}

.submit {
  margin-top: 16px;
}
</style>
