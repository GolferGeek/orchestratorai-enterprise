<template>
  <div
    class="message-input-wrapper"
    :class="{ 'drag-active': isDragOver }"
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

      <!-- Attach button -->
      <button
        class="attach-button"
        :disabled="disabled"
        aria-label="Attach files"
        @click="fileInputRef?.click()"
      >
        <ion-icon :icon="attachOutline" />
      </button>

      <textarea
        ref="textareaRef"
        v-model="draft"
        :placeholder="placeholder"
        :disabled="disabled"
        class="message-textarea"
        rows="1"
        @keydown.enter.exact.prevent="handleSubmit"
        @keydown.enter.shift.exact="handleNewline"
        @input="autoResize"
      />
      <button
        class="send-button"
        :disabled="disabled || (!draft.trim() && attachments.length === 0)"
        :aria-label="disabled ? 'Sending...' : 'Send message'"
        @click="handleSubmit"
      >
        <ion-icon :icon="disabled ? hourglassOutline : sendOutline" />
      </button>
      <VoiceChatButton @send="handleVoiceSend" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick } from 'vue';
import { IonIcon, toastController } from '@ionic/vue';
import { sendOutline, hourglassOutline, attachOutline } from 'ionicons/icons';
import { useFileAttachments } from '@/composables/useFileAttachments';
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

const props = defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

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

// Comma-separated MIME types for the file input accept attribute
const acceptedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
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
    // Reset input so same file can be selected again
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
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}
</script>

<style scoped>
/* Outer wrapper for drag-and-drop detection */
.message-input-wrapper {
  position: relative;
  background: var(--ion-background-color);
  transition: outline 0.15s ease;
}

.message-input-wrapper.drag-active {
  outline: 2px dashed var(--ion-color-primary);
  outline-offset: -2px;
  border-radius: 4px;
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
  border-radius: 4px;
}

.drag-icon {
  font-size: 28px;
}

/* Hidden native file input */
.file-input-hidden {
  display: none;
}

/* Input row */
.message-input-container {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--ion-color-step-150);
}

/* Attach button */
.attach-button {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--ion-color-step-300);
  background: transparent;
  color: var(--ion-color-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: 2px;
}

.attach-button:not(:disabled):hover {
  color: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}

.attach-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.message-textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 0.95rem;
  font-family: inherit;
  line-height: 1.4;
  background: var(--ion-color-step-50);
  color: var(--ion-text-color);
  outline: none;
  transition: border-color 0.15s ease;
  max-height: 200px;
  overflow-y: auto;
}

.message-textarea:focus {
  border-color: var(--ion-color-primary);
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-button {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  transition: opacity 0.15s ease, background 0.15s ease;
  margin-bottom: 2px;
}

.send-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-button:not(:disabled):hover {
  background: var(--ion-color-primary-shade);
}
</style>
