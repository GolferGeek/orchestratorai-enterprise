<template>
  <ion-modal :is-open="open" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Onboard a Document</ion-title>
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
        <p v-if="!file">Drop a file here or click below.</p>
        <p v-else><strong>{{ file.name }}</strong> ({{ formatBytes(file.size) }})</p>
        <input type="file" ref="fileInput" @change="onPick" accept=".txt,.md,.json,.csv,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif" hidden />
        <ion-button size="small" fill="outline" @click="fileInput?.click()">Choose file</ion-button>
        <p class="hint">Supported: .txt .md .json .csv .pdf .docx .pptx .png .jpg .webp .gif</p>
      </div>

      <div class="error" v-if="error">{{ error }}</div>

      <ion-button
        expand="block"
        :disabled="!file || submitting"
        @click="submit"
        class="submit"
      >
        <ion-spinner v-if="submitting" name="dots" />
        <span v-else>Queue Job</span>
      </ion-button>
    </ion-content>
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

const file = ref<File | null>(null);
const submitting = ref(false);
const error = ref<string | null>(null);
const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] ?? null;
  error.value = null;
}

function onDrop(e: DragEvent): void {
  dragActive.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    file.value = f;
    error.value = null;
  }
}

async function submit(): Promise<void> {
  if (!file.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const result = await legalJobsService.uploadFile(
      props.context,
      file.value,
      props.capabilitySlug ?? 'document-onboarding',
    );
    emit('queued', { jobId: result.jobId, conversationId: result.conversationId });
    file.value = null;
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
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
