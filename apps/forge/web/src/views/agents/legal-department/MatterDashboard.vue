<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/app/agents/legal-department/matters" />
        </ion-buttons>
        <ion-title>{{ matter?.name ?? 'Case Dashboard' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="loadingMatter" class="loading-state">
        <ion-spinner />
        <p>Loading matter...</p>
      </div>

      <div v-else-if="!matter" class="error-state">
        <p>Matter not found.</p>
      </div>

      <template v-else>
        <div class="stats-bar ion-padding-horizontal ion-padding-top">
          <div class="stat">
            <span class="stat-value">{{ stats.documents }}</span>
            <span class="stat-label">Documents</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ stats.entities }}</span>
            <span class="stat-label">Entities</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ stats.timeline }}</span>
            <span class="stat-label">Timeline Events</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ stats.pending }}</span>
            <span class="stat-label">Processing</span>
          </div>
        </div>

        <ion-segment v-model="activeTab" class="ion-padding-horizontal ion-padding-top">
          <ion-segment-button value="overview">
            <ion-label>Case Overview</ion-label>
          </ion-segment-button>
          <ion-segment-button value="documents">
            <ion-label>Documents</ion-label>
          </ion-segment-button>
        </ion-segment>

        <div v-show="activeTab === 'overview'">
          <CaseOverviewTab
            ref="overviewTabRef"
            :matter-id="matterId"
            :org-slug="orgSlug"
          />
        </div>

        <div v-show="activeTab === 'documents'">
          <DocumentsTab
            ref="documentsTabRef"
            :matter-id="matterId"
            :org-slug="orgSlug"
            :context="context"
            @updated="onDocumentsUpdated"
          />
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonSpinner, IonSegment,
  IonSegmentButton, IonLabel,
} from '@ionic/vue';
import { useRbacStore } from '../../../stores/rbacStore';
import { legalJobsService, type MatterRow } from './legalJobsService';
import CaseOverviewTab from './matter/CaseOverviewTab.vue';
import DocumentsTab from './matter/DocumentsTab.vue';

const route = useRoute();
const rbac = useRbacStore();

const matterId = computed(() => route.params.matterId as string);

const orgSlug = computed(() => {
  const active = rbac.currentOrganization;
  if (active && active !== '*') return active;
  return 'legal';
});

const context = computed(() => ({
  orgSlug: orgSlug.value,
  userId: rbac.user?.id ?? '',
  conversationId: '',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
}));

const matter = ref<MatterRow | null>(null);
const loadingMatter = ref(false);
const activeTab = ref<'overview' | 'documents'>('overview');

const overviewTabRef = ref<InstanceType<typeof CaseOverviewTab> | null>(null);
const documentsTabRef = ref<InstanceType<typeof DocumentsTab> | null>(null);

const stats = ref({ documents: 0, entities: 0, timeline: 0, pending: 0 });

async function loadMatter() {
  loadingMatter.value = true;
  try {
    matter.value = await legalJobsService.getMatter(
      matterId.value,
      orgSlug.value,
    );
  } finally {
    loadingMatter.value = false;
  }
}

async function loadStats() {
  try {
    const [docs, entities, timeline] = await Promise.all([
      legalJobsService.getMatterDocuments(matterId.value, orgSlug.value),
      legalJobsService.getMatterEntities(matterId.value, orgSlug.value),
      legalJobsService.getMatterTimeline(matterId.value, orgSlug.value),
    ]);
    stats.value = {
      documents: docs.length,
      entities: entities.length,
      timeline: timeline.length,
      pending: docs.filter((d) => !d.facts_processed || !d.docs_processed).length,
    };
  } catch {
    // non-critical
  }
}

async function onDocumentsUpdated() {
  await loadStats();
  overviewTabRef.value?.load();
}

onMounted(async () => {
  await loadMatter();
  await loadStats();
});
</script>

<style scoped>
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
  color: var(--ion-color-medium);
}

.stats-bar {
  display: flex;
  gap: 24px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-color-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}
</style>
