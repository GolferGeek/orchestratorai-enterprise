<template>
  <ion-button
    class="oai-btn"
    :class="[
      `oai-btn--${variant}`,
      `oai-btn--${size}`,
      loading ? 'oai-btn--loading' : '',
    ]"
    :disabled="disabled || loading"
    :expand="expand"
    @click="!disabled && !loading && emit('click', $event)"
  >
    <ion-spinner v-if="loading" name="crescent" class="oai-btn__spinner" />
    <template v-else>
      <span v-if="$slots['icon-start']" class="oai-btn__icon oai-btn__icon--start">
        <slot name="icon-start" />
      </span>
      <slot />
      <span v-if="$slots['icon-end']" class="oai-btn__icon oai-btn__icon--end">
        <slot name="icon-end" />
      </span>
    </template>
  </ion-button>
</template>

<script setup lang="ts">
import { IonButton, IonSpinner } from '@ionic/vue';

withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  expand?: 'block' | 'full';
}>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<style scoped>
.oai-btn {
  --border-radius: var(--oai-radius-md);
  --box-shadow: none;
  font-family: var(--oai-font-family);
  font-weight: var(--oai-font-weight-medium);
  letter-spacing: 0;
  transition: background var(--oai-transition), color var(--oai-transition),
    box-shadow var(--oai-transition), opacity var(--oai-transition);
}

/* Sizes */
.oai-btn--sm {
  --padding-top: 6px;
  --padding-bottom: 6px;
  --padding-start: 12px;
  --padding-end: 12px;
  font-size: var(--oai-font-size-xs);
  height: 32px;
}

.oai-btn--md {
  --padding-top: 8px;
  --padding-bottom: 8px;
  --padding-start: 16px;
  --padding-end: 16px;
  font-size: var(--oai-font-size-sm);
  height: 40px;
}

.oai-btn--lg {
  --padding-top: 10px;
  --padding-bottom: 10px;
  --padding-start: 20px;
  --padding-end: 20px;
  font-size: var(--oai-font-size-base);
  height: 48px;
}

/* Primary */
.oai-btn--primary {
  --background: var(--oai-btn-primary-bg);
  --background-hover: var(--oai-btn-primary-hover);
  --background-activated: var(--oai-btn-primary-active);
  --color: var(--oai-btn-primary-color);
}

/* Secondary */
.oai-btn--secondary {
  --background: var(--ion-color-secondary);
  --background-hover: var(--ion-color-secondary-shade);
  --background-activated: var(--ion-color-secondary-shade);
  --color: #ffffff;
}

/* Danger */
.oai-btn--danger {
  --background: var(--oai-btn-danger-bg);
  --background-hover: var(--oai-btn-danger-hover);
  --background-activated: var(--oai-btn-danger-hover);
  --color: var(--oai-btn-danger-color);
}

/* Ghost */
.oai-btn--ghost {
  --background: var(--oai-btn-ghost-bg);
  --background-hover: var(--oai-btn-ghost-hover);
  --background-activated: var(--oai-btn-ghost-active);
  --color: var(--oai-btn-ghost-color);
  --color-hover: var(--oai-btn-ghost-color-hover);
}

/* Outline */
.oai-btn--outline {
  --background: transparent;
  --background-hover: rgba(var(--ion-color-primary-rgb), 0.08);
  --background-activated: rgba(var(--ion-color-primary-rgb), 0.15);
  --color: var(--ion-color-primary);
  --border-width: 1px;
  --border-style: solid;
  --border-color: var(--ion-color-primary);
}

/* Loading */
.oai-btn--loading {
  opacity: 0.7;
  pointer-events: none;
}

.oai-btn__spinner {
  width: 16px;
  height: 16px;
  color: currentColor;
}

.oai-btn__icon {
  display: inline-flex;
  align-items: center;
}

.oai-btn__icon--start {
  margin-right: var(--oai-space-2);
}

.oai-btn__icon--end {
  margin-left: var(--oai-space-2);
}
</style>
