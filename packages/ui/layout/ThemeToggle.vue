<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { sunnyOutline, moonOutline } from 'ionicons/icons';
import { useTheme } from '../theme/useTheme';

const { isDark, toggleTheme } = useTheme();
</script>

<template>
  <IonButton
    fill="clear"
    size="small"
    class="oai-theme-toggle"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <IonIcon
      slot="icon-only"
      :icon="isDark ? sunnyOutline : moonOutline"
      class="oai-theme-toggle__icon"
    />
  </IonButton>
</template>

<style scoped>
.oai-theme-toggle {
  --color: var(--oai-text-secondary, #94a3b8);
  --color-hover: var(--oai-text-primary, #e2e8f0);
  --background-hover: var(--oai-btn-ghost-hover, rgba(59, 130, 246, 0.08));
  --border-radius: var(--oai-radius-full, 9999px);
}

.oai-theme-toggle__icon {
  font-size: 1.125rem;
  transition: color var(--oai-transition, 150ms ease),
              transform var(--oai-transition-medium, 250ms ease);
}

.oai-theme-toggle:hover .oai-theme-toggle__icon {
  transform: rotate(20deg);
}
</style>
