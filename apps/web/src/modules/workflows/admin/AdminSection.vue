<template>
  <section class="admin-section">
    <p class="hint">{{ section.description }}</p>
    <p v-if="loading" class="hint">Loading...</p>
    <p v-if="problem" class="problem">{{ problem }}</p>

    <!-- One settings record -->
    <form v-if="section.kind === 'single' && draft" class="form grid" @submit.prevent="saveDraft">
      <AdminFieldInput v-for="f in visibleFields" :key="f.key" :field="f" :model-value="draft[f.key]" :disabled="busy || !section.canUpdate" @update="(v) => (draft![f.key] = v)" />
      <div class="actions"><ion-button v-if="section.canUpdate" type="submit" :disabled="busy">Save</ion-button></div>
    </form>

    <!-- Rows -->
    <template v-else-if="section.kind === 'list'">
      <div class="toolbar">
        <ion-button v-if="section.canCreate" size="small" :disabled="busy" @click="startNew">Add</ion-button>
        <ion-button v-if="section.bulk" size="small" fill="outline" :disabled="busy || !rows.length" @click="startBulk">Edit {{ section.bulk.label.toLowerCase() }}</ion-button>
      </div>

      <form v-if="bulk" class="bulk" @submit.prevent="saveBulk">
        <table>
          <tr><th>{{ fieldOf(section.titleField)?.label }}</th><th v-for="key in section.bulk!.fields" :key="key">{{ fieldOf(key)?.label }}</th></tr>
          <tr v-for="r in bulk" :key="r.id">
            <td>{{ r.title }}</td>
            <td v-for="key in section.bulk!.fields" :key="key">
              <AdminFieldInput :field="{ ...fieldOf(key)!, help: undefined, label: '' }" :model-value="r.row[key]" :disabled="busy" @update="(v) => (r.row[key] = v)" />
            </td>
          </tr>
          <tr v-if="bulkTotals.length" class="totals">
            <td>Total</td>
            <td v-for="t in bulkTotals" :key="t.key">{{ t.total === null ? '' : t.total.toFixed(2) }}</td>
          </tr>
        </table>
        <div class="actions">
          <ion-button type="submit" :disabled="busy">Save {{ section.bulk!.label.toLowerCase() }}</ion-button>
          <ion-button fill="clear" :disabled="busy" @click="bulk = null">Cancel</ion-button>
        </div>
      </form>

      <form v-if="draft && editing === NEW" class="form grid editor" @submit.prevent="saveDraft">
        <h4>New {{ section.label.toLowerCase() }}</h4>
        <AdminFieldInput v-for="f in editableFields" :key="f.key" :field="f" :model-value="draft[f.key]" :disabled="busy" @update="(v) => (draft![f.key] = v)" />
        <div class="actions">
          <ion-button type="submit" :disabled="busy">Add</ion-button>
          <ion-button fill="clear" :disabled="busy" @click="cancel">Cancel</ion-button>
        </div>
      </form>

      <ul class="rows">
        <li v-for="row in rows" :key="idOf(row)" class="row">
          <button type="button" class="row-head" @click="toggle(row)">
            <strong>{{ row[section.titleField] }}</strong>
            <span v-for="f in summaryFields" :key="f.key" class="meta">{{ f.label }}: {{ show(f, row[f.key]) }}</span>
          </button>
          <form v-if="editing === idOf(row) && draft" class="form grid editor" @submit.prevent="saveDraft">
            <AdminFieldInput
              v-for="f in visibleFields"
              :key="f.key"
              :field="isBulkField(f.key) ? { ...f, readOnly: true, help: `Edited under ${section.bulk!.label}` } : f"
              :model-value="draft[f.key]"
              :disabled="busy || !section.canUpdate"
              @update="(v) => (draft![f.key] = v)"
            />
            <div class="actions">
              <ion-button v-if="section.canUpdate" type="submit" :disabled="busy">Save</ion-button>
              <ion-button v-if="section.canDelete" color="danger" fill="outline" :disabled="busy" @click="remove(row)">Remove</ion-button>
              <ion-button fill="clear" :disabled="busy" @click="cancel">Close</ion-button>
            </div>
          </form>
        </li>
        <li v-if="!rows.length && !loading" class="hint">Nothing here yet.</li>
      </ul>
    </template>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue, WorkflowAdminField, WorkflowAdminRow, WorkflowAdminSectionView } from '@orchestrator-ai/transport-types';
import AdminFieldInput from './AdminFieldInput.vue';
import { workflowAdminApi } from './workflowAdminApi';

/**
 * One admin section of a workflow, rendered from its field list: a settings
 * form ('single'), or rows with add / edit / remove and, when the section has
 * one, a table editing its bulk fields for every row at once.
 */
const props = defineProps<{ slug: string; section: WorkflowAdminSectionView }>();
const emit = defineEmits<{ saved: [message: string] }>();

const NEW = '__new__';
const rows = ref<WorkflowAdminRow[]>([]);
const loading = ref(false);
const busy = ref(false);
const problem = ref<string | null>(null);
const editing = ref<string | null>(null);
const draft = ref<WorkflowAdminRow | null>(null);
const bulk = ref<Array<{ id: string; title: string; row: WorkflowAdminRow }> | null>(null);

const fieldOf = (key: string) => props.section.fields.find((f) => f.key === key);
const isBulkField = (key: string) => props.section.bulk?.fields.includes(key) ?? false;
const idOf = (row: WorkflowAdminRow) => String(row[props.section.idField]);
/** The id is shown only when it means something to a person (not a generated id). */
const visibleFields = computed(() => props.section.fields.filter((f) => !(f.key === props.section.idField && f.readOnly && f.key === 'id')));
const editableFields = computed(() => props.section.fields.filter((f) => !f.readOnly));
const summaryFields = computed(() =>
  props.section.fields.filter((f) => f.key !== props.section.titleField && f.kind !== 'textarea' && !(f.key === 'id' && f.readOnly)).slice(0, 4),
);
const bulkTotals = computed(() =>
  (props.section.bulk?.fields ?? []).map((key) => {
    if (fieldOf(key)?.kind !== 'number' || !bulk.value) return { key, total: null };
    // Weights usually count only for active rows; sum those when the bulk edit has an "active" flag.
    const active = props.section.bulk!.fields.find((k) => fieldOf(k)?.kind === 'boolean');
    const counted = bulk.value.filter((r) => !active || r.row[active] === true);
    return { key, total: counted.reduce((sum, r) => sum + (typeof r.row[key] === 'number' ? (r.row[key] as number) : 0), 0) };
  }),
);

function show(field: WorkflowAdminField, value: JsonValue | undefined): string {
  if (field.kind === 'boolean') return value === true ? 'yes' : 'no';
  if (value === null || value === undefined) return '-';
  return String(value);
}

async function run(work: () => Promise<void>, done?: string): Promise<boolean> {
  busy.value = true;
  problem.value = null;
  try {
    await work();
    if (done) emit('saved', done);
    return true;
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    busy.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  problem.value = null;
  try {
    rows.value = (await workflowAdminApi.rows(props.slug, props.section.key)).rows;
    if (props.section.kind === 'single') {
      const first = rows.value[0];
      if (!first) throw new Error(`${props.section.label} has no settings record`);
      editing.value = idOf(first);
      draft.value = { ...first };
    }
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function startNew(): void {
  bulk.value = null;
  editing.value = NEW;
  draft.value = Object.fromEntries(editableFields.value.map((f) => [f.key, f.kind === 'boolean' ? true : null]));
}

function toggle(row: WorkflowAdminRow): void {
  if (editing.value === idOf(row)) return cancel();
  bulk.value = null;
  editing.value = idOf(row);
  draft.value = { ...row };
}

function cancel(): void {
  editing.value = props.section.kind === 'single' ? editing.value : null;
  draft.value = props.section.kind === 'single' ? draft.value : null;
}

function startBulk(): void {
  cancel();
  const fields = props.section.bulk!.fields;
  bulk.value = rows.value.map((r) => ({ id: idOf(r), title: String(r[props.section.titleField]), row: Object.fromEntries(fields.map((k) => [k, r[k] ?? null])) }));
}

async function saveDraft(): Promise<void> {
  const row = draft.value!;
  const id = editing.value!;
  await run(async () => {
    if (id === NEW) await workflowAdminApi.create(props.slug, props.section.key, row);
    else await workflowAdminApi.update(props.slug, props.section.key, id, row);
    await load();
    if (props.section.kind === 'list') {
      editing.value = null;
      draft.value = null;
    }
  }, id === NEW ? 'Added.' : 'Saved.');
}

async function saveBulk(): Promise<void> {
  const edits = bulk.value!;
  await run(async () => {
    await workflowAdminApi.saveAll(props.slug, props.section.key, edits.map((r) => ({ id: r.id, row: r.row })));
    bulk.value = null;
    await load();
  }, `${props.section.bulk!.label} saved.`);
}

async function remove(row: WorkflowAdminRow): Promise<void> {
  if (!window.confirm(`Remove ${String(row[props.section.titleField])}?`)) return;
  await run(async () => {
    await workflowAdminApi.remove(props.slug, props.section.key, idOf(row));
    editing.value = null;
    draft.value = null;
    await load();
  }, 'Removed.');
}

watch(() => [props.slug, props.section.key], () => void load());
onMounted(load);
</script>

<style src="../kit/workflow-form.css" scoped></style>
<style scoped>
.admin-section { display: flex; flex-direction: column; gap: 12px; }
.hint { color: var(--ion-color-medium); margin: 0; }
.problem { color: var(--ion-color-danger); margin: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.actions { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
.toolbar { display: flex; gap: 8px; }
.editor { padding: 12px; border: 1px solid var(--ion-color-light-shade); }
.editor h4 { grid-column: 1 / -1; margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; }
.row { border-top: 1px solid var(--ion-color-light-shade); }
.row-head { all: unset; cursor: pointer; display: flex; gap: 16px; flex-wrap: wrap; align-items: baseline; padding: 10px 0; width: 100%; }
.meta { color: var(--ion-color-medium); font-size: 12px; }
.bulk table { border-collapse: collapse; font-size: 13px; }
.bulk th, .bulk td { text-align: left; padding: 4px 12px 4px 0; vertical-align: middle; }
.bulk td :deep(.field) { gap: 0; }
.bulk td :deep(input[type='number']) { width: 90px; }
.totals td { font-weight: 600; border-top: 1px solid var(--ion-color-medium-tint); }
</style>
