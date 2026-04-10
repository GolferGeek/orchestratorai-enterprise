<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Contract Review</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="briefOpen = true">
            <ion-icon :icon="informationCircleOutline" slot="start" />
            Benefits
          </ion-button>
          <ion-button
            color="primary"
            :disabled="!context"
            :title="orgSlug === '*' ? 'Select a specific organization to upload contracts' : ''"
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
          capability-slug="contract-review"
          title="Contract review jobs"
          empty-hint="Click 'New' to upload a contract for review."
          :selected-id="openJobId"
          @select="onSelect"
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <OnboardDocumentModal
      v-if="context"
      :open="uploadModalOpen"
      :context="context"
      capability-slug="contract-review"
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
      capability-slug="contract-review"
      :can-edit="isAdmin"
      @close="briefOpen = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
/**
 * ContractReviewPage — upload contracts for clause-level risk assessment.
 *
 * Mirrors DocumentOnboardingPage but uses capabilitySlug='contract-review'
 * so jobs are routed through the contract-review LangGraph workflow.
 */
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
import { addOutline, informationCircleOutline } from 'ionicons/icons';
import { useRbacStore } from '../../../stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import OnboardDocumentModal from './components/OnboardDocumentModal.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import BriefModal from './components/BriefModal.vue';
import { legalJobsService } from './legalJobsService';

const route = useRoute();
const router = useRouter();
const rbac = useRbacStore();
// Legal workflows belong to a specific org. Use the active org if set,
// otherwise default to 'big-ideas' (the legal department's org).
const orgSlug = computed(() => {
  const active = rbac.activeOrgSlug;
  if (active && active !== '*') return active;
  return 'big-ideas';
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
    model: 'gemma4:31b',
  };
});

const uploadModalOpen = ref(false);
const briefOpen = ref(false);
const isAdmin = computed(() => rbac.isAdmin);
const listRef = ref<InstanceType<typeof JobActivityList> | null>(null);

const openJobId = computed(() => (route.query.jobId as string) || null);
const openJobStatus = ref<string | null>(null);
const detailOpen = computed(
  () => !!openJobId.value && openJobStatus.value !== 'awaiting_review',
);
const reviewOpen = computed(
  () => !!openJobId.value && openJobStatus.value === 'awaiting_review',
);

function onSelect(job: { id: string; status: string }) {
  if (
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'awaiting_review'
  ) {
    openJobStatus.value = job.status;
    router.push({ query: { ...route.query, jobId: job.id } });
  }
}

function handleClose() {
  const q = { ...route.query };
  delete q.jobId;
  router.replace({ query: q });
  openJobStatus.value = null;
}

function onQueued() {
  uploadModalOpen.value = false;
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
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}
.empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
</style>
