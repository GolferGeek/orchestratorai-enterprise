<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Document Onboarding</ion-title>
        <ion-buttons slot="end">
          <ion-button
            color="primary"
            :disabled="!context"
            :title="orgSlug === '*' ? 'Select a specific organization to upload documents' : ''"
            @click="uploadModalOpen = true"
          >
            <ion-icon :icon="addOutline" slot="start" />
            New
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="single-column">
        <div v-if="orgSlug === '*'" class="empty">
          <p><strong>All organizations selected.</strong></p>
          <p>Pick a specific organization from the org switcher to view and upload documents.</p>
        </div>
        <JobActivityList
          v-else-if="orgSlug"
          ref="listRef"
          :org-slug="orgSlug"
          capability-slug="document-onboarding"
          title="Document jobs"
          empty-hint="Click 'New' to upload a document."
          :selected-id="openJobId"
          @select="onSelect"
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <!-- Modals are siblings of ion-content (still inside ion-page).
         They're permanently mounted so ion-modal can run its open/close
         transition based on :is-open. -->
    <OnboardDocumentModal
      v-if="context"
      :open="uploadModalOpen"
      :context="context"
      capability-slug="document-onboarding"
      @close="uploadModalOpen = false"
      @queued="onQueued"
    />

    <JobDetailModal
      :open="!!openJobId"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      @close="closeJob"
    />
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
import JobDetailModal from './components/JobDetailModal.vue';
import OnboardDocumentModal from './components/OnboardDocumentModal.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type {
  AgentJobRow,
  ExecutionContextLike,
} from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);

const orgSlug = computed(() => currentOrganization.value);
const uploadModalOpen = ref(false);
const listRef = ref<{ refresh: () => Promise<void> } | null>(null);

const { openJobId, openJob, closeJob } = useJobModalRoute();

const context = computed<ExecutionContextLike | null>(() => {
  // The wildcard '*' org is the rbacStore's "all orgs" view for super-admins.
  // Uploads must target a real org so the row is correctly tenanted —
  // never let '*' through into the ExecutionContext capsule.
  if (!orgSlug.value || orgSlug.value === '*' || !user.value?.id) return null;
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
  // Click-dead for queued/processing — only completed/failed open the modal.
  if (job.status === 'completed' || job.status === 'failed') {
    openJob(job.id);
  }
}

function onQueued(_payload: { jobId: string }): void {
  // Don't auto-open the modal — the new job is still queued/processing
  // and the modal is for review only. Just refresh the list so the new
  // row appears immediately.
  void listRef.value?.refresh();
}
</script>

<style scoped>
.single-column {
  height: 100%;
  overflow: hidden;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
}
</style>
