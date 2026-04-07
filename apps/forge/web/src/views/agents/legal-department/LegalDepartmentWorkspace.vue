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
        />
        <div v-else class="empty">No organization selected.</div>
      </div>
    </ion-content>

    <JobDetailModal
      :open="!!openJobId"
      :job-id="openJobId"
      :org-slug="orgSlug ?? ''"
      @close="closeJob"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
} from '@ionic/vue';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailModal from './components/JobDetailModal.vue';
import { useJobModalRoute } from './composables/useJobModalRoute';
import type { AgentJobRow } from './legalJobsService';

const rbac = useRbacStore();
const { currentOrganization } = storeToRefs(rbac);
const orgSlug = computed(() => currentOrganization.value);

const { openJobId, openJob, closeJob } = useJobModalRoute();

function onSelect(job: AgentJobRow): void {
  // Only completed/failed rows open the modal. Processing/queued rows
  // are click-dead per the spec — the JobActivityList still emits select
  // for them, but we ignore the navigation here.
  if (job.status === 'completed' || job.status === 'failed') {
    openJob(job.id);
  }
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
