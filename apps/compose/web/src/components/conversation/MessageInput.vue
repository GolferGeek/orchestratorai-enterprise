<template>
  <div
    class="message-input-wrapper"
    :class="{ 'drag-active': isDragOver, 'message-input-wrapper--centered': centered }"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="handleDrop"
  >
    <!-- Drag-and-drop overlay -->
    <div v-if="isDragOver" class="drag-overlay" aria-hidden="true">
      <ion-icon :icon="attachOutline" class="drag-icon" />
      <span>Drop files here</span>
    </div>

    <!-- Pending attachments bar (shown above the input row) -->
    <FileAttachmentBar
      :attachments="attachments"
      @remove="removeAttachment"
    />

    <div class="message-input-container">
      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        :accept="acceptedMimeTypes"
        class="file-input-hidden"
        @change="handleFileInputChange"
      />

      <!-- Textarea with integrated controls -->
      <div class="input-box" :class="{ 'input-box--centered': centered }">
        <textarea
          ref="textareaRef"
          v-model="draft"
          :placeholder="placeholder"
          :disabled="disabled"
          class="message-textarea"
          :rows="centered ? 4 : 1"
          @keydown.enter.exact.prevent="handleSubmit"
          @keydown.enter.shift.exact="handleNewline"
          @input="autoResize"
        />

        <!-- Bottom bar: attach, provider/model selectors, voice, send -->
        <div class="input-toolbar">
          <div class="input-toolbar__left">
            <button
              class="toolbar-btn"
              :disabled="disabled"
              aria-label="Attach files"
              @click="fileInputRef?.click()"
            >
              <ion-icon :icon="attachOutline" />
            </button>
          </div>

          <div class="input-toolbar__center">
            <select
              v-if="providers.length > 0"
              v-model="localProvider"
              class="llm-select"
              :disabled="disabled"
              @change="onProviderChange"
            >
              <option v-for="p in providers" :key="p.name" :value="p.name">
                {{ p.displayName }}{{ p.isLocal ? ' (local)' : '' }}
              </option>
            </select>
            <select
              v-if="models.length > 0"
              v-model="localModel"
              class="llm-select"
              :disabled="disabled"
              @change="onModelChange"
            >
              <option v-for="m in models" :key="m.modelName" :value="m.modelName">
                {{ m.displayName }}{{ m.isLocal ? ' (local)' : '' }}
              </option>
            </select>
          </div>

          <div class="input-toolbar__right">
            <VoiceChatButton @send="handleVoiceSend" />
            <button
              class="send-btn"
              :disabled="disabled || (!draft.trim() && attachments.length === 0)"
              :aria-label="disabled ? 'Sending...' : 'Send message'"
              @click="handleSubmit"
            >
              <ion-icon :icon="disabled ? hourglassOutline : arrowUpOutline" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { IonIcon, toastController } from '@ionic/vue';
import { arrowUpOutline, hourglassOutline, attachOutline } from 'ionicons/icons';
import { useFileAttachments } from '@/composables/useFileAttachments';
import { useLLMStore } from '@/stores/llm.store';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import FileAttachmentBar from './FileAttachmentBar.vue';
import VoiceChatButton from './VoiceChatButton.vue';

// ============================================================================
// Types
// ============================================================================

export interface SendPayload {
  message: string;
  attachments?: Array<{ base64: string; mimeType: string; filename: string }>;
}

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<{
  placeholder?: string;
  disabled?: boolean;
  /** When true, display in centered "welcome" layout */
  centered?: boolean;
  agentType?: string;
  mediaType?: 'image' | 'video';
}>(), {
  placeholder: 'Send a message...',
  disabled: false,
  centered: false,
  agentType: undefined,
  mediaType: undefined,
});

const emit = defineEmits<{
  send: [payload: SendPayload];
}>();

// ============================================================================
// State
// ============================================================================

const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);

const { attachments, addFiles, removeAttachment, clear: clearAttachments } = useFileAttachments();

// LLM provider/model — inline selectors
const llmStore = useLLMStore();
const executionContextStore = useExecutionContextStore();

const localProvider = ref(llmStore.selectedProvider ?? '');
const localModel = ref(llmStore.selectedModel ?? '');

const providers = computed(() => llmStore.providersWithModels ?? []);
const models = computed(() => llmStore.modelsForProvider(localProvider.value) ?? []);

// Sync from store when it loads
watch(() => llmStore.selectedProvider, (v) => { if (v) localProvider.value = v; });
watch(() => llmStore.selectedModel, (v) => { if (v) localModel.value = v; });

function onProviderChange(): void {
  localModel.value = '';
  const m = llmStore.modelsForProvider(localProvider.value);
  if (m.length > 0) localModel.value = m[0].modelName;
  applyLLMSelection();
}

function onModelChange(): void {
  applyLLMSelection();
}

function applyLLMSelection(): void {
  llmStore.setProvider(localProvider.value);
  llmStore.setModel(localModel.value);
  if (executionContextStore.isInitialized) {
    executionContextStore.setLLM(localProvider.value, localModel.value);
  }
}

// Comma-separated MIME types for the file input accept attribute
const acceptedMimeTypes = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/markdown',
].join(',');

// ============================================================================
// File handling
// ============================================================================

async function processFiles(files: FileList | File[]): Promise<void> {
  const rejected = await addFiles(files);
  if (rejected.length > 0) {
    const reasons = [...new Set(rejected.map((r) => r.reason))];
    const toast = await toastController.create({
      message: reasons.join('. '),
      duration: 3000,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }
}

function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFiles(input.files);
    input.value = '';
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    processFiles(event.dataTransfer.files);
  }
}

// ============================================================================
// Submit
// ============================================================================

function handleSubmit(): void {
  const message = draft.value.trim();
  if (props.disabled) return;
  if (!message && attachments.value.length === 0) return;

  const payload: SendPayload = { message };

  if (attachments.value.length > 0) {
    payload.attachments = attachments.value.map((a) => ({
      base64: a.base64,
      mimeType: a.mimeType,
      filename: a.filename,
    }));
  }

  emit('send', payload);

  draft.value = '';
  clearAttachments();

  nextTick(() => {
    autoResize();
    textareaRef.value?.focus();
  });
}

function handleNewline(): void {
  // Shift+Enter inserts a newline — default behavior is allowed
}

function handleVoiceSend(message: string): void {
  if (!message || props.disabled) return;
  emit('send', { message });
}

function autoResize(): void {
  const el = textareaRef.value;
  if (!el) return;
  if (props.centered) return; // Don't auto-resize in centered mode
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}
</script>

<style scoped>
/* Outer wrapper */
.message-input-wrapper {
  position: relative;
  background: var(--ion-background-color);
}

.message-input-wrapper--centered {
  background: transparent;
}

.message-input-wrapper.drag-active {
  outline: 2px dashed var(--ion-color-primary);
  outline-offset: -2px;
  border-radius: 12px;
}

/* Drag overlay */
.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: color-mix(in srgb, var(--ion-background-color) 90%, transparent);
  color: var(--ion-color-primary);
  font-size: 0.9rem;
  font-weight: 500;
  pointer-events: none;
  border-radius: 12px;
}

.drag-icon {
  font-size: 28px;
}

.file-input-hidden {
  display: none;
}

/* Input container */
.message-input-container {
  padding: 8px 12px 10px;
}

.message-input-wrapper--centered .message-input-container {
  padding: 0;
  max-width: 680px;
  margin: 0 auto;
}

/* The box that holds textarea + toolbar */
.input-box {
  border: 1px solid var(--ion-color-step-200, #334155);
  border-radius: 12px;
  background: var(--ion-color-step-50, #1e293b);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.input-box:focus-within {
  border-color: var(--ion-color-primary);
}

.input-box--centered {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

/* Textarea */
.message-textarea {
  display: block;
  width: 100%;
  resize: none;
  border: none;
  padding: 12px 16px;
  font-size: 0.95rem;
  font-family: inherit;
  line-height: 1.5;
  background: transparent;
  color: var(--ion-text-color);
  outline: none;
  max-height: 200px;
  overflow-y: auto;
}

.input-box--centered .message-textarea {
  padding: 16px 20px;
  font-size: 1rem;
  min-height: 100px;
}

.message-textarea::placeholder {
  color: var(--ion-color-step-400, #64748b);
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Toolbar below textarea */
.input-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 6px;
  border-top: 1px solid var(--ion-color-step-100, #1e293b);
}

.input-toolbar__left,
.input-toolbar__right {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.input-toolbar__center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  min-width: 0;
}

/* Toolbar icon buttons */
.toolbar-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ion-color-medium, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  transition: color 0.12s ease, background 0.12s ease;
}

.toolbar-btn:not(:disabled):hover {
  color: var(--ion-text-color);
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.06));
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Send button */
.send-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  background: var(--ion-color-primary-shade);
}

/* LLM inline selectors */
.llm-select {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--ion-color-step-150, #334155);
  border-radius: 6px;
  background: var(--ion-color-step-50, #1e293b);
  color: var(--ion-color-step-600, #94a3b8);
  font-size: 0.75rem;
  font-family: inherit;
  padding: 3px 20px 3px 8px;
  cursor: pointer;
  outline: none;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  transition: border-color 0.12s ease;
}

.llm-select:hover {
  border-color: var(--ion-color-step-300, #475569);
}

.llm-select:focus {
  border-color: var(--ion-color-primary);
}

.llm-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
