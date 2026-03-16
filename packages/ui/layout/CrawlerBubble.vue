<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue';
import { chatbubbleEllipsesOutline } from 'ionicons/icons';

function toggleClaudePane() {
  window.dispatchEvent(new CustomEvent('oai:toggle-claude-pane'));
}
</script>

<template>
  <div class="oai-crawler-bubble">
    <IonButton
      fill="clear"
      size="small"
      class="oai-crawler-bubble__trigger"
      title="Toggle Claude Code pane"
      @click="toggleClaudePane"
    >
      <IonIcon slot="icon-only" :icon="chatbubbleEllipsesOutline" class="oai-crawler-bubble__icon" />
    </IonButton>
  </div>
</template>

<style scoped>
.oai-crawler-bubble {
  display: inline-flex;
  align-items: center;
}

.oai-crawler-bubble__trigger {
  --color: var(--oai-text-secondary, #94a3b8);
  --color-hover: var(--oai-text-primary, #e2e8f0);
  --background-hover: var(--oai-btn-ghost-hover, rgba(59, 130, 246, 0.08));
  --border-radius: var(--oai-radius-full, 9999px);
}

.oai-crawler-bubble__icon {
  font-size: 1.25rem;
}
</style>
