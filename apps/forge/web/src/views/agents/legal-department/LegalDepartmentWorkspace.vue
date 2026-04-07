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

    <ion-content :fullscreen="true">
      <div class="two-pane">
        <aside class="list-pane">
          <JobActivityList
            v-if="orgSlug"
            :org-slug="orgSlug"
            title="All activity"
            empty-hint="Use the left nav to start a new job under any capability."
            :selected-id="selectedJobId"
            @select="onSelect"
          />
          <div v-else class="empty">No organization selected.</div>
        </aside>
        <section class="detail-pane">
          <JobDetailPanel :job-id="selectedJobId" :org-slug="orgSlug ?? ''" />
        </section>
      </div>
    </ion-content>
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
  IonMenuButton,
} from '@ionic/vue';
import { storeToRefs } from 'pinia';
import { useRbacStore } from '@/stores/rbacStore';
import JobActivityList from './components/JobActivityList.vue';
import JobDetailPanel from './components/JobDetailPanel.vue';
import type { AgentJobRow } from './legalJobsService';

const rbac = useRbacStore();
const { currentOrganization } = storeToRefs(rbac);
const orgSlug = computed(() => currentOrganization.value);

const selectedJobId = ref<string | null>(null);

function onSelect(job: AgentJobRow): void {
  selectedJobId.value = job.id;
}
</script>

<style scoped>
.two-pane {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  height: 100%;
  gap: 0;
}

.list-pane {
  border-right: 1px solid var(--ion-color-step-150);
  height: 100%;
  overflow: hidden;
}

.detail-pane {
  height: 100%;
  overflow: hidden;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
}

@media (max-width: 900px) {
  .two-pane {
    grid-template-columns: 1fr;
  }
  .list-pane {
    border-right: none;
    border-bottom: 1px solid var(--ion-color-step-150);
  }
}
</style>
