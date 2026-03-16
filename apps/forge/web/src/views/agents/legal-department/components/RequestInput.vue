<template>
  <div class="request-input">
    <!-- Attached Document Preview -->
    <div v-if="attachedFile" class="attached-file">
      <div class="file-info">
        <ion-icon :icon="documentTextOutline" />
        <span class="file-name">{{ attachedFile.name }}</span>
        <span class="file-size">{{ formatFileSize(attachedFile.size) }}</span>
      </div>
      <ion-button fill="clear" size="small" @click="removeFile">
        <ion-icon :icon="closeOutline" slot="icon-only" />
      </ion-button>
    </div>

    <!-- Input Area -->
    <div class="input-container">
      <div class="input-wrapper">
        <textarea
          ref="textareaRef"
          v-model="message"
          :placeholder="placeholder"
          :disabled="disabled"
          rows="1"
          @keydown.enter.exact="handleEnterKey"
          @input="autoResize"
        />
      </div>

      <div class="input-actions">
        <!-- Attach Document Button -->
        <ion-button
          fill="clear"
          size="small"
          :disabled="disabled || !!attachedFile"
          @click="triggerFileInput"
        >
          <ion-icon :icon="attachOutline" slot="icon-only" />
        </ion-button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".pdf,.docx,.doc,image/*"
          hidden
          @change="handleFileSelect"
        />

        <!-- Voice Input Button -->
        <ConversationalSpeechButton
          v-if="conversationId"
          :conversation-id="conversationId"
          :disabled="disabled"
          agent-name="Legal Department AI"
          agent-type="api"
          @error="handleSpeechError"
        />

        <!-- Send Button -->
        <ion-button
          :disabled="!canSend || disabled"
          @click="handleSend"
        >
          <ion-icon :icon="sendOutline" slot="start" />
          Send
        </ion-button>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-message">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, nextTick } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import {
  documentTextOutline,
  closeOutline,
  attachOutline,
  sendOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import ConversationalSpeechButton from '@/components/ConversationalSpeechButton.vue';

// Props
const props = withDefaults(defineProps<{
  disabled?: boolean;
  placeholder?: string;
  conversationId?: string;
}>(), {
  disabled: false,
  placeholder: 'Ask a legal question or describe the document to analyze...',
  conversationId: '',
});

// Emits
const emit = defineEmits<{
  (e: 'submit', data: {
    message: string;
    file?: File;
    options: {
      extractKeyTerms: boolean;
      identifyRisks: boolean;
      generateRecommendations: boolean;
    };
  }): void;
}>();

// Refs
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// State
const message = ref('');
const attachedFile = ref<File | null>(null);
const error = ref<string | null>(null);

const options = ref({
  extractKeyTerms: true,
  identifyRisks: true,
  generateRecommendations: true,
});

// Computed
const canSend = computed(() => {
  return message.value.trim().length > 0 || attachedFile.value !== null;
});

// Methods
function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

function processFile(file: File) {
  error.value = null;

  // Validate file type
  const validTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ];

  if (!validTypes.includes(file.type)) {
    error.value = 'Invalid file type. Please upload a PDF, DOCX, or image file.';
    return;
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    error.value = 'File size exceeds 10MB. Please upload a smaller file.';
    return;
  }

  attachedFile.value = file;

  // Auto-fill message if empty
  if (!message.value.trim()) {
    message.value = `Analyze this document: ${file.name}`;
  }
}

function removeFile() {
  attachedFile.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function handleEnterKey(e: KeyboardEvent) {
  if (!e.shiftKey && canSend.value && !props.disabled) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  if (!canSend.value || props.disabled) return;

  emit('submit', {
    message: message.value.trim(),
    file: attachedFile.value || undefined,
    options: options.value,
  });

  // Reset state
  message.value = '';
  attachedFile.value = null;
  error.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }

  // Reset textarea height
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
    }
  });
}

function autoResize() {
  const textarea = textareaRef.value;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function handleSpeechError(errorMessage: string) {
  error.value = errorMessage;
}
</script>

<style scoped>
.request-input {
  background: var(--ion-background-color);
  border-top: 1px solid var(--ion-color-light-shade);
  padding: 12px 16px;
}

.attached-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(var(--ion-color-primary-rgb), 0.15);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-info ion-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
}

.file-name {
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: var(--ion-color-medium);
  font-size: 12px;
}

.input-container {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.input-wrapper {
  flex: 1;
  border-radius: 20px;
  padding: 8px 16px;
}

.input-wrapper textarea {
  width: 100%;
  border: none;
  background: transparent;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  font-family: inherit;
  min-height: 24px;
  max-height: 200px;
}

.input-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(var(--ion-color-danger-rgb), 0.08);
  border-radius: 8px;
  font-size: 13px;
  color: var(--ion-color-danger-shade);
}
</style>
