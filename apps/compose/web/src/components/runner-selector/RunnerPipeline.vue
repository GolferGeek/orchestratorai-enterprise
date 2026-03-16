<template>
  <div class="runner-pipeline">
    <div v-if="runners.length === 0" class="empty">
      <slot name="empty">No runners in pipeline.</slot>
    </div>
    <div
      v-for="(runner, index) in runners"
      :key="runner.id"
      class="pipeline-step"
    >
      <div class="step-connector" v-if="index > 0">
        <ion-icon :icon="arrowDownOutline" class="connector-icon" />
      </div>
      <div class="step-card">
        <span class="step-number">{{ index + 1 }}</span>
        <span class="step-type">{{ runner.type }}</span>
        <span class="step-name">{{ runner.name }}</span>
        <button class="remove-step-btn" :aria-label="`Remove ${runner.name}`" @click="emit('remove', runner.id)">
          <ion-icon :icon="closeOutline" />
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon } from '@ionic/vue';
import { arrowDownOutline, closeOutline } from 'ionicons/icons';
import type { ComposeRunner } from '@/services/compose-api.service';

defineProps<{
  runners: ComposeRunner[];
}>();

const emit = defineEmits<{
  remove: [runnerId: string];
  reorder: [runners: ComposeRunner[]];
}>();
</script>

<style scoped>
.runner-pipeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty {
  color: var(--ion-color-medium);
  font-size: 0.875rem;
}

.step-connector {
  display: flex;
  justify-content: center;
  color: var(--ion-color-medium);
  margin: -2px 0;
}

.connector-icon {
  font-size: 18px;
}

.step-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  background: var(--ion-background-color);
}

.step-number {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-type {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

.step-name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ion-text-color);
}

.remove-step-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ion-color-medium);
  font-size: 18px;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}

.remove-step-btn:hover {
  color: var(--ion-color-danger);
  background: var(--ion-color-danger-tint);
}
</style>
