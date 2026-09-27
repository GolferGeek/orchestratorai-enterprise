<template>
  <form class="form" @submit.prevent="emit('start', { title: title.trim(), incident: incident.trim() })">
    <label class="field">
      <span>Title</span>
      <input v-model="title" maxlength="200" placeholder="e.g. Checkout outage after orders migration" :disabled="blocked || busy" />
    </label>
    <label class="field">
      <span>Timeline and notes</span>
      <textarea v-model="incident" rows="14" placeholder="Times, what was seen, what was done, what fixed it, who was affected and how many" :disabled="blocked || busy" />
    </label>
    <ion-button type="submit" :disabled="blocked || busy || !title.trim() || incident.trim().length < 40">
      {{ busy ? 'Starting...' : 'Write the postmortem' }}
    </ion-button>
  </form>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue } from '@orchestrator-ai/transport-types';

const props = defineProps<{ busy: boolean; blocked: boolean; example: JsonValue | null }>();
const emit = defineEmits<{ start: [input: JsonValue] }>();
const title = ref('');
const incident = ref('');

watch(() => props.example, (e) => {
  const x = e as { title?: string; incident?: string } | null;
  if (!x) return;
  title.value = x.title ?? '';
  incident.value = x.incident ?? '';
});
</script>

<style src="../../kit/workflow-form.css" scoped></style>
