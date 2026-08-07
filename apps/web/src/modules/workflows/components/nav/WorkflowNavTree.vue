<template>
  <div class="workflow-nav-tree">
    <div class="org-selector-wrapper">
      <select
        :value="selectedOrg"
        class="org-select"
        @change="onOrgChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="isSuperAdmin" value="*">All Organizations</option>
        <option
          v-for="org in userOrgs"
          :key="org.organizationSlug"
          :value="org.organizationSlug"
        >
          {{ org.organizationName }}
        </option>
      </select>
    </div>

    <div class="search-wrapper">
      <ion-searchbar
        v-model="searchQuery"
        placeholder="Search workflows..."
        show-clear-button="focus"
        :debounce="200"
      />
    </div>

    <div v-if="navStore.loading || workflowsStore.loading" class="status-container">
      <ion-spinner name="crescent" />
      <p>Loading...</p>
    </div>

    <div v-else-if="navStore.error || workflowsStore.error" class="status-container error">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ navStore.error || workflowsStore.error }}</p>
      <ion-button fill="outline" size="small" @click="reload">Retry</ion-button>
    </div>

    <ion-list v-else lines="none" class="nav-list">
      <div class="category-header">
        <ion-icon :icon="gitBranchOutline" class="category-icon" />
        <span class="category-label">Workflows</span>
      </div>

      <template v-for="workflow in filteredWorkflows" :key="workflow.slug">
        <ion-item
          button
          :detail="false"
          class="workflow-item"
          :class="{ 'workflow-item--active': isActiveWorkflow(workflow.slug) }"
          @click="toggleWorkflow(workflow.slug)"
        >
          <ion-icon slot="start" :icon="gitBranchOutline" class="workflow-icon" />
          <ion-label class="workflow-label">{{ workflow.name }}</ion-label>

          <ion-badge
            v-if="runCount(workflow.slug) > 0"
            color="medium"
            slot="end"
            class="run-badge"
          >
            {{ runCount(workflow.slug) }}
          </ion-badge>

          <ion-icon
            v-if="runCount(workflow.slug) > 0"
            :icon="expandedWorkflows.has(workflow.slug) ? chevronDownOutline : chevronForwardOutline"
            slot="end"
            class="chevron-icon"
          />

          <ion-button
            fill="clear"
            size="small"
            slot="end"
            class="new-run-btn"
            title="New run"
            @click.stop="startNewRun(workflow.slug)"
          >
            <ion-icon :icon="addOutline" />
          </ion-button>
        </ion-item>

        <template v-if="expandedWorkflows.has(workflow.slug)">
          <ion-item
            v-for="run in navStore.runsForWorkflow(workflow.slug)"
            :key="run.conversationId"
            button
            :detail="false"
            class="run-item"
            :class="{ 'run-item--active': isActiveRun(run.conversationId) }"
            @click="openRun(workflow.slug, run.conversationId)"
          >
            <ion-icon
              :icon="run.status === 'completed' ? checkmarkCircleOutline : timeOutline"
              slot="start"
              class="run-icon"
            />
            <ion-label>
              <p class="run-title">{{ runLabel(run) }}</p>
              <p class="run-time">{{ formatRelativeTime(run.updatedAt ?? run.createdAt) }}</p>
            </ion-label>

            <ion-button
              fill="clear"
              size="small"
              slot="end"
              class="delete-run-btn"
              title="Delete run"
              @click.stop="confirmDeleteRun(workflow.slug, run)"
            >
              <ion-icon :icon="trashOutline" />
            </ion-button>
          </ion-item>
        </template>
      </template>

      <div v-if="filteredWorkflows.length === 0" class="empty-state">
        <p>No workflows found</p>
      </div>
    </ion-list>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonButton,
  IonSpinner,
  alertController,
} from '@ionic/vue';
import {
  alertCircleOutline,
  addOutline,
  chevronDownOutline,
  chevronForwardOutline,
  gitBranchOutline,
  checkmarkCircleOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { useWorkflowsStore } from '@/modules/workflows/stores/workflows.store';
import { useWorkflowsNavStore } from '@/modules/workflows/stores/workflows-nav.store';
import { useRbacStore } from '@/stores/rbacStore';
import {
  workflowsApiService,
  type WorkflowRunNavItem,
} from '@/modules/workflows/services/workflows-api.service';

const router = useRouter();
const route = useRoute();
const workflowsStore = useWorkflowsStore();
const navStore = useWorkflowsNavStore();
const rbacStore = useRbacStore();

const searchQuery = ref('');
const expandedWorkflows = ref<Set<string>>(new Set(['marketing-swarm']));

const userOrgs = computed(() => rbacStore.userOrganizations.filter((o) => !o.isGlobal));
const isSuperAdmin = computed(() =>
  rbacStore.userOrganizations.some((o) => o.isGlobal || o.organizationSlug === '*'),
);
const selectedOrg = computed(() => rbacStore.currentOrganization ?? '*');

const filteredWorkflows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const items = workflowsStore.workflows;
  if (!q) return items;
  return items.filter((w) => w.name.toLowerCase().includes(q));
});

function workflowRouteName(slug: string): string {
  if (slug === 'marketing-swarm') return 'MarketingSwarm';
  return 'MarketingSwarm';
}

function workflowPath(slug: string): string {
  return `/app/workflows/${slug}`;
}

function runCount(workflowSlug: string): number {
  return navStore.runsForWorkflow(workflowSlug).length;
}

function isActiveWorkflow(workflowSlug: string): boolean {
  return route.path === workflowPath(workflowSlug) && !route.query.conversationId;
}

function isActiveRun(conversationId: string): boolean {
  return route.query.conversationId === conversationId;
}

function runLabel(run: WorkflowRunNavItem): string {
  if (run.previewTitle) return run.previewTitle;
  return run.contentTypeSlug.replace(/-/g, ' ');
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const ts = new Date(isoString).getTime();
  const diffMs = now - ts;
  if (Number.isNaN(ts)) return '';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(isoString).toLocaleDateString();
}

function toggleWorkflow(workflowSlug: string): void {
  if (runCount(workflowSlug) === 0) {
    startNewRun(workflowSlug);
    return;
  }
  if (expandedWorkflows.value.has(workflowSlug)) {
    expandedWorkflows.value.delete(workflowSlug);
  } else {
    expandedWorkflows.value.add(workflowSlug);
  }
  expandedWorkflows.value = new Set(expandedWorkflows.value);
}

function startNewRun(workflowSlug: string): void {
  router.push({ name: workflowRouteName(workflowSlug) });
}

function openRun(workflowSlug: string, conversationId: string): void {
  router.push({
    name: workflowRouteName(workflowSlug),
    query: { conversationId },
  });
}

async function confirmDeleteRun(
  workflowSlug: string,
  run: WorkflowRunNavItem,
): Promise<void> {
  const alert = await alertController.create({
    header: 'Delete run?',
    message:
      'This permanently deletes the marketing swarm run, including all outputs, evaluations, and edit history. This cannot be undone.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void performDeleteRun(workflowSlug, run);
        },
      },
    ],
  });
  await alert.present();
}

async function performDeleteRun(
  workflowSlug: string,
  run: WorkflowRunNavItem,
): Promise<void> {
  await workflowsApiService.deleteWorkflowRun(workflowSlug, run.conversationId);
  navStore.removeRun(run.conversationId);
  if (isActiveRun(run.conversationId)) {
    router.push({ name: workflowRouteName(workflowSlug) });
  }
}

async function reload(): Promise<void> {
  const orgSlug = rbacStore.currentOrganization;
  const resolvedOrg = orgSlug === '*' ? undefined : (orgSlug ?? undefined);
  await Promise.all([
    workflowsStore.loadWorkflows(resolvedOrg),
    navStore.fetchRuns(resolvedOrg),
  ]);
}

async function onOrgChange(orgSlug: string): Promise<void> {
  await rbacStore.setOrganization(orgSlug);
  await reload();
}

function syncExpandedFromRoute(): void {
  if (route.path.startsWith('/app/workflows/marketing-swarm')) {
    expandedWorkflows.value = new Set([...expandedWorkflows.value, 'marketing-swarm']);
  }
}

watch(() => route.path, () => syncExpandedFromRoute());

watch(
  () => rbacStore.currentOrganization,
  async (org, prev) => {
    if (prev && org !== prev) {
      await reload();
    }
  },
);

onMounted(async () => {
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }
  if (
    rbacStore.currentOrganization === '*' &&
    !rbacStore.isSuperAdmin &&
    rbacStore.userOrganizations.length > 0
  ) {
    await rbacStore.setOrganization(rbacStore.userOrganizations[0].organizationSlug);
  }
  await reload();
  syncExpandedFromRoute();
});
</script>

<style scoped>
.workflow-nav-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--oai-sidebar-bg, #1e293b);
}

.org-selector-wrapper {
  padding: 12px 12px 0;
  flex-shrink: 0;
}

.org-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--oai-sidebar-divider, #334155);
  border-radius: 8px;
  background: var(--oai-bg-surface, rgba(255, 255, 255, 0.04));
  color: var(--oai-text-primary, #e2e8f0);
  font-size: 0.85rem;
  font-weight: 600;
  appearance: auto;
  cursor: pointer;
}

.search-wrapper {
  padding: 8px 8px 0;
  flex-shrink: 0;
}

.search-wrapper :deep(ion-searchbar) {
  --background: var(--oai-bg-surface, rgba(255, 255, 255, 0.04));
  --color: var(--oai-text-primary, #e2e8f0);
  --placeholder-color: var(--oai-text-muted, #94a3b8);
  --icon-color: var(--oai-text-muted, #94a3b8);
  --border-radius: 8px;
  padding: 0;
}

.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 8px;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 0.875rem;
}

.status-container.error {
  color: var(--ion-color-danger);
}

.nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
  background: transparent;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--oai-sidebar-section-label, #475569);
}

.workflow-item,
.run-item {
  --background: transparent;
  --background-hover: var(--oai-sidebar-item-hover, rgba(59, 130, 246, 0.08));
  --background-activated: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color, #94a3b8);
  --padding-start: 12px;
  --padding-end: 4px;
  --min-height: 40px;
  --border-radius: 6px;
  margin: 1px 6px;
  border-radius: 6px;
}

.workflow-item--active,
.run-item--active {
  --background: var(--oai-sidebar-item-active, rgba(59, 130, 246, 0.15));
  --color: var(--oai-sidebar-item-color-active, #3b82f6);
}

.run-item {
  --padding-start: 28px;
  --min-height: 36px;
}

.delete-run-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  --color: var(--oai-text-muted, #94a3b8);
  margin: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.run-item:hover .delete-run-btn {
  opacity: 1;
}

.delete-run-btn:hover {
  --color: var(--ion-color-danger, #ef4444);
}

.workflow-icon,
.run-icon {
  font-size: 1rem;
  color: var(--oai-sidebar-icon-color, #64748b);
  margin-inline-end: 8px;
}

.workflow-item--active .workflow-icon,
.run-item--active .run-icon {
  color: var(--oai-sidebar-icon-color-active, #3b82f6);
}

.workflow-label {
  font-size: 0.875rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-title {
  font-size: 0.8rem;
  color: var(--oai-text-primary, #e2e8f0);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-time {
  font-size: 0.7rem;
  color: var(--oai-text-muted, #94a3b8);
  margin: 2px 0 0;
}

.new-run-btn {
  --padding-start: 4px;
  --padding-end: 4px;
  --color: var(--oai-text-muted, #94a3b8);
  margin: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-item:hover .new-run-btn {
  opacity: 1;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: var(--oai-text-muted, #94a3b8);
  font-size: 0.875rem;
}
</style>
