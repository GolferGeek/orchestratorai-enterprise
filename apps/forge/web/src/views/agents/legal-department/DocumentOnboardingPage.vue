<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Document Onboarding</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="briefOpen = true">
            <ion-icon :icon="informationCircleOutline" slot="start" />
            Benefits
          </ion-button>
          <ion-button
            color="primary"
            :disabled="!context"
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
        <JobActivityList
          v-if="orgSlug"
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
      :open="detailOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      @close="handleClose"
    />

    <LegalJobReviewModal
      :open="reviewOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      :context="context"
      @close="handleClose"
      @reviewed="onReviewed"
    />

    <BriefModal
      :open="briefOpen"
      agent-slug="legal-department"
      capability-slug="document-onboarding"
      :can-edit="isAdmin"
      @close="briefOpen = false"
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
import { addOutline, informationCircleOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import OnboardDocumentModal from './components/OnboardDocumentModal.vue';
import BriefModal from './components/BriefModal.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type {
  AgentJobRow,
  ExecutionContextLike,
} from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);

// Legal workflows use the agent's registered org — no "all orgs" mode.
const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'big-ideas';
});
const uploadModalOpen = ref(false);
const briefOpen = ref(false);
const isAdmin = computed(() => rbac.isAdmin);
const listRef = ref<{ refresh: () => Promise<void> } | null>(null);

const { openJobId, openJob, closeJob } = useJobModalRoute();
// Which modal to render for the currently-open job. Tracks the row's
// status at open time so a status change mid-review doesn't yank the
// modal out from under the reviewer.
const openJobStatus = ref<string | null>(null);
const detailOpen = computed(
  () => !!openJobId.value && openJobStatus.value !== 'awaiting_review',
);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);

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
  // Click-dead for queued/processing — only terminal or paused states open a modal.
  if (
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'awaiting_review'
  ) {
    openJobStatus.value = job.status;
    openJob(job.id);
  }
}

function handleClose(): void {
  openJobStatus.value = null;
  closeJob();
}

function onReviewed(_payload: { jobId: string }): void {
  // After submitting a decision the row has been re-queued. Refresh so
  // the list reflects the status change and drop the modal.
  void listRef.value?.refresh();
  openJobStatus.value = null;
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
