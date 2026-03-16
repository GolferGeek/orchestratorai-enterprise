<template>
  <div class="oai-input-wrapper" :class="{ 'oai-input-wrapper--error': error, 'oai-input-wrapper--disabled': disabled }">
    <label v-if="label" class="oai-input__label">{{ label }}</label>
    <div class="oai-input__control">
      <ion-input
        class="oai-input"
        :value="modelValue"
        :placeholder="placeholder"
        :type="type"
        :disabled="disabled"
        :clear-input="clearable"
        @ion-input="emit('update:modelValue', ($event.target as HTMLIonInputElement).value as string)"
      />
    </div>
    <p v-if="error" class="oai-input__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { IonInput } from '@ionic/vue';

withDefaults(defineProps<{
  modelValue: string | number | null | undefined;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number';
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
}>(), {
  type: 'text',
  disabled: false,
  clearable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<style scoped>
.oai-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--oai-space-1);
}

.oai-input__label {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  font-weight: var(--oai-font-weight-medium);
  color: var(--oai-text-secondary);
  line-height: var(--oai-line-height-normal);
}

.oai-input__control {
  position: relative;
}

.oai-input {
  --background: var(--oai-input-bg);
  --color: var(--oai-input-color);
  --placeholder-color: var(--oai-input-placeholder);
  --placeholder-opacity: 1;
  --padding-top: 10px;
  --padding-bottom: 10px;
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: var(--oai-radius-md);
  --border-color: var(--oai-input-border);
  --border-width: 1px;
  --border-style: solid;
  --highlight-color-focused: var(--oai-input-border-focus);
  --highlight-height: 0;
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  border-radius: var(--oai-radius-md);
  border: 1px solid var(--oai-input-border);
  background: var(--oai-input-bg);
  transition: border-color var(--oai-transition), box-shadow var(--oai-transition);
}

.oai-input:focus-within {
  border-color: var(--oai-input-border-focus);
  box-shadow: var(--oai-input-shadow-focus);
  outline: none;
}

.oai-input-wrapper--error .oai-input {
  border-color: var(--ion-color-danger);
}

.oai-input-wrapper--error .oai-input:focus-within {
  box-shadow: 0 0 0 3px rgba(var(--ion-color-danger-rgb), 0.20);
}

.oai-input-wrapper--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.oai-input__error {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-xs);
  color: var(--ion-color-danger);
  margin: 0;
  line-height: var(--oai-line-height-normal);
}
</style>
