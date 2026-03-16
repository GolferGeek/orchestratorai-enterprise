<template>
  <div class="message-input-container">
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
      :disabled="disabled || !draft.trim()"
      :aria-label="disabled ? 'Sending...' : 'Send message'"
      @click="handleSubmit"
    >
      <ion-icon :icon="disabled ? hourglassOutline : sendOutline" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick } from 'vue';
import { IonIcon } from '@ionic/vue';
import { sendOutline, hourglassOutline } from 'ionicons/icons';

const props = defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [message: string];
}>();

const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function handleSubmit(): void {
  const message = draft.value.trim();
  if (!message || props.disabled) return;
  emit('send', message);
  draft.value = '';
  nextTick(() => {
    autoResize();
    textareaRef.value?.focus();
  });
}

function handleNewline(): void {
  // Shift+Enter inserts a newline — default behavior is allowed
}

function autoResize(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}
</script>

<style scoped>
.message-input-container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--ion-color-step-150);
  background: var(--ion-background-color);
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
}

.send-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-button:not(:disabled):hover {
  background: var(--ion-color-primary-shade);
}
</style>
