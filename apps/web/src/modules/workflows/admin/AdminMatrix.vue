<template>
  <section class="matrix-section">
    <p class="hint">{{ section.description }}</p>
    <p v-if="loading" class="hint">Loading...</p>
    <p v-if="problem" class="problem">{{ problem }}</p>
    <form v-if="draft" class="matrix" @submit.prevent="save">
      <div class="scroll">
        <table>
          <tr>
            <th />
            <th v-for="c in draft.columns" :key="c.key" :title="c.note ?? ''">{{ c.label }}</th>
          </tr>
          <tr v-for="r in draft.rows" :key="r.id">
            <th class="row-title">{{ r.title }}</th>
            <td v-for="c in draft.columns" :key="c.key">
              <input
                type="number"
                :min="range.min"
                :max="range.max"
                step="1"
                :value="r.cells[c.key]"
                :class="{ zero: r.cells[c.key] === 0 }"
                :disabled="busy"
                @input="set(r.cells, c.key, ($event.target as HTMLInputElement).value)"
              />
            </td>
          </tr>
        </table>
      </div>
      <p class="hint">{{ range.help }}</p>
      <div class="actions">
        <ion-button type="submit" :disabled="busy || !changed">Save</ion-button>
        <ion-button fill="clear" :disabled="busy || !changed" @click="reset">Undo changes</ion-button>
      </div>
    </form>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { WorkflowAdminMatrix, WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';
import { workflowAdminApi } from './workflowAdminApi';

/** A 'matrix' admin section: a number per row and column (e.g. an editor's weight per facet), saved together. */
const props = defineProps<{ slug: string; section: WorkflowAdminSectionView }>();
const emit = defineEmits<{ saved: [message: string] }>();

const loaded = ref<WorkflowAdminMatrix | null>(null);
const draft = ref<WorkflowAdminMatrix | null>(null);
const loading = ref(false);
const busy = ref(false);
const problem = ref<string | null>(null);
const range = computed(() => props.section.matrix ?? { min: 0, max: 0, help: '' });
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(loaded.value));

function set(cells: Record<string, number>, key: string, raw: string): void {
  // An emptied box is 0 ("does not care"); the API checks the range.
  cells[key] = raw.trim() === '' ? 0 : Number(raw);
}

function reset(): void {
  draft.value = loaded.value ? JSON.parse(JSON.stringify(loaded.value)) : null;
}

async function load(): Promise<void> {
  loading.value = true;
  problem.value = null;
  try {
    loaded.value = await workflowAdminApi.matrix(props.slug, props.section.key);
    reset();
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  busy.value = true;
  problem.value = null;
  try {
    loaded.value = await workflowAdminApi.saveMatrix(props.slug, props.section.key, draft.value!.rows.map((r) => ({ id: r.id, cells: r.cells })));
    reset();
    emit('saved', `${props.section.label} saved.`);
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

watch(() => [props.slug, props.section.key], () => void load());
onMounted(load);
</script>

<style scoped>
.matrix-section { display: flex; flex-direction: column; gap: 10px; }
.hint { color: var(--ion-color-medium); margin: 0; font-size: 13px; }
.problem { color: var(--ion-color-danger); margin: 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; font-size: 12px; }
th { font-weight: 600; text-align: center; padding: 4px 6px; color: var(--ion-color-medium); max-width: 80px; }
.row-title { text-align: left; color: var(--ion-text-color); white-space: nowrap; padding-right: 12px; }
td { padding: 2px 4px; text-align: center; }
input { width: 44px; padding: 4px; text-align: center; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; }
input.zero { color: var(--ion-color-medium); }
.actions { display: flex; gap: 8px; }
</style>
