<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Brief Stress Test</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="briefOpen = true">
            <ion-icon :icon="informationCircleOutline" slot="start" />
            Benefits
          </ion-button>
          <ion-button
            color="primary"
            :disabled="!context"
            @click="createModalOpen = true"
          >
            <ion-icon :icon="shieldOutline" slot="start" />
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
          capability-slug="adversarial-brief"
          title="Stress test jobs"
          empty-hint="Click 'New' to stress-test a legal brief."
          :selected-id="openJobId"
          @select="onSelect"
        >
          <template #empty>
            <BriefLandingPanel
              capability-slug="adversarial-brief"
              cta-label="Stress-Test Your First Brief"
              @cta="createModalOpen = true"
            />
          </template>
        </JobActivityList>
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <!-- Reuse the research job create modal for now — adversarial-brief
         uses the same document upload + message input pattern -->
    <ResearchJobCreateModal
      :open="createModalOpen"
      :context="context"
      capability-slug="adversarial-brief"
      @close="createModalOpen = false"
      @created="onCreated"
    />

    <AdversarialBriefDetailModal
      :open="detailOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      @close="handleClose"
    />

    <AdversarialBriefReviewModal
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
      capability-slug="adversarial-brief"
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
import { shieldOutline, informationCircleOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import AdversarialBriefDetailModal from './adversarial-brief/AdversarialBriefDetailModal.vue';
import AdversarialBriefReviewModal from './adversarial-brief/AdversarialBriefReviewModal.vue';
import ResearchJobCreateModal from './components/ResearchJobCreateModal.vue';
import BriefModal from './components/BriefModal.vue';
import BriefLandingPanel from './components/BriefLandingPanel.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type { AgentJobRow, ExecutionContextLike } from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);

const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'big-ideas';
});
const createModalOpen = ref(false);
const briefOpen = ref(false);
const isAdmin = computed(() => rbac.isAdmin);
const listRef = ref<{ refresh: () => Promise<void> } | null>(null);

const { openJobId, openJob, closeJob } = useJobModalRoute();
const openJobStatus = ref<string | null>(null);
const detailOpen = computed(
  () => !!openJobId.value && openJobStatus.value !== 'awaiting_review',
);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);

const context = computed<ExecutionContextLike | null>(() => {
  if (!orgSlug.value || orgSlug.value === '*' || !user.value?.id) return null;
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

function onReviewed(_payload: { jobId: string }): void {
  void listRef.value?.refresh();
  openJobStatus.value = null;
}

function onCreated(_jobId: string): void {
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
