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
        <div class="workspace-actions" v-if="orgSlug">
          <ion-button size="small" fill="outline" @click="ddModalOpen = true">
            <ion-icon :icon="folderOpenOutline" slot="start" />
            Due Diligence Room
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            @click="$router.push({ name: 'LegalComplianceAudit' })"
          >
            <ion-icon :icon="shieldCheckmarkOutline" slot="start" />
            Compliance Audit
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            @click="$router.push({ name: 'LegalSentinel' })"
          >
            <ion-icon :icon="eyeOutline" slot="start" />
            Portfolio Sentinel
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            @click="$router.push({ name: 'LegalDiscoveryReview' })"
          >
            <ion-icon :icon="searchOutline" slot="start" />
            Discovery Review
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            @click="depositionModalOpen = true"
          >
            <ion-icon :icon="micOutline" slot="start" />
            Prep a Deposition
          </ion-button>
        </div>
        <JobActivityList
          v-if="orgSlug"
          :org-slug="orgSlug"
          title="All activity"
          empty-hint="Use the left nav to start a new job under any capability."
          :selected-id="openJobId"
          @select="onSelect"
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <!-- Standard job detail modal (non-deposition jobs) -->
    <JobDetailModal
      :open="detailOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      :caller-user-id="user?.id"
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

    <CreateDDRoomModal
      v-if="context"
      :open="ddModalOpen"
      :context="context"
      @close="ddModalOpen = false"
      @queued="ddModalOpen = false"
    />

    <PrepDepositionModal
      :open="depositionModalOpen"
      :context="context"
      @close="depositionModalOpen = false"
      @queued="onDepositionQueued"
    />

    <!-- Deposition workspace modal (tabbed results view) -->
    <DepositionPrepWorkspace
      :open="depositionWorkspaceOpen"
      :outline-job-id="depositionOutlineJobId"
      :cross-exam-job-id="depositionCrossExamJobId"
      :org-slug="orgSlug ?? ''"
      :caller-user-id="user?.id"
      :case-facts="depositionCaseFacts"
      :witness-background="depositionWitnessBackground"
      :prior-statements="depositionPriorStatements ?? undefined"
      :execution-context="context ?? undefined"
      @close="handleDepositionWorkspaceClose"
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
import {
  folderOpenOutline,
  shieldCheckmarkOutline,
  eyeOutline,
  searchOutline,
  micOutline,
} from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import CreateDDRoomModal from './components/CreateDDRoomModal.vue';
import PrepDepositionModal from './components/PrepDepositionModal.vue';
import DepositionPrepWorkspace from './deposition-prep/DepositionPrepWorkspace.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type { AgentJobRow, ExecutionContextLike } from './legalJobsService';

const rbac = useRbacStore();
const { user, currentOrganization } = storeToRefs(rbac);
const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'legal';
});

const { openJobId, openJob, closeJob } = useJobModalRoute();
const openJobStatus = ref<string | null>(null);
const openJobType = ref<string | null>(null);
const ddModalOpen = ref(false);
const depositionModalOpen = ref(false);
const depositionWorkspaceOpen = ref(false);
const depositionOutlineJobId = ref<string | null>(null);
const depositionCrossExamJobId = ref<string | null>(null);
const depositionCaseFacts = ref('');
const depositionWitnessBackground = ref('');
const depositionPriorStatements = ref<string | null>(null);

const isDepositionJob = computed(() => openJobType.value === 'deposition-prep');

const detailOpen = computed(
  () =>
    !!openJobId.value &&
    openJobStatus.value !== 'awaiting_review' &&
    !isDepositionJob.value,
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
    job.status === 'awaiting_review' ||
    job.status === 'awaiting_answer'
  ) {
    openJobStatus.value = job.status;
    openJobType.value = job.job_type ?? null;
    openJob(job.id);

    if (job.job_type === 'deposition-prep') {
      let mode = 'preparation-outline';
      try {
        const raw = (job.input as Record<string, unknown> | null)?.data as Record<string, unknown> | undefined;
        const parsed = raw?.content ? JSON.parse(raw.content as string) : null;
        mode = parsed?.mode ?? 'preparation-outline';
      } catch { /* keep default */ }

      if (mode === 'predicted-cross-exam') {
        depositionOutlineJobId.value = null;
        depositionCrossExamJobId.value = job.id;
      } else {
        depositionOutlineJobId.value = job.id;
        depositionCrossExamJobId.value = null;
      }
      depositionWorkspaceOpen.value = true;
    }
  }
}

function handleClose(): void {
  openJobStatus.value = null;
  openJobType.value = null;
  closeJob();
}

function handleDepositionWorkspaceClose(): void {
  depositionWorkspaceOpen.value = false;
  depositionOutlineJobId.value = null;
  depositionCrossExamJobId.value = null;
  depositionCaseFacts.value = '';
  depositionWitnessBackground.value = '';
  depositionPriorStatements.value = null;
  openJobType.value = null;
  closeJob();
}

function onDepositionQueued(payload: {
  outlineJobId: string | null;
  crossExamJobId: string | null;
  caseFacts: string;
  witnessBackground: string;
  priorStatements?: string;
}): void {
  depositionOutlineJobId.value = payload.outlineJobId;
  depositionCrossExamJobId.value = payload.crossExamJobId;
  depositionCaseFacts.value = payload.caseFacts;
  depositionWitnessBackground.value = payload.witnessBackground;
  depositionPriorStatements.value = payload.priorStatements ?? null;
  depositionWorkspaceOpen.value = true;
  depositionModalOpen.value = false;
}
</script>

<style scoped>
.single-column {
  height: 100%;
  overflow: hidden;
}

.workspace-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 4px;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
}
</style>
