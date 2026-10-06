<template>
  <div class="workflow-nav-tree">
    <div class="org-selector-wrapper">
      <select
        :value="selectedOrg"
        class="org-select"
        @change="onOrgChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="isSuperAdmin" value="*">All Organizations</option>
        <option v-for="org in pickableOrgs" :key="org.slug" :value="org.slug">
          {{ org.name }}
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

    <div class="filter-wrapper">
      <select
        :value="catalog.lifecycleFilter"
        class="lifecycle-select"
        aria-label="Filter by lifecycle"
        @change="catalog.setLifecycleFilter(($event.target as HTMLSelectElement).value as LifecycleFilter)"
      >
        <option value="all">All lifecycles</option>
        <option value="prod">Production</option>
        <option value="test">Test</option>
        <option value="dev">Dev</option>
        <option value="newly_created">New</option>
      </select>
    </div>

    <div v-if="catalog.loading" class="status-container">
      <ion-spinner name="crescent" />
      <p>Loading...</p>
    </div>

    <div v-else-if="catalog.error" class="status-container error">
      <ion-icon :icon="alertCircleOutline" color="danger" />
      <p>{{ catalog.error }}</p>
      <ion-button fill="outline" size="small" @click="reload">Retry</ion-button>
    </div>

    <ion-list v-else lines="none" class="nav-list">
      <template v-for="group in visibleGroups" :key="group.key">
        <div class="category-header">
          <ion-icon :icon="folderOpenOutline" class="category-icon" />
          <span class="category-label">{{ group.name }}</span>
        </div>

        <template v-for="workflow in group.workflows" :key="workflow.slug">
          <ion-item
            button
            :detail="false"
            class="workflow-item"
            :class="{
              'workflow-item--active': isActiveWorkflow(workflow.slug),
              'workflow-item--no-page': !canOpen(workflow),
            }"
            :disabled="!canOpen(workflow)"
            :title="unavailableReason(workflow)"
            @click="toggleWorkflow(workflow.slug)"
          >
            <ion-icon slot="start" :icon="iconFor(workflow.icon)" class="workflow-icon" />
            <ion-label class="workflow-label">
              {{ workflow.name }}
              <span v-if="lifecycleBadge(workflow.lifecycle)" class="lifecycle-badge">
                {{ lifecycleBadge(workflow.lifecycle) }}
              </span>
              <p v-if="!workflow.enabled" class="workflow-no-page">Disabled for this organization</p>
              <p v-else-if="!hasPage(workflow.slug)" class="workflow-no-page">No UI yet</p>
            </ion-label>

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
              v-if="canOpen(workflow)"
              fill="clear"
              size="small"
              slot="end"
              class="new-run-btn"
              :disabled="selectedOrg === '*'"
              :title="selectedOrg === '*' ? 'Select an organization to start a run' : 'New run'"
              @click.stop="startNewRun(workflow.slug)"
            >
              <ion-icon :icon="addOutline" />
            </ion-button>
          </ion-item>

          <template v-if="expandedWorkflows.has(workflow.slug)">
            <ion-item
              v-for="run in catalog.runsFor(workflow.slug)"
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
                <p class="run-title">{{ run.title }}</p>
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
      </template>

      <div v-if="visibleGroups.length === 0" class="empty-state">
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
  folderOpenOutline,
  gitBranchOutline,
  checkmarkCircleOutline,
  megaphoneOutline,
  shieldOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import type { WorkflowCatalogEntry } from '@orchestrator-ai/transport-types';
import {
  lifecycleBadge,
  useWorkflowCatalogStore,
  type LifecycleFilter,
  type NavGroup,
} from '@/modules/workflows/stores/workflowCatalogStore';
import { useRbacStore } from '@/stores/rbacStore';
import { useExecutionContextStore } from '@/modules/agents/stores/executionContextStore';
import { useOrgsStore } from '@/modules/admin/stores/orgs.store';
import { platformAuthService } from '@/modules/admin/services/platform-auth.service';
import { workflowRouteName } from '@/modules/workflows/workflowUiRegistry';
import {
  workflowsApiService,
  type WorkflowRunNavItem,
} from '@/modules/workflows/services/workflows-api.service';

const router = useRouter();
const route = useRoute();
const catalog = useWorkflowCatalogStore();
const rbacStore = useRbacStore();

const searchQuery = ref('');
const expandedWorkflows = ref<Set<string>>(new Set());

const orgsStore = useOrgsStore();
/** A super-admin may work in any org; others in the orgs they hold a role in. */
const pickableOrgs = computed(() =>
  rbacStore.isSuperAdmin
    ? orgsStore.sortedOrgs.filter((o) => o.slug !== '*').map((o) => ({ slug: o.slug, name: o.name }))
    : rbacStore.userOrganizations
        .filter((o) => o.organizationSlug !== '*')
        .map((o) => ({ slug: o.organizationSlug, name: o.organizationName })),
);
const isSuperAdmin = computed(() =>
  rbacStore.userOrganizations.some((o) => o.isGlobal || o.organizationSlug === '*'),
);
const selectedOrg = computed(() => rbacStore.currentOrganization ?? '*');

/** Workflow icon names the API may send; anything else shows the generic workflow icon. */
const ICONS: Readonly<Record<string, string>> = {
  megaphone: megaphoneOutline,
  shield: shieldOutline,
  flow: gitBranchOutline,
};

function iconFor(name: string): string {
  return ICONS[name] ?? gitBranchOutline;
}

const visibleGroups = computed<NavGroup[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return catalog.navGroups;
  return catalog.navGroups
    .map((group) => ({
      ...group,
      workflows: group.workflows.filter((w) => w.name.toLowerCase().includes(q)),
    }))
    .filter((group) => group.workflows.length > 0);
});

function hasPage(slug: string): boolean {
  return workflowRouteName(slug) !== null;
}

function canOpen(workflow: WorkflowCatalogEntry): boolean {
  return workflow.enabled && hasPage(workflow.slug);
}

function unavailableReason(workflow: WorkflowCatalogEntry): string | undefined {
  if (!workflow.enabled) return 'Disabled for this organization';
  if (!hasPage(workflow.slug)) return 'No UI for this workflow yet';
  return undefined;
}

function workflowPath(slug: string): string {
  return `/app/workflows/${slug}`;
}

function runCount(workflowSlug: string): number {
  return catalog.runsFor(workflowSlug).length;
}

function isActiveWorkflow(workflowSlug: string): boolean {
  return route.path === workflowPath(workflowSlug) && !route.query.conversationId;
}

function isActiveRun(conversationId: string): boolean {
  return route.query.conversationId === conversationId;
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
  const next = new Set(expandedWorkflows.value);
  if (next.has(workflowSlug)) next.delete(workflowSlug);
  else next.add(workflowSlug);
  expandedWorkflows.value = next;
}

function startNewRun(workflowSlug: string): void {
  if (selectedOrg.value === '*') return;
  const name = workflowRouteName(workflowSlug);
  if (name === null) return;
  router.push({ name });
}

function openRun(workflowSlug: string, conversationId: string): void {
  const name = workflowRouteName(workflowSlug);
  if (name === null) return;
  router.push({ name, query: { conversationId } });
}

async function confirmDeleteRun(workflowSlug: string, run: WorkflowRunNavItem): Promise<void> {
  const alert = await alertController.create({
    header: 'Delete run?',
    message: 'This permanently deletes the run and everything it produced. This cannot be undone.',
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

async function performDeleteRun(workflowSlug: string, run: WorkflowRunNavItem): Promise<void> {
  await workflowsApiService.deleteWorkflowRun(workflowSlug, run.conversationId);
  catalog.removeRun(workflowSlug, run.conversationId);
  if (isActiveRun(run.conversationId)) {
    startNewRun(workflowSlug);
  }
}

/** The workflow slug of the page open now, if it is a workflow page. */
function openWorkflowSlug(): string | null {
  const match = /^\/app\/workflows\/([^/]+)/.exec(route.path);
  return match ? match[1]! : null;
}

async function reload(): Promise<void> {
  catalog.setShowDisabled(rbacStore.hasPermission('admin:settings'));
  await catalog.load(selectedOrg.value);
  // A workflow page for a workflow this org does not have (or has disabled) closes.
  const open = openWorkflowSlug();
  if (open) {
    const entry = catalog.workflow(open);
    if (!entry || !entry.enabled) await router.push('/app/workflows');
  }
  syncExpandedFromRoute();
}

async function onOrgChange(orgSlug: string): Promise<void> {
  await rbacStore.setOrganization(orgSlug);
}

function syncExpandedFromRoute(): void {
  const open = openWorkflowSlug();
  if (open && runCount(open) > 0) {
    expandedWorkflows.value = new Set([...expandedWorkflows.value, open]);
  }
}

watch(() => route.path, () => syncExpandedFromRoute());

watch(
  () => rbacStore.currentOrganization,
  async (org, prev) => {
    if (org === prev) return;
    // A context belongs to one org: drop the one held for the old org.
    useExecutionContextStore().clear();
    // No org means signed out (this sidebar is still mounted while the shell
    // animates away): there is no catalog to load.
    if (!org) return;
    await reload();
  },
);

onMounted(async () => {
  if (!rbacStore.isInitialized) {
    await rbacStore.initialize();
  }
  if (rbacStore.isSuperAdmin && orgsStore.orgs.length === 0) {
    orgsStore.setOrgs(await platformAuthService.listOrgs());
  }
  if (
    rbacStore.currentOrganization === '*' &&
    !rbacStore.isSuperAdmin &&
    rbacStore.userOrganizations.length > 0
  ) {
    await rbacStore.setOrganization(rbacStore.userOrganizations[0].organizationSlug);
  }
  await reload();
});
</script>

<style scoped>
.workflow-item--no-page {
  opacity: 0.6;
}

.workflow-no-page {
  font-size: 11px;
  margin: 2px 0 0;
}

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

.filter-wrapper {
  padding: 0 12px 8px;
}

.lifecycle-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ion-color-medium-tint);
  border-radius: 6px;
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  font-size: 13px;
}

.lifecycle-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-contrast);
  vertical-align: middle;
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
