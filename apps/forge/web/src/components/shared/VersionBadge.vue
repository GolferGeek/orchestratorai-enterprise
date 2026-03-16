<template>
  <div
    class="version-badge"
    :class="[
      `version-badge--${creationType}`,
      `version-badge--${size}`,
      { 'version-badge--current': isCurrent }
    ]"
  >
    <ion-icon :icon="creationTypeIcon" />
    <span class="version-number">v{{ versionNumber }}</span>
    <span v-if="size !== 'small'" class="version-type">{{ creationTypeLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import {
  sparklesOutline,
  createOutline,
  refreshOutline,
  personOutline,
  syncOutline,
} from 'ionicons/icons';
import type { VersionBadgeProps, VersionCreationType } from './types';

const props = withDefaults(defineProps<VersionBadgeProps>(), {
  isCurrent: false,
  size: 'medium',
});

const creationTypeIcon = computed(() => {
  const icons: Record<VersionCreationType, string> = {
    ai_response: sparklesOutline,
    manual_edit: createOutline,
    ai_enhancement: refreshOutline,
    user_request: personOutline,
    llm_rerun: syncOutline,
  };
  return icons[props.creationType] || sparklesOutline;
});

const creationTypeLabel = computed(() => {
  const labels: Record<VersionCreationType, string> = {
    ai_response: 'AI Generated',
    manual_edit: 'Your Edit',
    ai_enhancement: 'AI Enhanced',
    user_request: 'Requested',
    llm_rerun: 'AI Rerun',
  };
  return labels[props.creationType] || props.creationType;
});
</script>

<style scoped>
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
}

.version-badge--medium {
  padding: 0.35rem 0.6rem;
  font-size: 0.9rem;
}

.version-badge--small {
  padding: 0.15rem 0.35rem;
  font-size: 0.75rem;
}

.version-badge--current {
  border: 1px solid currentColor;
}

.version-badge--ai_response {
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-shade);
}

.version-badge--manual_edit {
  background: var(--ion-color-tertiary-tint);
  color: var(--ion-color-tertiary-shade);
}

.version-badge--ai_enhancement {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}

.version-badge--user_request {
  background: var(--ion-color-secondary-tint);
  color: var(--ion-color-secondary-shade);
}

.version-badge--llm_rerun {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}

.version-number {
  font-weight: 700;
}

.version-type {
  opacity: 0.9;
}
</style>
