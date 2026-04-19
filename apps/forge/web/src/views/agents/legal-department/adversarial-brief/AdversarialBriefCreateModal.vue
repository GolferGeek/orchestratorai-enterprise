<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="onDismissed"
    @will-dismiss="$emit('close')"
    @keydown.esc="$emit('close')"
    class="stress-test-modal"
  >
    <div class="ion-page">
      <ion-header>
        <ion-toolbar>
          <ion-title>Stress-Test a Brief</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">Cancel</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <!-- Document Upload -->
        <div
          class="dropzone"
          :class="{ active: dragActive }"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <ion-icon :icon="documentOutline" size="large" />
          <p v-if="files.length === 0">
            Drop your brief here or click below.
          </p>
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
            accept=".txt,.md,.pdf,.docx"
            hidden
          />
          <ion-button size="small" fill="outline" @click="fileInput?.click()">
            Choose file
          </ion-button>
          <p class="hint">Supported: .txt .md .pdf .docx</p>
        </div>

        <!-- Optional message -->
        <div class="field">
          <label>Instructions (optional)</label>
          <textarea
            v-model="message"
            placeholder="Any specific areas to focus on, or context about the case..."
            rows="2"
          />
        </div>

        <!-- Configuration -->
        <div class="config-section">
          <div class="config-header" @click="showConfig = !showConfig">
            <ion-icon :icon="settingsOutline" />
            Debate Configuration
            <ion-icon
              :icon="showConfig ? chevronUp : chevronDown"
              class="chevron"
            />
          </div>
          <div v-if="showConfig" class="config-body">
            <div class="config-row">
              <label>Max Rounds</label>
              <input
                type="number"
                v-model.number="maxRounds"
                min="1"
                max="10"
              />
              <span class="config-hint">Hard cap on debate rounds (1-10)</span>
            </div>
            <div class="config-row">
              <label>Severity Threshold</label>
              <input
                type="number"
                v-model.number="severityThreshold"
                min="1"
                max="10"
              />
              <span class="config-hint">
                Debate stops when no attack exceeds this (1-10)
              </span>
            </div>
          </div>
        </div>

        <div class="error" v-if="error">{{ error }}</div>

        <ion-button
          expand="block"
          :disabled="files.length === 0 || submitting"
          @click="submit"
          class="submit"
          color="danger"
        >
          <ion-spinner v-if="submitting" name="dots" />
          <span v-else>
            <ion-icon :icon="flashOutline" slot="start" />
            Start Stress Test
          </span>
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
import {
  documentOutline,
  settingsOutline,
  chevronUp,
  chevronDown,
  flashOutline,
} from 'ionicons/icons';
import type { ExecutionContextLike } from '../legalJobsService';

const props = defineProps<{
  open: boolean;
  context: ExecutionContextLike | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', jobId: string): void;
}>();

const files = ref<File[]>([]);
const message = ref('');
const maxRounds = ref(5);
const severityThreshold = ref(7);
const showConfig = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  if (picked.length > 0) {
    files.value = [picked[0]!]; // Single file for brief
    error.value = null;
  }
}

function onDrop(e: DragEvent): void {
  dragActive.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  if (dropped.length > 0) {
    files.value = [dropped[0]!]; // Single file
    error.value = null;
  }
}

function resetForm(): void {
  files.value = [];
  message.value = '';
  maxRounds.value = 5;
  severityThreshold.value = 7;
  error.value = null;
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function onDismissed(): void {
  resetForm();
}

async function submit(): Promise<void> {
  if (files.value.length === 0 || !props.context) return;
  submitting.value = true;
  error.value = null;

  try {
    // Read the file content
    const file = files.value[0]!;
    const content = await readFileAsText(file);

    const payload = {
      context: props.context,
      data: {
        content: message.value.trim() || 'Stress-test this brief',
        contentType: 'text/plain',
        outputMode: 'adversarial-brief',
        documents: [
          {
            name: file.name,
            content,
            type: file.type || 'text/plain',
          },
        ],
      },
      metadata: {
        jobType: 'adversarial-brief',
        maxRounds: maxRounds.value,
        severityThreshold: severityThreshold.value,
      },
    };

    const result = await enqueueJob(payload);
    emit('created', result.jobId);
    submitting.value = false;
    resetForm();
    emit('close');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    submitting.value = false;
  }
}

async function readFileAsText(file: File): Promise<string> {
  // For PDFs, encode as base64; for text files, read as text
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return file.text();
}

async function enqueueJob(
  payload: Record<string, unknown>,
): Promise<{ jobId: string }> {
  const apiUrl =
    import.meta.env.VITE_FORGE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    '/api/forge';
  const token = localStorage.getItem('authToken');
  const res = await fetch(`${apiUrl}/legal-department/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create job: ${res.status} ${body}`);
  }
  return (await res.json()) as { jobId: string };
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<style scoped>
.stress-test-modal {
  --backdrop-opacity: 0.6;
  --background: var(--ion-background-color, #fff);
  --width: 560px;
  --max-width: 92vw;
  --height: 620px;
  --max-height: 92vh;
  --border-radius: 12px;
}

.dropzone {
  border: 2px dashed var(--ion-color-step-200);
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
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
  font-size: 0.85em;
}

.file-size {
  color: var(--ion-color-medium);
}

.hint {
  font-size: 0.75em;
  color: var(--ion-color-medium);
  margin: 0;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--ion-text-color);
}

.field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 6px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  font-size: 13px;
  resize: vertical;
}

.field textarea:focus {
  border-color: var(--ion-color-primary);
  outline: none;
}

.config-section {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  margin-bottom: 14px;
  overflow: hidden;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--ion-text-color);
}

.config-header:hover {
  background: var(--ion-color-step-50);
}

.chevron {
  margin-left: auto;
}

.config-body {
  padding: 8px 12px 12px;
  border-top: 1px solid var(--ion-color-step-150);
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.config-row label {
  font-size: 13px;
  min-width: 130px;
  color: var(--ion-text-color);
}

.config-row input[type='number'] {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 4px;
  background: var(--ion-color-step-100);
  color: var(--ion-text-color);
  font-size: 13px;
  text-align: center;
}

.config-hint {
  font-size: 11px;
  color: var(--ion-color-medium);
}

.error {
  color: var(--ion-color-danger);
  padding: 10px;
  border-radius: 6px;
  background: var(--ion-color-danger-tint);
  margin-bottom: 12px;
  font-size: 13px;
}

.submit {
  margin-top: 12px;
}
</style>
