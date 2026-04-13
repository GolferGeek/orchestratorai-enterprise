<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Compliance Audit</ion-title>
        <ion-buttons slot="end">
          <ion-button
            color="primary"
            :disabled="!context"
            @click="createModalOpen = true"
          >
            <ion-icon :icon="addOutline" slot="start" />
            New Audit
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="single-column">
        <!-- When a job is selected and not awaiting review, show detail view -->
        <ComplianceAuditView
          v-if="openJobId && openJobStatus !== 'awaiting_review'"
          :job-id="openJobId"
          :org-slug="orgSlug ?? ''"
        />

        <!-- Otherwise show the job list -->
        <JobActivityList
          v-else-if="orgSlug"
          ref="listRef"
          :org-slug="orgSlug"
          capability-slug="compliance-audit"
          title="Compliance Audits"
          empty-hint="Click 'New Audit' to start a regulatory compliance audit."
          :selected-id="openJobId"
          @select="onSelect"
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <CreateComplianceAuditModal
      v-if="context"
      :open="createModalOpen"
      :context="context"
      @close="createModalOpen = false"
      @queued="onQueued"
    />

    <LegalJobReviewModal
      :open="reviewOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      :context="context"
      @close="handleClose"
      @reviewed="onReviewed"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonContent,
  IonMenuButton,
} from '@ionic/vue';
import { addOutline } from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '../../../stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import ComplianceAuditView from './components/ComplianceAuditView.vue';
import CreateComplianceAuditModal from './components/CreateComplianceAuditModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import { legalJobsService } from './legalJobsService';

const route = useRoute();
const router = useRouter();
const rbac = useRbacStore();
const { currentOrganization } = storeToRefs(rbac);
const orgSlug = computed(() => {
  const active = currentOrganization.value;
  if (active && active !== '*') return active;
  return 'legal';
});

const context = computed(() => {
  if (!orgSlug.value || orgSlug.value === '*') return null;
  return {
    orgSlug: orgSlug.value,
    userId: rbac.user?.id ?? '',
    conversationId: '',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma4:e4b',
  };
});

const createModalOpen = ref(false);
const listRef = ref<InstanceType<typeof JobActivityList> | null>(null);

const openJobId = computed(() => (route.query.jobId as string) || null);
const openJobStatus = ref<string | null>(null);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);

function onSelect(job: { id: string; status: string }) {
  openJobStatus.value = job.status;
  router.push({ query: { ...route.query, jobId: job.id } });
}

function handleClose() {
  const q = { ...route.query };
  delete q.jobId;
  router.replace({ query: q });
  openJobStatus.value = null;
}

function onQueued() {
  createModalOpen.value = false;
  listRef.value?.$forceUpdate?.();
}

function onReviewed() {
  handleClose();
  listRef.value?.$forceUpdate?.();
}

watch(openJobId, async (id) => {
  if (!id || !orgSlug.value) {
    openJobStatus.value = null;
    return;
  }
  try {
    const job = await legalJobsService.getJob(id, orgSlug.value);
    openJobStatus.value = job.status;
  } catch {
    openJobStatus.value = null;
  }
});
</script>

<style scoped>
.single-column {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
  height: 100%;
}
.empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
</style>
