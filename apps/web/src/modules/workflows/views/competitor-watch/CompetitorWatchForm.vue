<template>
  <form class="form" @submit.prevent="emit('start', { compareWith })">
    <section class="sources">
      <h3>Pages we follow</h3>
      <p v-if="error" class="problem">{{ error }}</p>
      <ul>
        <li v-for="s in sources" :key="s.id" :class="{ off: !s.enabled }">
          <strong>{{ s.competitor }}</strong> · {{ s.page }} <span class="url">{{ s.url }}</span>
          <span v-if="!s.enabled" class="note">(not checked)</span>
        </li>
        <li v-if="!sources.length && !loading" class="note">No pages yet.</li>
      </ul>
      <p class="note">
        Pages are managed in the workflow's admin<template v-if="canConfigure">:
          <router-link to="/app/workflows/competitor-watch/admin">add or change pages</router-link></template>.
      </p>
    </section>
    <div class="field">
      <span>Compare with</span>
      <div class="choices">
        <label><input v-model="compareWith" type="radio" value="archive-90-days" /> The last 90 days (Internet Archive copy)</label>
        <label><input v-model="compareWith" type="radio" value="last-run" /> Since the last run</label>
      </div>
    </div>
    <ion-button type="submit" :disabled="blocked || busy || !followed">{{ busy ? 'Starting...' : 'Check the pages' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { useRbacStore } from '@/stores/rbacStore';
import { competitorSourcesApi, type CompetitorSource } from './competitorSourcesApi';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();

const compareWith = ref<'archive-90-days' | 'last-run'>('archive-90-days');
const sources = ref<CompetitorSource[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const rbacStore = useRbacStore();
const canConfigure = computed(() => rbacStore.hasPermission('admin:settings'));
/** How many pages a run would check. */
const followed = computed(() => sources.value.filter((s) => s.enabled).length);

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

onMounted(load);
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.sources h3 { margin: 0 0 6px; font-size: 14px; }
.sources ul { list-style: none; margin: 0 0 8px; padding: 0; font-size: 13px; }
.sources li.off { opacity: 0.6; }
.sources li { padding: 4px 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.url { color: var(--ion-color-medium); font-size: 12px; }
.note { color: var(--ion-color-medium); }
.problem { color: var(--ion-color-danger); }
</style>
