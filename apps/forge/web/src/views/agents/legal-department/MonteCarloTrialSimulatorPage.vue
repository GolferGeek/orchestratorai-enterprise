<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Trial Simulator</ion-title>
        <ion-buttons slot="end">
          <ion-button
            color="primary"
            :disabled="!context"
            @click="formOpen = true"
          >
            <ion-icon :icon="addOutline" slot="start" />
            Run New Simulation
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
          capability-slug="monte-carlo-trial-simulator"
          title="Trial simulation jobs"
          empty-hint="Click 'Run New Simulation' to build a case record and launch a simulation."
          :selected-id="openJobId"
          @select="onSelect"
        >
          <template #empty>
            <div class="empty-state">
              <ion-icon :icon="scaleOutline" size="large" color="medium" />
              <p>No simulations yet.</p>
              <p class="hint">
                Build a case record and run a Monte Carlo trial simulation.
              </p>
              <ion-button @click="formOpen = true">
                Run First Simulation
              </ion-button>
            </div>
          </template>
        </JobActivityList>
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <CaseRecordForm
      v-if="context"
      :open="formOpen"
      :context="context"
      @close="formOpen = false"
      @queued="onQueued"
    />

    <MonteCarloWorkspace
      v-if="openJobId"
      :open="workspaceOpen"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      @close="handleClose"
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
import { addOutline, scaleOutline } from 'ionicons/icons';
import { useRbacStore } from '../../../stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import CaseRecordForm from './monte-carlo/CaseRecordForm.vue';
import MonteCarloWorkspace from './monte-carlo/MonteCarloWorkspace.vue';
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

const formOpen = ref(false);
const listRef = ref<InstanceType<typeof JobActivityList> | null>(null);

const openJobId = computed(() => (route.query.jobId as string) || null);
const openJobStatus = ref<string | null>(null);
const workspaceOpen = computed(() => !!openJobId.value);

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
  formOpen.value = false;
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
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}
.empty-state .hint {
  font-size: 0.875rem;
  max-width: 360px;
  text-align: center;
}
</style>
