<template>
  <div class="compact-llm-control">
    <ion-select
      :value="provider"
      placeholder="Provider"
      interface="popover"
      @ionChange="$emit('update:provider', $event.detail.value)"
      class="llm-select"
    >
      <ion-select-option
        v-for="p in providers"
        :key="p.id"
        :value="p.id"
      >
        {{ p.displayName }}
      </ion-select-option>
    </ion-select>

    <ion-select
      :value="model"
      placeholder="Model"
      interface="popover"
      @ionChange="$emit('update:model', $event.detail.value)"
      class="llm-select"
    >
      <ion-select-option
        v-for="m in filteredModels"
        :key="m.id"
        :value="m.id"
      >
        {{ m.displayName }}
      </ion-select-option>
    </ion-select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonSelect, IonSelectOption } from '@ionic/vue';
import type { LLMProvider, LLMModel } from '@/services/llmService';

const props = defineProps<{
  provider: string;
  model: string;
  providers?: LLMProvider[];
  models?: LLMModel[];
}>();

defineEmits<{
  'update:provider': [value: string];
  'update:model': [value: string];
}>();

const filteredModels = computed(() =>
  (props.models || []).filter((m) => m.providerId === props.provider),
);
</script>

<style scoped>
.compact-llm-control {
  display: flex;
  gap: 8px;
  align-items: center;
}

.llm-select {
  --padding-start: 8px;
  --padding-end: 8px;
  max-width: 180px;
}
</style>
