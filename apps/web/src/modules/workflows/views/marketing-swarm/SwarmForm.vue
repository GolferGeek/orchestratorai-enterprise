<template>
  <form class="form" @submit.prevent="submit">
    <p v-if="problem" class="problem">{{ problem }}</p>
    <div class="row">
      <label class="field">
        <span>Content type</span>
        <select v-model="contentType" :disabled="disabled">
          <option value="" disabled>Choose</option>
          <option v-for="t in options?.contentTypes ?? []" :key="t.slug" :value="t.slug">{{ t.name }} ({{ t.minWords }}-{{ t.maxWords }} words)</option>
        </select>
      </label>
      <label class="field">
        <span>Rewrites allowed</span>
        <select v-model.number="maxEditCycles" :disabled="disabled">
          <option v-for="n in [0, 1, 2, 3]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
    </div>
    <label class="field"><span>Topic</span><input v-model="brief.topic" maxlength="300" placeholder="What the piece is about" :disabled="disabled" /></label>
    <div class="row">
      <label class="field"><span>Audience</span><input v-model="brief.audience" maxlength="300" :disabled="disabled" /></label>
      <label class="field"><span>Goal</span><input v-model="brief.goal" maxlength="300" placeholder="What the reader should do" :disabled="disabled" /></label>
    </div>
    <label class="field"><span>Brand voice</span><input v-model="brief.brandVoice" maxlength="300" placeholder="e.g. warm, direct, no hype" :disabled="disabled" /></label>
    <div class="row">
      <label class="field">
        <span>Must cover <span class="note">(one per line)</span></span>
        <textarea v-model="keyPoints" rows="3" :disabled="disabled" />
      </label>
      <label class="field">
        <span>Keywords <span class="note">(comma separated)</span></span>
        <input v-model="keywords" :disabled="disabled" />
        <span class="note">Constraints (optional)</span>
        <input v-model="brief.constraints" maxlength="1000" placeholder="e.g. no statistics" :disabled="disabled" />
      </label>
    </div>
    <label class="field">
      <span>Evidence on file <span class="note">(optional: studies, benchmarks, customer data the copy may cite; without it every factual claim counts as unsupported)</span></span>
      <textarea v-model="evidence" rows="3" maxlength="4000" :disabled="disabled" />
    </label>

    <fieldset v-for="group in GROUPS" :key="group.key" class="field">
      <legend>{{ group.label }}</legend>
      <div class="choices">
        <label v-for="o in options?.[group.key] ?? []" :key="o.slug" :title="o.description ?? ''">
          <input v-model="picked[group.key]" type="checkbox" :value="o.slug" :disabled="disabled" />
          {{ o.name }}<span v-if="modelOf(o)" class="note"> · {{ modelOf(o) }}</span>
        </label>
      </div>
    </fieldset>

    <ion-button type="submit" :disabled="disabled || !complete">{{ busy ? 'Starting...' : 'Run the swarm' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { swarmApi, type SwarmOptions } from './swarmApi';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();

const GROUPS = [
  { key: 'writers', label: 'Writers' },
  { key: 'editors', label: 'Editors' },
  { key: 'evaluators', label: 'Evaluators' },
] as const;

const options = ref<SwarmOptions | null>(null);
const problem = ref<string | null>(null);
const contentType = ref('');
const maxEditCycles = ref(1);
const brief = reactive({ topic: '', audience: '', goal: '', brandVoice: '', constraints: '' });
const keyPoints = ref('');
const keywords = ref('');
const evidence = ref('');
const picked = reactive<Record<'writers' | 'editors' | 'evaluators', string[]>>({ writers: [], editors: [], evaluators: [] });

const disabled = computed(() => props.blocked || props.busy);
const complete = computed(
  () => !!contentType.value && [brief.topic, brief.audience, brief.goal, brief.brandVoice].every((v) => v.trim()) && picked.writers.length > 0 && picked.editors.length > 0 && picked.evaluators.length > 0,
);
/** A writer's model, shown next to it (editors and evaluators have none). */
const modelOf = (o: object): string | null => ('model' in o && typeof o.model === 'string' ? o.model : null);
const lines = (text: string, split: RegExp) => text.split(split).map((x) => x.trim()).filter(Boolean);

function submit(): void {
  if (disabled.value || !complete.value) return;
  emit('start', {
    contentType: contentType.value,
    brief: {
      topic: brief.topic.trim(),
      audience: brief.audience.trim(),
      goal: brief.goal.trim(),
      brandVoice: brief.brandVoice.trim(),
      keyPoints: lines(keyPoints.value, /\n/),
      keywords: lines(keywords.value, /,/),
      ...(brief.constraints.trim() ? { constraints: brief.constraints.trim() } : {}),
    },
    evidence: evidence.value.trim() || null,
    writers: [...picked.writers],
    editors: [...picked.editors],
    evaluators: [...picked.evaluators],
    maxEditCycles: maxEditCycles.value,
  });
}

async function load(): Promise<void> {
  if (props.blocked) return;
  try {
    options.value = await swarmApi.options();
    problem.value = null;
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error);
  }
}

watch(() => props.example, (e) => {
  const x = e as {
    contentType?: string;
    brief?: { topic?: string; audience?: string; goal?: string; brandVoice?: string; constraints?: string; keyPoints?: string[]; keywords?: string[] };
    evidence?: string | null;
    writers?: string[];
    editors?: string[];
    evaluators?: string[];
    maxEditCycles?: number;
  } | null;
  if (!x) return;
  contentType.value = x.contentType ?? '';
  Object.assign(brief, { topic: x.brief?.topic ?? '', audience: x.brief?.audience ?? '', goal: x.brief?.goal ?? '', brandVoice: x.brief?.brandVoice ?? '', constraints: x.brief?.constraints ?? '' });
  keyPoints.value = (x.brief?.keyPoints ?? []).join('\n');
  keywords.value = (x.brief?.keywords ?? []).join(', ');
  evidence.value = x.evidence ?? '';
  picked.writers = [...(x.writers ?? [])];
  picked.editors = [...(x.editors ?? [])];
  picked.evaluators = [...(x.evaluators ?? [])];
  maxEditCycles.value = x.maxEditCycles ?? 1;
});
watch(() => props.blocked, () => void load());
onMounted(load);
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.problem { color: var(--ion-color-danger); margin: 0; }
fieldset { border: none; padding: 0; margin: 0; }
legend { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
</style>
