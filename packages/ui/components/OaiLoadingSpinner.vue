<template>
  <div class="oai-spinner" :class="`oai-spinner--${size}`">
    <ion-spinner name="crescent" class="oai-spinner__icon" />
    <p v-if="message" class="oai-spinner__message">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { IonSpinner } from '@ionic/vue';

withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}>(), {
  size: 'md',
});
</script>

<style scoped>
.oai-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oai-space-3);
}

.oai-spinner__icon {
  color: var(--oai-text-accent);
}

.oai-spinner--sm .oai-spinner__icon {
  width: 20px;
  height: 20px;
}

.oai-spinner--md .oai-spinner__icon {
  width: 32px;
  height: 32px;
}

.oai-spinner--lg .oai-spinner__icon {
  width: 48px;
  height: 48px;
}

.oai-spinner__message {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-secondary);
  margin: 0;
  line-height: var(--oai-line-height-normal);
}
</style>
