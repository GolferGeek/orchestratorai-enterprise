<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="onDismissed"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="onboard-modal"
  >
    <!-- ion-page class makes ion-modal lay out the slotted content. -->
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Onboard Documents</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
      <div class="dropzone" :class="{ active: dragActive }"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop">
        <ion-icon :icon="cloudUploadOutline" size="large" />
        <p v-if="files.length === 0">Drop files here or click below.</p>
        <ul v-else class="file-list">
          <li v-for="f in files" :key="f.name">
            <strong>{{ f.name }}</strong>
            <span class="file-size">({{ formatBytes(f.size) }})</span>
          </li>
        </ul>
        <input
          type="file"
          ref="fileInput"
          @change="onPick"
          accept=".txt,.md,.json,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          hidden
        />
        <ion-button size="small" fill="outline" @click="fileInput?.click()">
          Choose files
        </ion-button>
        <p class="hint">
          Supported: .txt .md .json .csv .pdf .docx .pptx .png .jpg .webp .gif
          — up to 10 files
        </p>
      </div>

      <div class="error" v-if="error">{{ error }}</div>

      <ion-button
        expand="block"
        :disabled="files.length === 0 || submitting"
        @click="submit"
        class="submit"
      >
        <ion-spinner v-if="submitting" name="dots" />
        <span v-else>Queue Job</span>
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
  IonIcon,
  IonSpinner,
} from '@ionic/vue';
import { cloudUploadOutline } from 'ionicons/icons';
import {
  legalJobsService,
  type ExecutionContextLike,
} from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike;
  capabilitySlug?: string;
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
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function onDismissed(): void {
  // Fired by ion-modal AFTER it has finished closing.
  // Reset form state so the next open shows a clean dropzone.
  resetForm();
}

async function submit(): Promise<void> {
  if (files.value.length === 0) return;
  submitting.value = true;
  error.value = null;
  try {
    const result = await legalJobsService.uploadFiles(
      props.context,
      files.value,
      props.capabilitySlug ?? 'document-onboarding',
    );
    emit('queued', { jobId: result.jobId, conversationId: result.conversationId });
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
.onboard-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 540px;
  --max-width: 92vw;
  --height: 520px;
  --max-height: 92vh;
  --border-radius: 12px;
}

.modal-page-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.dropzone {
  border: 2px dashed var(--ion-color-step-200);
  border-radius: 12px;
  padding: 36px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.dropzone.active {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  text-align: left;
}

.file-list li {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--ion-color-step-50, rgba(0, 0, 0, 0.04));
  margin-bottom: 4px;
  font-size: 0.85em;
}

.file-size {
  color: var(--ion-color-medium);
  margin-left: 8px;
}

.hint {
  font-size: 0.75em;
  color: var(--ion-color-medium);
  margin: 0;
}

.error {
  color: var(--ion-color-danger);
  padding: 12px;
  border-radius: 6px;
  background: var(--ion-color-danger-tint);
  margin-bottom: 12px;
}

.submit {
  margin-top: 12px;
}
</style>
