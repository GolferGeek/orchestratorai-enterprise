<template>
  <ion-segment
    class="oai-tabs"
    :value="modelValue"
    @ion-change="emit('update:modelValue', ($event as CustomEvent).detail.value)"
  >
    <ion-segment-button
      v-for="tab in tabs"
      :key="tab.value"
      :value="tab.value"
      class="oai-tabs__btn"
    >
      <ion-icon v-if="tab.icon" :icon="tab.icon" class="oai-tabs__icon" />
      <ion-label class="oai-tabs__label">{{ tab.label }}</ion-label>
    </ion-segment-button>
  </ion-segment>
</template>

<script setup lang="ts">
import { IonSegment, IonSegmentButton, IonLabel, IonIcon } from '@ionic/vue';

export interface Tab {
  value: string;
  label: string;
  icon?: string;
}

defineProps<{
  modelValue: string;
  tabs: Tab[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<style scoped>
.oai-tabs {
  --background: var(--oai-bg-surface-2);
  border-radius: var(--oai-radius-lg);
  border: 1px solid var(--oai-border);
  padding: var(--oai-space-1);
  width: auto;
  display: inline-flex;
}

.oai-tabs__btn {
  --color: var(--oai-text-secondary);
  --color-checked: var(--oai-text-accent);
  --background: transparent;
  --background-checked: var(--oai-bg-surface);
  --border-radius: var(--oai-radius-md);
  --indicator-color: transparent;
  --indicator-height: 0;
  --padding-top: var(--oai-space-2);
  --padding-bottom: var(--oai-space-2);
  --padding-start: var(--oai-space-3);
  --padding-end: var(--oai-space-3);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  font-weight: var(--oai-font-weight-medium);
  min-height: 36px;
  transition: background var(--oai-transition), color var(--oai-transition);
}

.oai-tabs__btn.segment-button-checked {
  box-shadow: var(--oai-shadow-sm);
}

.oai-tabs__icon {
  font-size: 16px;
  margin-right: var(--oai-space-1);
}

.oai-tabs__label {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
}
</style>
