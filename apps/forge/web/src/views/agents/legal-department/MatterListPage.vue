<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Case Team</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="briefOpen = true">
            <ion-icon :icon="informationCircleOutline" slot="start" />
            Benefits
          </ion-button>
          <ion-button color="primary" :disabled="!orgSlug" @click="createOpen = true">
            <ion-icon :icon="addOutline" slot="start" />
            New Matter
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="matter-list-container">
        <div v-if="loading" class="loading-state">
          <ion-spinner />
          <p>Loading matters...</p>
        </div>

        <div v-else-if="error" class="error-state">
          <ion-icon :icon="alertCircleOutline" color="danger" size="large" />
          <p>{{ error }}</p>
          <ion-button @click="loadMatters">Retry</ion-button>
        </div>

        <div v-else-if="matters.length === 0" class="empty-state">
          <ion-icon :icon="briefcaseOutline" size="large" color="medium" />
          <p>No matters yet.</p>
          <p class="hint">Create your first matter to start building a persistent case team.</p>
          <ion-button @click="createOpen = true">Create First Matter</ion-button>
        </div>

        <ion-list v-else>
          <ion-item
            v-for="matter in matters"
            :key="matter.id"
            button
            detail
            @click="openMatter(matter.id)"
          >
            <ion-label>
              <h2>{{ matter.name }}</h2>
              <p>{{ matter.client_name }} · {{ matter.matter_type }} · {{ matter.jurisdiction }}</p>
              <p v-if="matter.description" class="description">{{ matter.description }}</p>
            </ion-label>
            <div slot="end" class="matter-meta">
              <ion-badge :color="statusColor(matter.status)">{{ matter.status }}</ion-badge>
              <p class="date">{{ formatDate(matter.opened_at) }}</p>
            </div>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>

    <CreateMatterModal
      :is-open="createOpen"
      :org-slug="orgSlug ?? ''"
      :context="context"
      @close="createOpen = false"
      @created="onMatterCreated"
    />

    <BriefModal
      :open="briefOpen"
      agent-slug="legal-department"
      capability-slug="persistent-case-team"
      @close="briefOpen = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons,
  IonButton, IonIcon, IonMenuButton, IonList, IonItem, IonLabel,
  IonBadge, IonSpinner,
} from '@ionic/vue';
import {
  addOutline, informationCircleOutline, briefcaseOutline, alertCircleOutline,
} from 'ionicons/icons';
import { useRbacStore } from '../../../stores/rbacStore';
import { legalJobsService, type MatterRow } from './legalJobsService';
import CreateMatterModal from './matter/CreateMatterModal.vue';
import BriefModal from './components/BriefModal.vue';

const router = useRouter();
const rbac = useRbacStore();

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

const matters = ref<MatterRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const createOpen = ref(false);
const briefOpen = ref(false);

async function loadMatters() {
  if (!orgSlug.value) return;
  loading.value = true;
  error.value = null;
  try {
    matters.value = await legalJobsService.listMatters(orgSlug.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load matters';
  } finally {
    loading.value = false;
  }
}

function openMatter(matterId: string) {
  void router.push({ name: 'MatterDashboard', params: { matterId } });
}

function onMatterCreated(matter: MatterRow) {
  createOpen.value = false;
  matters.value.unshift(matter);
}

function statusColor(status: string): string {
  if (status === 'active') return 'success';
  if (status === 'closed') return 'medium';
  if (status === 'archived') return 'dark';
  return 'primary';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

onMounted(() => {
  void loadMatters();
});
</script>

<style scoped>
.matter-list-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}

.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
  color: var(--ion-color-medium);
}

.hint {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.matter-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.date {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  margin: 0;
}

.description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}
</style>
