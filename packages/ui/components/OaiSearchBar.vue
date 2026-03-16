<template>
  <ion-searchbar
    class="oai-searchbar"
    :value="modelValue"
    :placeholder="placeholder"
    :debounce="debounce"
    @ion-input="emit('update:modelValue', ($event.target as HTMLIonSearchbarElement).value ?? '')"
  />
</template>

<script setup lang="ts">
import { IonSearchbar } from '@ionic/vue';

withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  debounce?: number;
}>(), {
  placeholder: 'Search...',
  debounce: 300,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<style scoped>
.oai-searchbar {
  --background: var(--oai-input-bg);
  --color: var(--oai-input-color);
  --placeholder-color: var(--oai-input-placeholder);
  --placeholder-opacity: 1;
  --icon-color: var(--oai-text-tertiary);
  --clear-button-color: var(--oai-text-tertiary);
  --border-radius: var(--oai-radius-md);
  --box-shadow: none;
  --cancel-button-color: var(--oai-text-secondary);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  padding: 0;
  border: 1px solid var(--oai-input-border);
  border-radius: var(--oai-radius-md);
  transition: border-color var(--oai-transition), box-shadow var(--oai-transition);
}

.oai-searchbar:focus-within {
  border-color: var(--oai-input-border-focus);
  box-shadow: var(--oai-input-shadow-focus);
}
</style>
