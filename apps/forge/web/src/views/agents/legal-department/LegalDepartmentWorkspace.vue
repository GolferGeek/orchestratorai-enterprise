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

    <CreateDDRoomModal
      v-if="context"
      :open="ddModalOpen"
      :context="context"
      @close="ddModalOpen = false"
      @queued="ddModalOpen = false"
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
import { folderOpenOutline, shieldCheckmarkOutline, eyeOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import CreateDDRoomModal from './components/CreateDDRoomModal.vue';
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
const ddModalOpen = ref(false);

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
