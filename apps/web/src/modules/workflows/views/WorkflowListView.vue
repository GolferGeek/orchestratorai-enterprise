<template>
  <ion-page>
    <ion-content class="workflows-welcome">
      <div class="welcome-inner">
        <ion-icon :icon="gitBranchOutline" class="welcome-icon" />
        <h1 class="welcome-title">Workflows</h1>
        <p class="welcome-text">
          Choose a workflow from the sidebar to start a new run or reopen a previous one.
        </p>
        <p v-if="catalog.loading" class="welcome-hint">Loading workflows...</p>
        <p v-else-if="catalog.error" class="welcome-error">{{ catalog.error }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { IonPage, IonContent, IonIcon } from '@ionic/vue';
import { gitBranchOutline } from 'ionicons/icons';
import { useWorkflowCatalogStore } from '@/modules/workflows/stores/workflowCatalogStore';

// The sidebar's nav tree loads the catalog for the current org; this page
// only reflects its state.
const catalog = useWorkflowCatalogStore();
</script>

<style scoped>
.workflows-welcome {
  --background: var(--oai-bg-page, #0f172a);
}

.welcome-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px 24px;
  text-align: center;
}

.welcome-icon {
  font-size: 3rem;
  color: var(--oai-primary, #3b82f6);
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--oai-text-primary, #e2e8f0);
  margin: 0 0 12px;
}

.welcome-text {
  color: var(--oai-text-muted, #94a3b8);
  max-width: 360px;
  line-height: 1.5;
  margin: 0;
}

.welcome-hint,
.welcome-error {
  margin-top: 16px;
  font-size: 0.875rem;
}

.welcome-error {
  color: var(--ion-color-danger);
}
</style>
