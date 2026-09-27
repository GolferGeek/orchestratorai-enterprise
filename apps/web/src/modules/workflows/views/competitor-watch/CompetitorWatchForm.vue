<template>
  <form class="form" @submit.prevent="emit('start', { compareWith })">
    <section class="sources">
      <h3>Pages we follow</h3>
      <p v-if="error" class="problem">{{ error }}</p>
      <ul>
        <li v-for="s in sources" :key="s.id">
          <strong>{{ s.competitor }}</strong> · {{ s.page }} <span class="url">{{ s.url }}</span>
          <button type="button" class="link" :disabled="saving" @click="remove(s.id)">Remove</button>
        </li>
        <li v-if="!sources.length && !loading" class="note">No pages yet - add one below.</li>
      </ul>
      <div class="row add">
        <input v-model="draft.competitor" placeholder="Competitor" :disabled="saving" />
        <input v-model="draft.page" placeholder="Page (Pricing, Home...)" :disabled="saving" />
        <input v-model="draft.url" placeholder="https://..." :disabled="saving" />
        <ion-button size="small" fill="outline" :disabled="saving || !draftValid" @click="add">Add page</ion-button>
      </div>
    </section>
    <div class="field">
      <span>Compare with</span>
      <div class="choices">
        <label><input v-model="compareWith" type="radio" value="archive-90-days" /> The last 90 days (Internet Archive copy)</label>
        <label><input v-model="compareWith" type="radio" value="last-run" /> Since the last run</label>
      </div>
    </div>
    <ion-button type="submit" :disabled="blocked || busy || sources.length === 0">{{ busy ? 'Starting...' : 'Check the pages' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { competitorSourcesApi, type CompetitorSource } from './competitorSourcesApi';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();

const compareWith = ref<'archive-90-days' | 'last-run'>('archive-90-days');
const sources = ref<CompetitorSource[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const draft = reactive({ competitor: '', page: '', url: '' });
const draftValid = computed(() => draft.competitor.trim() && draft.page.trim() && /^https:\/\/\S+$/.test(draft.url.trim()));

watch(() => props.example, (e) => {
  const c = (e as { compareWith?: string } | null)?.compareWith;
  if (c === 'last-run' || c === 'archive-90-days') compareWith.value = c;
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    sources.value = await competitorSourcesApi.list();
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function add(): Promise<void> {
  saving.value = true;
  try {
    await competitorSourcesApi.add({ competitor: draft.competitor.trim(), page: draft.page.trim(), url: draft.url.trim() });
    Object.assign(draft, { competitor: '', page: '', url: '' });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function remove(id: string): Promise<void> {
  saving.value = true;
  try {
    await competitorSourcesApi.remove(id);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.sources h3 { margin: 0 0 6px; font-size: 14px; }
.sources ul { list-style: none; margin: 0 0 8px; padding: 0; font-size: 13px; }
.sources li { padding: 4px 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.url { color: var(--ion-color-medium); font-size: 12px; }
.add input { flex: 1; min-width: 140px; padding: 6px; border: 1px solid var(--ion-color-medium-tint); background: var(--ion-background-color); color: var(--ion-text-color); font: inherit; }
.link { background: none; border: none; padding: 0; color: var(--ion-color-danger); font: inherit; font-size: 12px; cursor: pointer; }
.note { color: var(--ion-color-medium); }
.problem { color: var(--ion-color-danger); }
</style>
