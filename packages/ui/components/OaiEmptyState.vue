<template>
  <div class="oai-empty">
    <div v-if="icon" class="oai-empty__icon-wrap">
      <ion-icon :icon="icon" class="oai-empty__icon" />
    </div>
    <h3 class="oai-empty__title">{{ title }}</h3>
    <p v-if="message" class="oai-empty__message">{{ message }}</p>
    <ion-button
      v-if="actionLabel"
      class="oai-empty__action"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonButton } from '@ionic/vue';

withDefaults(defineProps<{
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
}>(), {});

const emit = defineEmits<{
  action: [];
}>();
</script>

<style scoped>
.oai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--oai-space-16) var(--oai-space-6);
  text-align: center;
  gap: var(--oai-space-3);
}

.oai-empty__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--oai-radius-2xl);
  background: var(--oai-bg-surface-2);
  border: 1px solid var(--oai-border);
  margin-bottom: var(--oai-space-2);
}

.oai-empty__icon {
  font-size: 28px;
  color: var(--oai-text-tertiary);
}

.oai-empty__title {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-lg);
  font-weight: var(--oai-font-weight-semibold);
  color: var(--oai-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.oai-empty__message {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-secondary);
  margin: 0;
  max-width: 360px;
  line-height: var(--oai-line-height-relaxed);
}

.oai-empty__action {
  --background: var(--oai-btn-primary-bg);
  --background-hover: var(--oai-btn-primary-hover);
  --color: var(--oai-btn-primary-color);
  --border-radius: var(--oai-radius-md);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  font-weight: var(--oai-font-weight-medium);
  height: 40px;
  margin-top: var(--oai-space-2);
}
</style>
