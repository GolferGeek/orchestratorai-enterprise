<template>
  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Specification section</span>
      <select v-model="section" :disabled="blocked || busy">
        <option value="" disabled>Choose the section this submittal is for...</option>
        <option v-for="s in sections" :key="s.section" :value="s.section">{{ s.section }} - {{ s.title }}</option>
      </select>
      <span v-if="loadError" class="note problem">{{ loadError }}</span>
    </label>
    <DocumentOrText label="Submittal" :disabled="blocked || busy" :example-text="exampleText" @change="(v) => (doc = v)" />
    <ion-button type="submit" :disabled="!ready">{{ busy ? 'Starting...' : 'Review the submittal' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue, WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { apiFetch } from '@/modules/workflows/services/workflows-api.service';
import { DocumentOrText } from '@/modules/workflows/kit';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null; upload: (file: File) => Promise<WorkflowDocumentRef | null> }>();
const emit = defineEmits<{ start: [input: JsonValue, documents: WorkflowDocumentRef[]] }>();

const sections = ref<Array<{ section: string; title: string }>>([]);
const loadError = ref<string | null>(null);
const section = ref('');
const doc = ref<{ file: File } | { text: string } | null>(null);
const exampleText = ref<string | null>(null);
const ready = computed(() => !props.blocked && !props.busy && !!section.value && doc.value !== null);

watch(() => props.example, (e) => {
  const x = e as { specSection?: string; submittalText?: string } | null;
  if (!x) return;
  section.value = x.specSection ?? '';
  exampleText.value = x.submittalText ?? null;
});

async function submit(): Promise<void> {
  const d = doc.value!;
  if ('text' in d) {
    emit('start', { specSection: section.value, submittalText: d.text }, []);
    return;
  }
  const ref = await props.upload(d.file);
  if (ref) emit('start', { specSection: section.value }, [ref]);
}

onMounted(async () => {
  try {
    sections.value = await apiFetch('/workflows/submittal-review/spec-sections');
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
});
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.problem { color: var(--ion-color-danger); }
</style>
