<template>
  <div :class="['runner-card', { 'in-pipeline': inPipeline }]">
    <div class="runner-header">
      <span class="runner-type-badge">{{ runner.type }}</span>
      <h4 class="runner-name">{{ runner.name }}</h4>
    </div>
    <p v-if="runner.description" class="runner-description">{{ runner.description }}</p>
    <div class="runner-actions">
      <button v-if="!inPipeline" class="action-btn add-btn" @click="emit('add', runner)">
        Add to Pipeline
      </button>
      <button v-else class="action-btn remove-btn" @click="emit('remove', runner.id)">
        Remove
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ComposeRunner } from '@/services/compose-api.service';

defineProps<{
  runner: ComposeRunner;
  inPipeline?: boolean;
}>();

const emit = defineEmits<{
  add: [runner: ComposeRunner];
  remove: [runnerId: string];
}>();
</script>

<style scoped>
.runner-card {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  padding: 12px;
  background: var(--ion-background-color);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.runner-card.in-pipeline {
  border-color: var(--ion-color-success);
  background: var(--ion-color-success-tint);
}

.runner-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.runner-type-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  padding: 2px 8px;
  border-radius: 4px;
}

.runner-name {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.runner-description {
  font-size: 0.82rem;
  color: var(--ion-color-medium);
  margin: 0 0 10px;
  line-height: 1.4;
}

.runner-actions {
  display: flex;
  justify-content: flex-end;
}

.action-btn {
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.action-btn:hover {
  opacity: 0.8;
}

.add-btn {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}

.remove-btn {
  background: var(--ion-color-danger);
  color: var(--ion-color-danger-contrast);
}
</style>
