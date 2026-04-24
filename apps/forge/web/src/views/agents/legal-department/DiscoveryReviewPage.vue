<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Discovery Document Review</ion-title>
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
            <ion-icon :icon="addOutline" slot="start" />
            Start a Document Review
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="single-column">
        <!-- When a job is selected and not awaiting review, show the detail view -->
        <DiscoveryReviewView
          v-if="openJobId && openJobStatus !== 'awaiting_review'"
          :job-id="openJobId"
          :org-slug="orgSlug ?? ''"
          :context="context"
        />

        <!-- Otherwise show the job activity list -->
        <JobActivityList
          v-else-if="orgSlug"
          ref="listRef"
          :org-slug="orgSlug"
          capability-slug="discovery-review"
          title="Document Reviews"
          empty-hint="Click 'Start a Document Review' to begin a new discovery review."
          :selected-id="openJobId"
          @select="onSelect"
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <!-- Create / upload modal -->
    <CreateDiscoveryReviewModal
      v-if="context"
      :open="createModalOpen"
      :context="context"
      @close="createModalOpen = false"
      @queued="onQueued"
    />

    <!-- HITL review modal (batch review — Phase 3) -->
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
      capability-slug="discovery-review"
      :can-edit="isAdmin"
      @close="briefOpen = false"
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
import { addOutline, informationCircleOutline } from 'ionicons/icons';
import { useRbacStore } from '../../../stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import DiscoveryReviewView from './components/DiscoveryReviewView.vue';
import CreateDiscoveryReviewModal from './components/CreateDiscoveryReviewModal.vue';
import LegalJobReviewModal from './components/LegalJobReviewModal.vue';
import BriefModal from './components/BriefModal.vue';
import { legalJobsService } from './legalJobsService';

const route = useRoute();
const router = useRouter();
const rbac = useRbacStore();

const orgSlug = computed(() => {
  const active = rbac.currentOrganization;
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
const briefOpen = ref(false);
const isAdmin = computed(() => rbac.isAdmin);
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
