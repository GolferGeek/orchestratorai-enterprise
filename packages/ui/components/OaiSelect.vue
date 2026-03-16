<template>
  <div class="oai-select-wrapper" :class="{ 'oai-select-wrapper--disabled': disabled }">
    <label v-if="label" class="oai-select__label">{{ label }}</label>
    <ion-select
      class="oai-select"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      interface="popover"
      @ion-change="emit('update:modelValue', ($event as CustomEvent).detail.value)"
    >
      <ion-select-option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </ion-select-option>
    </ion-select>
  </div>
</template>

<script setup lang="ts">
import { IonSelect, IonSelectOption } from '@ionic/vue';

export interface SelectOption {
  value: string | number;
  label: string;
}

withDefaults(defineProps<{
  modelValue: string | number | null | undefined;
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();
</script>

<style scoped>
.oai-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--oai-space-1);
}

.oai-select__label {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  font-weight: var(--oai-font-weight-medium);
  color: var(--oai-text-secondary);
  line-height: var(--oai-line-height-normal);
}

.oai-select {
  --background: var(--oai-input-bg);
  --color: var(--oai-input-color);
  --placeholder-color: var(--oai-input-placeholder);
  --placeholder-opacity: 1;
  --padding-top: 10px;
  --padding-bottom: 10px;
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: var(--oai-radius-md);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  border: 1px solid var(--oai-input-border);
  border-radius: var(--oai-radius-md);
  background: var(--oai-input-bg);
  color: var(--oai-input-color);
  width: 100%;
  transition: border-color var(--oai-transition), box-shadow var(--oai-transition);
}

.oai-select:focus-within {
  border-color: var(--oai-input-border-focus);
  box-shadow: var(--oai-input-shadow-focus);
}

.oai-select-wrapper--disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
