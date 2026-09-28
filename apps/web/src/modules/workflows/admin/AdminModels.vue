<template>
  <section class="models">
    <p class="hint">The model {{ org }} uses for each of this workflow's roles. A workflow cannot start until every role has one.</p>
    <p v-if="loading" class="hint">Loading...</p>
    <div v-for="role in roles" :key="role" class="role">
      <strong>{{ role }}</strong>
      <select :value="current(role)" :disabled="busy" @change="save(role, ($event.target as HTMLSelectElement).value)">
        <option value="" disabled>Choose a model</option>
        <optgroup v-for="(list, provider) in byProvider" :key="provider" :label="provider">
          <option v-for="m in list" :key="m.slug" :value="`${m.provider}|${m.slug}`">{{ m.displayName }}</option>
        </optgroup>
      </select>
      <span v-if="!current(role)" class="missing">not set</span>
    </div>
    <p v-if="problem" class="problem">{{ problem }}</p>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { WorkflowModelProfile } from '@orchestrator-ai/transport-types';
import type { LlmModel } from '@/modules/settings/services/settings-api.service';
import { workflowAdminApi } from './workflowAdminApi';

const props = defineProps<{ slug: string; org: string; roles: string[] }>();
const emit = defineEmits<{ saved: [message: string] }>();

const profiles = ref<WorkflowModelProfile[]>([]);
const models = ref<LlmModel[]>([]);
const loading = ref(false);
const busy = ref(false);
const problem = ref<string | null>(null);

const byProvider = computed(() => {
  const groups: Record<string, LlmModel[]> = {};
  for (const m of models.value.filter((x) => x.enabled)) (groups[m.provider] ??= []).push(m);
  return groups;
});

function current(role: string): string {
  const p = profiles.value.find((x) => x.role === role);
  return p ? `${p.provider}|${p.model}` : '';
}

async function load(): Promise<void> {
  loading.value = true;
  problem.value = null;
  try {
    const [p, m] = await Promise.all([workflowAdminApi.profiles(props.slug), workflowAdminApi.models()]);
    profiles.value = p.profiles;
    models.value = m;
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function save(role: string, value: string): Promise<void> {
  const [provider, model] = value.split('|') as [string, string];
  busy.value = true;
  problem.value = null;
  try {
    await workflowAdminApi.saveProfile(props.slug, role, provider, model);
    await load();
    emit('saved', `${role} now uses ${model}.`);
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

watch(() => props.slug, () => void load());
onMounted(load);
</script>

<style scoped>
.models { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--ion-color-medium); margin: 0; }
.problem { color: var(--ion-color-danger); margin: 0; }
.role { display: grid; grid-template-columns: 140px minmax(0, 420px) auto; gap: 12px; align-items: center; }
select { padding: 6px 8px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; }
.missing { color: var(--ion-color-danger); font-size: 12px; }
@media (max-width: 600px) { .role { grid-template-columns: 1fr; } }
</style>
