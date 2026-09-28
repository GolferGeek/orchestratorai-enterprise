<template>
  <section class="agents">
    <p class="hint">
      The agents this workflow runs. Changing an agent's instructions changes it for {{ org }} only, and takes effect on the next run.
      The input and output contracts are fixed by the workflow.
    </p>
    <p v-if="!agents.length" class="hint">This workflow runs no configurable agents.</p>
    <article v-for="a in agents" :key="a.slug" class="agent">
      <header>
        <strong>{{ a.name }}</strong>
        <span class="badge" :class="{ 'badge--custom': a.overrideInstructions !== null }">{{ a.overrideInstructions !== null ? `Customized for ${org}` : 'Default' }}</span>
        <span class="meta">{{ PURPOSES[a.purpose] ?? a.purpose }} · model role: {{ a.modelRole }} · {{ a.slug }}</span>
      </header>
      <p v-if="a.description" class="meta">{{ a.description }}</p>
      <textarea v-model="drafts[a.slug]" rows="8" :disabled="busy" />
      <div class="actions">
        <ion-button size="small" :disabled="busy || !changed(a)" @click="save(a, drafts[a.slug]!.trim())">Save</ion-button>
        <ion-button v-if="a.overrideInstructions !== null" size="small" fill="outline" :disabled="busy" @click="save(a, null)">Reset to default</ion-button>
        <ion-button size="small" fill="clear" :disabled="busy" @click="toggleHistory(a.slug)">{{ history[a.slug] ? 'Hide history' : 'History' }}</ion-button>
      </div>
      <ol v-if="history[a.slug]" class="history">
        <li v-if="!history[a.slug]!.length" class="meta">No changes yet.</li>
        <li v-for="(c, i) in history[a.slug]" :key="i">
          <span class="meta">{{ new Date(c.changedAt).toLocaleString() }}:</span>
          {{ c.instructions === null ? 'Reset to the default.' : c.instructions.slice(0, 200) + (c.instructions.length > 200 ? '...' : '') }}
        </li>
      </ol>
    </article>
    <p v-if="problem" class="problem">{{ problem }}</p>
  </section>
</template>

<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { WorkflowAdminAgentChange, WorkflowAdminAgentView } from '@orchestrator-ai/transport-types';
import { workflowAdminApi } from './workflowAdminApi';

const props = defineProps<{ slug: string; org: string; agents: WorkflowAdminAgentView[] }>();
const emit = defineEmits<{ saved: [message: string] }>();

const PURPOSES: Record<string, string> = { step: 'Runs a step', trace_review: 'Reviews traces' };
const drafts = reactive<Record<string, string>>({});
const history = reactive<Record<string, WorkflowAdminAgentChange[] | null>>({});
const busy = ref(false);
const problem = ref<string | null>(null);

const effective = (a: WorkflowAdminAgentView) => a.overrideInstructions ?? a.defaultInstructions;
const changed = (a: WorkflowAdminAgentView) => (drafts[a.slug] ?? '').trim() !== effective(a) && (drafts[a.slug] ?? '').trim() !== '';

watch(
  () => props.agents,
  (agents) => {
    for (const a of agents) drafts[a.slug] = effective(a);
  },
  { immediate: true },
);

async function save(agent: WorkflowAdminAgentView, instructions: string | null): Promise<void> {
  busy.value = true;
  problem.value = null;
  try {
    await workflowAdminApi.saveAgent(props.slug, agent.slug, instructions);
    if (history[agent.slug]) history[agent.slug] = (await workflowAdminApi.agentHistory(props.slug, agent.slug)).changes;
    emit('saved', instructions === null ? `${agent.name} is back to its default instructions.` : `${agent.name}'s instructions saved for ${props.org}.`);
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function toggleHistory(agent: string): Promise<void> {
  if (history[agent]) {
    history[agent] = null;
    return;
  }
  try {
    history[agent] = (await workflowAdminApi.agentHistory(props.slug, agent)).changes;
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<style scoped>
.agents { display: flex; flex-direction: column; gap: 16px; }
.hint { color: var(--ion-color-medium); margin: 0; }
.problem { color: var(--ion-color-danger); margin: 0; }
.agent { display: flex; flex-direction: column; gap: 6px; padding-bottom: 16px; border-bottom: 1px solid var(--ion-color-light-shade); }
.agent header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.meta { color: var(--ion-color-medium); font-size: 12px; margin: 0; }
.badge { font-size: 11px; padding: 1px 6px; border: 1px solid var(--ion-color-medium-tint); color: var(--ion-color-medium); }
.badge--custom { border-color: var(--ion-color-primary); color: var(--ion-color-primary); }
textarea { width: 100%; padding: 8px; font: inherit; font-size: 13px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.history { margin: 0; padding-left: 18px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
</style>
