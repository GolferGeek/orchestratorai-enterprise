<template>
  <ion-card
    class="oai-card"
    :class="[
      padding === false ? 'oai-card--no-padding' : '',
      hoverable ? 'oai-card--hoverable' : '',
    ]"
  >
    <slot name="header">
      <ion-card-header v-if="title || subtitle" class="oai-card__header">
        <ion-card-title v-if="title" class="oai-card__title">{{ title }}</ion-card-title>
        <ion-card-subtitle v-if="subtitle" class="oai-card__subtitle">{{ subtitle }}</ion-card-subtitle>
      </ion-card-header>
    </slot>

    <ion-card-content class="oai-card__content">
      <slot />
    </ion-card-content>

    <div v-if="$slots.footer" class="oai-card__footer">
      <slot name="footer" />
    </div>
  </ion-card>
</template>

<script setup lang="ts">
import { IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent } from '@ionic/vue';

withDefaults(defineProps<{
  title?: string;
  subtitle?: string;
  padding?: boolean;
  hoverable?: boolean;
}>(), {
  padding: true,
  hoverable: false,
});
</script>

<style scoped>
.oai-card {
  background: var(--oai-card-bg, var(--ion-card-background));
  border: 1px solid var(--oai-card-border);
  border-radius: var(--oai-card-radius, var(--oai-radius-lg));
  box-shadow: var(--oai-card-shadow);
  margin: 0;
  transition: background var(--oai-transition), border-color var(--oai-transition),
    box-shadow var(--oai-transition), transform var(--oai-transition);
}

.oai-card--hoverable:hover {
  background: var(--oai-card-hover);
  border-color: var(--oai-border-strong);
  box-shadow: var(--oai-shadow-lg);
  transform: translateY(-1px);
  cursor: pointer;
}

.oai-card--no-padding ion-card-content {
  padding: 0;
}

.oai-card__header {
  padding: var(--oai-space-4) var(--oai-space-4) var(--oai-space-2);
}

.oai-card__title {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-lg);
  font-weight: var(--oai-font-weight-semibold);
  color: var(--oai-text-primary);
  letter-spacing: -0.01em;
}

.oai-card__subtitle {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-secondary);
  margin-top: var(--oai-space-1);
}

.oai-card__content {
  padding: var(--oai-space-4);
  color: var(--oai-text-primary);
}

.oai-card__footer {
  padding: var(--oai-space-3) var(--oai-space-4);
  border-top: 1px solid var(--oai-border-subtle);
  display: flex;
  align-items: center;
  gap: var(--oai-space-2);
}
</style>
