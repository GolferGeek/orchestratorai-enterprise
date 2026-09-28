<template>
  <ion-page>
    <ion-content class="ion-padding">
      <div class="admin-page">
        <header class="head">
          <div>
            <h2>{{ view?.name ?? slug }} <span class="sub">admin</span></h2>
            <p class="hint">Settings for {{ org }}. Changes apply to the next run.</p>
          </div>
          <router-link v-if="workflowRoute" :to="{ name: workflowRoute }">Back to the workflow</router-link>
        </header>

        <p v-if="blocked" class="problem">{{ blocked }}</p>
        <p v-else-if="loading" class="hint">Loading...</p>
        <p v-else-if="problem" class="problem">{{ problem }}</p>

        <template v-else-if="view">
          <nav class="tabs">
            <button v-for="t in tabs" :key="t.key" type="button" class="tab" :class="{ 'tab--active': tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
          </nav>
          <p v-if="message" class="message">{{ message }}</p>

          <AdminAgents v-if="tab === 'agents'" :slug="slug" :org="org" :agents="view.agents" @saved="saved" />
          <AdminModels v-else-if="tab === 'models'" :slug="slug" :org="org" :roles="view.modelRoles" @saved="saved" />
          <template v-for="s in view.sections" :key="s.key">
            <AdminSection v-if="tab === `section:${s.key}`" :slug="slug" :section="s" @saved="saved" />
          </template>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IonContent, IonPage } from '@ionic/vue';
import type { WorkflowAdminView } from '@orchestrator-ai/transport-types';
import { useRbacStore } from '@/stores/rbacStore';
import { workflowRouteName } from '@/modules/workflows/workflowUiRegistry';
import AdminAgents from './AdminAgents.vue';
import AdminModels from './AdminModels.vue';
import AdminSection from './AdminSection.vue';
import { workflowAdminApi } from './workflowAdminApi';

/**
 * Every workflow's admin: its agents (the org's instructions), the model for
 * each role, and the configurable sections the workflow declares.
 */
const route = useRoute();
const rbacStore = useRbacStore();

const slug = computed(() => String(route.params.slug));
const org = computed(() => rbacStore.currentOrganization ?? '*');
const workflowRoute = computed(() => workflowRouteName(slug.value));
const view = ref<WorkflowAdminView | null>(null);
const loading = ref(false);
const problem = ref<string | null>(null);
const message = ref<string | null>(null);
const tab = ref('agents');

const blocked = computed(() => {
  if (org.value === '*') return 'Select an organization to administer its workflows.';
  if (!rbacStore.hasPermission('admin:settings')) return `You need admin rights in ${org.value} to change its workflows.`;
  return null;
});

const tabs = computed(() => [
  { key: 'agents', label: 'Agents' },
  ...(view.value?.modelRoles.length ? [{ key: 'models', label: 'Models' }] : []),
  ...(view.value?.sections ?? []).map((s) => ({ key: `section:${s.key}`, label: s.label })),
]);

function saved(text: string): void {
  message.value = text;
  void reloadView();
}

async function reloadView(): Promise<void> {
  view.value = await workflowAdminApi.view(slug.value);
}

async function load(): Promise<void> {
  view.value = null;
  message.value = null;
  if (blocked.value) return;
  loading.value = true;
  problem.value = null;
  try {
    await reloadView();
    if (!tabs.value.some((t) => t.key === tab.value)) tab.value = 'agents';
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

watch([slug, org, () => rbacStore.user?.id], () => void load(), { immediate: true });
</script>

<style scoped>
.admin-page { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.head h2 { margin: 0; }
.sub { color: var(--ion-color-medium); font-weight: 400; font-size: 16px; }
.hint { color: var(--ion-color-medium); margin: 4px 0 0; }
.problem { color: var(--ion-color-danger); }
.message { color: var(--ion-color-success-shade); margin: 0; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--ion-color-light-shade); flex-wrap: wrap; }
.tab { background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 12px; color: var(--ion-color-medium); font: inherit; cursor: pointer; }
.tab--active { color: var(--ion-color-primary); border-bottom-color: var(--ion-color-primary); }
</style>
