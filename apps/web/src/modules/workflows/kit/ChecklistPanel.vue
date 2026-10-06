<template>
  <section class="checklist-panel">
    <header class="checklist-header">
      <h3>Checklist</h3>
      <p class="hint">{{ done }} of {{ items.length }} done. The run goes on when every line is ticked.</p>
    </header>

    <ul class="lines">
      <li v-for="item in items" :key="item.itemId" :class="['line', { 'line--done': tickOf(item.itemId) }]">
        <label class="tick">
          <input
            type="checkbox"
            :name="`tick-${item.itemId}`"
            :checked="!!tickOf(item.itemId)"
            :disabled="busy"
            @change="emit('tick', item.itemId, ($event.target as HTMLInputElement).checked)"
          />
          <span class="label">{{ item.label }}</span>
        </label>
        <span v-if="tickOf(item.itemId)" class="when">{{ when(tickOf(item.itemId)!.at) }}</span>
      </li>
    </ul>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ChecklistItem, ChecklistTick, HumanReviewRequest } from '@orchestrator-ai/transport-types';

const props = defineProps<{ review: HumanReviewRequest; busy: boolean }>();
const emit = defineEmits<{ tick: [itemId: string, done: boolean] }>();

const items = computed<ChecklistItem[]>(() => {
  const payload = props.review.payload as { items?: unknown } | null;
  return Array.isArray(payload?.items) ? (payload.items as ChecklistItem[]) : [];
});
const ticks = computed(() => new Map((props.review.ticks ?? []).map((t) => [t.itemId, t])));
const tickOf = (itemId: string): ChecklistTick | undefined => ticks.value.get(itemId);
const done = computed(() => items.value.filter((item) => ticks.value.has(item.itemId)).length);
const when = (at: string) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
</script>

<style scoped>
.checklist-panel { display: flex; flex-direction: column; gap: 12px; }
.checklist-header h3 { margin: 0; }
.hint { margin: 4px 0 0; color: var(--ion-color-medium); font-size: 13px; }
.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--ion-color-light-shade); }
.line--done .label { color: var(--ion-color-medium); text-decoration: line-through; }
.tick { display: inline-flex; gap: 10px; align-items: center; cursor: pointer; }
.when { font-size: 12px; color: var(--ion-color-medium); white-space: nowrap; }
</style>
