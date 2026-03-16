<template>
  <div class="oai-page-header">
    <div v-if="$slots.breadcrumbs" class="oai-page-header__breadcrumbs">
      <slot name="breadcrumbs" />
    </div>

    <div class="oai-page-header__main">
      <div class="oai-page-header__left">
        <ion-button
          v-if="showBack"
          fill="clear"
          class="oai-page-header__back"
          @click="emit('back')"
        >
          <ion-icon :icon="arrowBackOutline" slot="start" />
          Back
        </ion-button>

        <div class="oai-page-header__titles">
          <h1 class="oai-page-header__title">{{ title }}</h1>
          <p v-if="subtitle" class="oai-page-header__subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <div v-if="$slots.actions" class="oai-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { arrowBackOutline } from 'ionicons/icons';

withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  showBack?: boolean;
}>(), {
  showBack: false,
});

const emit = defineEmits<{
  back: [];
}>();
</script>

<style scoped>
.oai-page-header {
  padding: var(--oai-space-6) var(--oai-space-6) var(--oai-space-4);
  border-bottom: 1px solid var(--oai-border);
  background: var(--oai-bg-surface);
}

.oai-page-header__breadcrumbs {
  margin-bottom: var(--oai-space-2);
  display: flex;
  align-items: center;
  gap: var(--oai-space-1);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-tertiary);
}

.oai-page-header__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--oai-space-4);
}

.oai-page-header__left {
  display: flex;
  align-items: center;
  gap: var(--oai-space-3);
  min-width: 0;
}

.oai-page-header__back {
  --color: var(--oai-text-secondary);
  --background: transparent;
  --background-hover: var(--oai-btn-ghost-hover);
  --padding-start: var(--oai-space-2);
  --padding-end: var(--oai-space-3);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  font-weight: var(--oai-font-weight-medium);
  height: 36px;
  flex-shrink: 0;
}

.oai-page-header__titles {
  min-width: 0;
}

.oai-page-header__title {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-2xl);
  font-weight: var(--oai-font-weight-bold);
  color: var(--oai-text-primary);
  margin: 0;
  letter-spacing: -0.02em;
  line-height: var(--oai-line-height-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oai-page-header__subtitle {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-secondary);
  margin: var(--oai-space-1) 0 0;
  line-height: var(--oai-line-height-normal);
}

.oai-page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--oai-space-2);
  flex-shrink: 0;
}
</style>
