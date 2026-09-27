<template>
  <form class="form" @submit.prevent="submit">
    <div class="field">
      <span>Departments</span>
      <div class="choices">
        <label v-for="d in DEPARTMENTS" :key="d.slug">
          <input v-model="picked" type="checkbox" :value="d.slug" :disabled="blocked || busy" /> {{ d.name }}
        </label>
      </div>
    </div>
    <label class="field">
      <span>Week ending (optional)</span>
      <input v-model="weekEnding" type="date" :disabled="blocked || busy" />
      <span class="note">Leave empty for the week ending today.</span>
    </label>
    <ion-button type="submit" :disabled="blocked || busy || picked.length === 0">
      {{ busy ? 'Starting...' : 'Write the digest' }}
    </ion-button>
  </form>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';

const DEPARTMENTS = [
  { slug: 'corporate', name: 'Corporate' },
  { slug: 'finance', name: 'Finance' },
  { slug: 'human-resources', name: 'Human Resources' },
  { slug: 'marketing', name: 'Marketing' },
  { slug: 'engineering', name: 'Engineering' },
  { slug: 'building', name: 'Building' },
];

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();

const picked = ref<string[]>(DEPARTMENTS.map((d) => d.slug));
const weekEnding = ref('');

watch(
  () => props.example,
  (example) => {
    const e = example as { organizations?: string[]; weekEnding?: string } | null;
    if (!e) return;
    picked.value = [...(e.organizations ?? [])];
    weekEnding.value = e.weekEnding ?? '';
  },
);

function submit(): void {
  emit('start', { organizations: picked.value, ...(weekEnding.value ? { weekEnding: weekEnding.value } : {}) });
}
</script>

<style src="../../kit/workflow-form.css" scoped></style>
