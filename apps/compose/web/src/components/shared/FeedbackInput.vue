<template>
  <div class="feedback-input">
    <ion-label v-if="label" class="feedback-label">{{ label }}</ion-label>
    <ion-textarea
      v-model="internalValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="3"
      :maxlength="maxLength"
      class="feedback-textarea"
      :class="{ 'feedback-textarea--required': required && !internalValue.trim() }"
    />
    <div class="feedback-footer">
      <span v-if="required && !internalValue.trim()" class="required-hint">
        Required for regeneration
      </span>
      <span v-if="maxLength" class="char-count">
        {{ internalValue.length }} / {{ maxLength }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonLabel, IonTextarea } from '@ionic/vue';
import type { FeedbackInputProps, FeedbackInputEmits } from './types';

const props = withDefaults(defineProps<FeedbackInputProps>(), {
  placeholder: 'Enter feedback for regeneration...',
  label: 'Feedback',
  disabled: false,
  required: false,
  maxLength: 500,
});

const emit = defineEmits<FeedbackInputEmits>();

const internalValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});
</script>

<style scoped>
.feedback-input {
  margin-bottom: 1rem;
}

.feedback-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.feedback-textarea {
  --background: var(--ion-color-step-50);
  --border-radius: 8px;
  --padding-start: 12px;
  --padding-end: 12px;
}

.feedback-textarea--required {
  --border-color: var(--ion-color-warning);
}

.feedback-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.25rem;
  font-size: 0.8rem;
}

.required-hint {
  color: var(--ion-color-warning);
}

.char-count {
  color: var(--ion-color-medium);
}
</style>
