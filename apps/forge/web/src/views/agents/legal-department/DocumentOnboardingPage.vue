<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Document Onboarding</ion-title>
        <ion-buttons slot="end">
          <ion-button color="primary" :disabled="!context" @click="modalOpen = true">
            <ion-icon :icon="addOutline" slot="start" />
            New
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="two-pane">
        <aside class="list-pane">
          <JobActivityList
            v-if="orgSlug"
            ref="listRef"
            :org-slug="orgSlug"
            capability-slug="document-onboarding"
            title="Document jobs"
            empty-hint="Click 'New' to upload a document."
            :selected-id="selectedJobId"
            @select="onSelect"
          />
          <div v-else class="empty">No organization selected.</div>
        </aside>
        <section class="detail-pane">
          <JobDetailPanel :job-id="selectedJobId" :org-slug="orgSlug ?? ''" />
        </section>
      </div>

      <OnboardDocumentModal
        v-if="context"
        :open="modalOpen"
        :context="context"
        capability-slug="document-onboarding"
        @close="modalOpen = false"
        @queued="onQueued"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonMenuButton,
} from '@ionic/vue';
import { addOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailPanel from './components/JobDetailPanel.vue';
import OnboardDocumentModal from './components/OnboardDocumentModal.vue';
import type {
  AgentJobRow,
  ExecutionContextLike,
} from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);

const orgSlug = computed(() => currentOrganization.value);
const selectedJobId = ref<string | null>(null);
const modalOpen = ref(false);
const listRef = ref<{ refresh: () => Promise<void> } | null>(null);

const context = computed<ExecutionContextLike | null>(() => {
  if (!orgSlug.value || !user.value?.id) return null;
  return {
    orgSlug: orgSlug.value,
    userId: user.value.id,
    conversationId: 'placeholder', // server overrides at enqueue
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
});

function onSelect(job: AgentJobRow): void {
  selectedJobId.value = job.id;
}

function onQueued({ jobId }: { jobId: string }): void {
  selectedJobId.value = jobId;
  void listRef.value?.refresh();
}
</script>

<style scoped>
.two-pane {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  height: 100%;
}

.list-pane {
  border-right: 1px solid var(--ion-color-step-150);
  height: 100%;
  overflow: hidden;
}

.detail-pane {
  height: 100%;
  overflow: hidden;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
}

@media (max-width: 900px) {
  .two-pane {
    grid-template-columns: 1fr;
  }
  .list-pane {
    border-right: none;
    border-bottom: 1px solid var(--ion-color-step-150);
  }
}
</style>
