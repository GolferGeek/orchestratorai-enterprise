<template>
  <ion-modal
    class="oai-modal"
    :class="`oai-modal--${size}`"
    :is-open="isOpen"
    @did-dismiss="emit('close')"
  >
    <ion-header class="oai-modal__header">
      <ion-toolbar class="oai-modal__toolbar">
        <ion-title v-if="title" class="oai-modal__title">{{ title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button class="oai-modal__close" @click="emit('close')">
            <ion-icon :icon="closeOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="oai-modal__content">
      <slot />
    </ion-content>

    <ion-footer v-if="$slots.footer" class="oai-modal__footer">
      <slot name="footer" />
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
  IonButton,
  IonButtons,
  IonIcon,
} from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';

withDefaults(defineProps<{
  isOpen: boolean;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
}>(), {
  size: 'md',
});

const emit = defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.oai-modal {
  --border-radius: var(--oai-radius-xl);
  --background: var(--oai-bg-surface);
  --box-shadow: var(--oai-shadow-2xl);
}

.oai-modal--sm {
  --width: 400px;
  --height: auto;
  --max-height: 80vh;
}

.oai-modal--md {
  --width: 560px;
  --height: auto;
  --max-height: 80vh;
}

.oai-modal--lg {
  --width: 800px;
  --height: auto;
  --max-height: 90vh;
}

.oai-modal--full {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
}

.oai-modal__header {
  --background: var(--oai-bg-surface);
}

.oai-modal__toolbar {
  --background: var(--oai-bg-surface);
  --border-color: var(--oai-border);
  padding: var(--oai-space-2) var(--oai-space-4);
}

.oai-modal__title {
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-lg);
  font-weight: var(--oai-font-weight-semibold);
  color: var(--oai-text-primary);
  padding: 0;
}

.oai-modal__close {
  --color: var(--oai-text-secondary);
  --background: transparent;
  --background-hover: var(--oai-btn-ghost-hover);
  --border-radius: var(--oai-radius-md);
}

.oai-modal__content {
  --background: var(--oai-bg-surface);
  --color: var(--oai-text-primary);
  --padding-top: var(--oai-space-4);
  --padding-bottom: var(--oai-space-4);
  --padding-start: var(--oai-space-6);
  --padding-end: var(--oai-space-6);
}

.oai-modal__footer {
  border-top: 1px solid var(--oai-border);
  padding: var(--oai-space-3) var(--oai-space-6);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oai-space-2);
  background: var(--oai-bg-surface);
}
</style>
