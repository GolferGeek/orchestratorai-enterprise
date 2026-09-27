<template>
  <ion-page>
    <div class="detail-view">
      <div class="detail-header">
        <h2>Workflows</h2>
        <div class="header-actions">
          <ion-button fill="clear" size="small" :disabled="busy" @click="load">
            <ion-icon :icon="refreshOutline" slot="icon-only" />
          </ion-button>
        </div>
      </div>

      <div class="detail-body">
        <div class="org-selector-bar">
          <ion-label>Organization:</ion-label>
          <select :value="org ?? ''" class="org-select" @change="selectOrg(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>Select organization...</option>
            <option v-for="o in orgs" :key="o.slug" :value="o.slug">{{ o.name }}</option>
          </select>
        </div>

        <div v-if="!org" class="empty-state">
          <ion-icon :icon="businessOutline" />
          <h3>Select an Organization</h3>
          <p>Workflow settings and groups belong to one organization.</p>
        </div>

        <div v-else-if="loading" class="loading-state">
          <ion-spinner />
          <p>Loading workflows...</p>
        </div>

        <template v-else>
          <p v-if="message" class="message" :class="{ 'message--error': messageIsError }">{{ message }}</p>

          <section class="panel">
            <h3>Settings</h3>
            <p class="hint">Disabled workflows are hidden from members and refuse new runs.</p>
            <div v-for="workflow in workflows" :key="workflow.slug" class="setting-row">
              <div class="setting-name">
                <strong>{{ workflow.name }}</strong>
                <span class="slug">{{ workflow.slug }}</span>
              </div>
              <ion-toggle
                :checked="workflow.enabled"
                :disabled="busy"
                @ionChange="save(workflow.slug, { enabled: $event.detail.checked })"
              >Enabled</ion-toggle>
              <select
                :value="workflow.lifecycle"
                class="lifecycle-select"
                :disabled="busy"
                @change="save(workflow.slug, { lifecycle: ($event.target as HTMLSelectElement).value as WorkflowLifecycle })"
              >
                <option v-for="l in lifecycles" :key="l.value" :value="l.value">{{ l.label }}</option>
              </select>
              <input
                class="note-input"
                :value="workflow.note ?? ''"
                placeholder="Note for this organization"
                :disabled="busy"
                @change="saveNote(workflow.slug, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </section>

          <section class="panel">
            <h3>Groups</h3>
            <p class="hint">
              Workflows not placed in a group appear under their default group. Drag to reorder
              within a group; Save layout applies everything at once.
            </p>

            <div class="new-group">
              <input v-model="newGroupName" class="note-input" placeholder="New group name" :disabled="busy" />
              <ion-button size="small" :disabled="busy || !newGroupName.trim()" @click="addGroup">Add group</ion-button>
            </div>

            <div v-for="(group, index) in layout" :key="group.id" class="group-card">
              <div class="group-header">
                <input
                  class="group-name"
                  :value="group.name"
                  :disabled="busy"
                  @change="rename(group, ($event.target as HTMLInputElement).value)"
                />
                <ion-button fill="clear" size="small" :disabled="busy || index === 0" title="Move up" @click="moveGroup(index, -1)">
                  <ion-icon :icon="arrowUpOutline" slot="icon-only" />
                </ion-button>
                <ion-button
                  fill="clear"
                  size="small"
                  :disabled="busy || index === layout.length - 1"
                  title="Move down"
                  @click="moveGroup(index, 1)"
                >
                  <ion-icon :icon="arrowDownOutline" slot="icon-only" />
                </ion-button>
                <ion-button fill="clear" size="small" color="danger" :disabled="busy" title="Delete group" @click="remove(group)">
                  <ion-icon :icon="trashOutline" slot="icon-only" />
                </ion-button>
              </div>
              <ion-reorder-group :disabled="busy" @ionItemReorder="reorder(group, $event)">
                <ion-item v-for="slug in group.workflowSlugs" :key="slug" lines="none" class="group-item">
                  <ion-label>{{ nameOf(slug) }}</ion-label>
                  <ion-button slot="end" fill="clear" size="small" :disabled="busy" @click="unplace(group, slug)">Remove</ion-button>
                  <ion-reorder slot="end" />
                </ion-item>
              </ion-reorder-group>
              <p v-if="group.workflowSlugs.length === 0" class="hint">No workflows in this group.</p>
            </div>

            <div v-if="unplaced.length > 0" class="group-card group-card--unplaced">
              <div class="group-header"><strong>Not in a group</strong></div>
              <ion-item v-for="slug in unplaced" :key="slug" lines="none" class="group-item">
                <ion-label>{{ nameOf(slug) }}</ion-label>
                <select
                  slot="end"
                  class="lifecycle-select"
                  :disabled="busy || layout.length === 0"
                  @change="place(slug, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Add to group...</option>
                  <option v-for="group in layout" :key="group.id" :value="group.id">{{ group.name }}</option>
                </select>
              </ion-item>
            </div>

            <div class="actions">
              <ion-button :disabled="busy || !layoutDirty" @click="saveLayout">Save layout</ion-button>
            </div>
          </section>

          <ImprovementRequestsPanel :org="org" />
        </template>
      </div>
    </div>
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSpinner,
  IonToggle,
  alertController,
  type ItemReorderEventDetail,
} from '@ionic/vue';
import { arrowDownOutline, arrowUpOutline, businessOutline, refreshOutline, trashOutline } from 'ionicons/icons';
import type { WorkflowCatalogEntry, WorkflowLifecycle } from '@orchestrator-ai/transport-types';
import { useRbacStore } from '@/stores/rbacStore';
import { platformAuthService } from '@/modules/admin/services/platform-auth.service';
import { useOrgsStore } from '@/modules/admin/stores/orgs.store';
import { useWorkflowCatalogStore } from '@/modules/workflows/stores/workflowCatalogStore';
import ImprovementRequestsPanel from '@/modules/admin/components/ImprovementRequestsPanel.vue';
import {
  workflowsApiService,
  type OrgWorkflowGroup,
  type OrgWorkflowSetting,
} from '@/modules/workflows/services/workflows-api.service';

const rbacStore = useRbacStore();
const orgsStore = useOrgsStore();
const catalogStore = useWorkflowCatalogStore();

const lifecycles: Array<{ value: WorkflowLifecycle; label: string }> = [
  { value: 'newly_created', label: 'New' },
  { value: 'dev', label: 'Dev' },
  { value: 'test', label: 'Test' },
  { value: 'prod', label: 'Production' },
];

const workflows = ref<WorkflowCatalogEntry[]>([]);
const layout = ref<OrgWorkflowGroup[]>([]);
const savedLayout = ref('');
const newGroupName = ref('');
const loading = ref(false);
const busy = ref(false);
const message = ref<string | null>(null);
const messageIsError = ref(false);

/** A super-admin may manage any org; others, the orgs they hold a role in. */
const orgs = computed(() =>
  rbacStore.isSuperAdmin
    ? orgsStore.sortedOrgs.filter((o) => o.slug !== '*').map((o) => ({ slug: o.slug, name: o.name }))
    : rbacStore.userOrganizations
        .filter((o) => !o.isGlobal && o.organizationSlug !== '*')
        .map((o) => ({ slug: o.organizationSlug, name: o.organizationName })),
);
const org = computed(() => {
  const current = rbacStore.currentOrganization;
  return current && current !== '*' ? current : null;
});
const unplaced = computed(() => {
  const placed = new Set(layout.value.flatMap((g) => g.workflowSlugs));
  return workflows.value.map((w) => w.slug).filter((slug) => !placed.has(slug));
});
const layoutDirty = computed(() => serialize(layout.value) !== savedLayout.value);

function serialize(groups: OrgWorkflowGroup[]): string {
  return JSON.stringify(groups.map((g) => ({ id: g.id, slugs: g.workflowSlugs })));
}

function nameOf(slug: string): string {
  return workflows.value.find((w) => w.slug === slug)?.name ?? slug;
}

function report(text: string, isError = false): void {
  message.value = text;
  messageIsError.value = isError;
}

async function run(action: () => Promise<void>, done: string): Promise<void> {
  busy.value = true;
  try {
    await action();
    report(done);
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), true);
  } finally {
    busy.value = false;
  }
}

async function load(): Promise<void> {
  if (!org.value) return;
  loading.value = true;
  message.value = null;
  try {
    const [catalog, groups] = await Promise.all([
      workflowsApiService.fetchCatalog(org.value),
      workflowsApiService.fetchGroups(),
    ]);
    workflows.value = catalog.workflows;
    layout.value = groups.map((g) => ({ ...g, workflowSlugs: [...g.workflowSlugs] }));
    savedLayout.value = serialize(layout.value);
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), true);
  } finally {
    loading.value = false;
  }
}

/** The nav shows the change too. */
async function refreshNav(): Promise<void> {
  if (org.value) await catalogStore.load(org.value);
}

async function selectOrg(slug: string): Promise<void> {
  await rbacStore.setOrganization(slug);
}

async function save(
  slug: string,
  change: Partial<Pick<OrgWorkflowSetting, 'enabled' | 'lifecycle' | 'note'>>,
): Promise<void> {
  await run(async () => {
    const saved = await workflowsApiService.saveSetting(slug, change);
    workflows.value = workflows.value.map((w) =>
      w.slug === slug ? { ...w, enabled: saved.enabled, lifecycle: saved.lifecycle, note: saved.note } : w,
    );
    await refreshNav();
  }, 'Saved');
}

async function saveNote(slug: string, value: string): Promise<void> {
  const note = value.trim();
  await save(slug, { note: note === '' ? null : note });
}

async function addGroup(): Promise<void> {
  const name = newGroupName.value.trim();
  await run(async () => {
    const group = await workflowsApiService.createGroup(name);
    layout.value = [...layout.value, group];
    // The server now has the new, empty group last; unsaved moves stay unsaved.
    const saved = JSON.parse(savedLayout.value) as Array<{ id: string; slugs: string[] }>;
    savedLayout.value = JSON.stringify([...saved, { id: group.id, slugs: [] }]);
    newGroupName.value = '';
    await refreshNav();
  }, `Added "${name}"`);
}

async function rename(group: OrgWorkflowGroup, value: string): Promise<void> {
  const name = value.trim();
  if (!name || name === group.name) return;
  await run(async () => {
    await workflowsApiService.renameGroup(group.id, name);
    group.name = name;
    await refreshNav();
  }, 'Renamed');
}

async function remove(group: OrgWorkflowGroup): Promise<void> {
  const alert = await alertController.create({
    header: `Delete "${group.name}"?`,
    message: 'Its workflows return to their default groups.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: () => {
          void run(async () => {
            await workflowsApiService.deleteGroup(group.id);
            await load();
            await refreshNav();
          }, `Deleted "${group.name}"`);
        },
      },
    ],
  });
  await alert.present();
}

function moveGroup(index: number, by: number): void {
  const next = [...layout.value];
  const [group] = next.splice(index, 1);
  next.splice(index + by, 0, group!);
  layout.value = next;
}

function reorder(group: OrgWorkflowGroup, event: CustomEvent<ItemReorderEventDetail>): void {
  group.workflowSlugs = event.detail.complete(group.workflowSlugs) as string[];
}

function place(slug: string, groupId: string): void {
  const group = layout.value.find((g) => g.id === groupId);
  if (group) group.workflowSlugs = [...group.workflowSlugs, slug];
}

function unplace(group: OrgWorkflowGroup, slug: string): void {
  group.workflowSlugs = group.workflowSlugs.filter((s) => s !== slug);
}

async function saveLayout(): Promise<void> {
  await run(async () => {
    await workflowsApiService.saveLayout(
      layout.value.map((g) => ({ groupId: g.id, workflowSlugs: g.workflowSlugs })),
    );
    savedLayout.value = serialize(layout.value);
    await refreshNav();
  }, 'Layout saved');
}

watch(org, () => void load());

onMounted(async () => {
  if (!rbacStore.isInitialized) await rbacStore.initialize();
  if (rbacStore.isSuperAdmin && orgsStore.orgs.length === 0) {
    try {
      orgsStore.setOrgs(await platformAuthService.listOrgs());
    } catch (err) {
      report(err instanceof Error ? err.message : String(err), true);
    }
  }
  await load();
});
</script>

<style scoped>
.detail-view {
  height: 100%;
  overflow-y: auto;
  padding: 16px 24px 32px;
}
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-header h2 {
  margin: 0;
}
.org-selector-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.org-select,
.lifecycle-select,
.note-input,
.group-name {
  padding: 6px 8px;
  border: 1px solid var(--ion-color-medium-tint);
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  font-size: 14px;
}
.org-select {
  min-width: 240px;
}
.panel {
  margin-top: 24px;
}
.hint {
  color: var(--ion-color-medium);
  font-size: 13px;
}
.setting-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto 140px minmax(200px, 2fr);
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--ion-color-light-shade);
}
.setting-name {
  display: flex;
  flex-direction: column;
}
.slug {
  color: var(--ion-color-medium);
  font-size: 12px;
}
.new-group,
.group-header {
  display: flex;
  gap: 8px;
  align-items: center;
}
.group-card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--ion-color-light-shade);
}
.group-card--unplaced {
  border-style: dashed;
}
.group-name {
  flex: 1;
  font-weight: 600;
}
.group-item {
  --min-height: 40px;
}
.actions {
  margin-top: 16px;
}
.message {
  padding: 8px 12px;
  background: var(--ion-color-success-tint);
}
.message--error {
  background: var(--ion-color-danger-tint);
}
@media (max-width: 720px) {
  .setting-row {
    grid-template-columns: 1fr;
  }
}
</style>
