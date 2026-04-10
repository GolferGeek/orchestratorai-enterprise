<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Legal Department</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="single-column">
        <JobActivityList
          v-if="orgSlug"
          :org-slug="orgSlug"
          title="All activity"
          empty-hint="Use the left nav to start a new job under any capability."
          :selected-id="openJobId"
          @select="onSelect"
        >
          <template #header-actions>
            <ion-button size="small" fill="outline" color="primary" @click="researchModalOpen = true">
              <ion-icon :icon="searchOutline" slot="start" />
              Research a Legal Question
            </ion-button>
          </template>
        </JobActivityList>
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

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
      @reviewed="handleClose"
    />

    <ResearchJobCreateModal
      :open="researchModalOpen"
      :context="context"
      @close="researchModalOpen = false"
      @created="handleResearchCreated"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonIcon,
} from '@ionic/vue';
import { searchOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import ResearchJobCreateModal from './components/ResearchJobCreateModal.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type { AgentJobRow, ExecutionContextLike } from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);
// Legal workflows use the agent's registered org — no "all orgs" mode.
const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'big-ideas';
});

const { openJobId, openJob, closeJob } = useJobModalRoute();
const openJobStatus = ref<string | null>(null);
const researchModalOpen = ref(false);

const detailOpen = computed(
  () => !!openJobId.value && openJobStatus.value !== 'awaiting_review',
);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);

const context = computed<ExecutionContextLike | null>(() => {
  if (!orgSlug.value || !user.value?.id) return null;
  return {
    orgSlug: orgSlug.value,
    userId: user.value.id,
    conversationId: 'placeholder',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
});

function onSelect(job: AgentJobRow): void {
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

function handleResearchCreated(_jobId: string): void {
  // Job created — the activity list polls automatically and will pick it up
  researchModalOpen.value = false;
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
