<template>
  <section class="review-panel">
    <header class="review-header">
      <h3>Your review</h3>
      <p class="hint">
        {{ review.allowItemDecisions ? 'Approve all, or decide item by item.' : 'Approve or decline.' }}
      </p>
    </header>

    <ol class="items">
      <li v-for="item in items" :key="item.itemId" class="item">
        <div class="item-body">
          <slot name="item" :item="item" />
        </div>
        <div v-if="review.allowItemDecisions" class="item-decision">
          <label v-for="choice in ITEM_CHOICES" :key="choice.value" class="choice">
            <input
              type="radio"
              :name="`decision-${item.itemId}`"
              :value="choice.value"
              :checked="decisionOf(item.itemId) === choice.value"
              :disabled="busy"
              @change="setDecision(item.itemId, choice.value)"
            />
            {{ choice.label }}
          </label>
          <textarea
            v-if="decisionOf(item.itemId) === 'modify'"
            v-model="replacements[item.itemId]"
            class="replacement"
            rows="3"
            placeholder="Your version"
            :disabled="busy"
          />
        </div>
      </li>
    </ol>

    <textarea
      v-model="feedback"
      class="feedback"
      rows="2"
      :placeholder="allowsReject ? 'Feedback (required to reject)' : 'Feedback (optional)'"
      :disabled="busy"
    />
    <p v-if="problem" class="problem">{{ problem }}</p>

    <div class="actions">
      <ion-button v-if="allows('approve')" :disabled="busy || hasItemChanges" @click="approve">
        Approve all
      </ion-button>
      <ion-button
        v-if="review.allowItemDecisions && allows('modify')"
        fill="outline"
        :disabled="busy || !hasItemChanges"
        @click="submitItems"
      >
        Submit item decisions
      </ion-button>
      <ion-button v-if="allowsReject" color="danger" fill="outline" :disabled="busy" @click="reject">
        Reject
      </ion-button>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { IonButton } from '@ionic/vue';
import type { HumanReviewDecision, HumanReviewRequest, ItemDecision } from '@orchestrator-ai/transport-types';

/** An item of a review payload; the workflow's slot renders the rest. */
export interface ReviewItem {
  itemId: string;
  [key: string]: unknown;
}

type ItemChoice = 'accept' | 'reject' | 'modify';
const ITEM_CHOICES: Array<{ value: ItemChoice; label: string }> = [
  { value: 'accept', label: 'Accept' },
  { value: 'reject', label: 'Drop' },
  { value: 'modify', label: 'Rewrite' },
];

const props = defineProps<{ review: HumanReviewRequest; busy: boolean }>();
const emit = defineEmits<{ decide: [decision: HumanReviewDecision] }>();

const items = computed<ReviewItem[]>(() => {
  const payload = props.review.payload as { items?: unknown } | null;
  return Array.isArray(payload?.items) ? (payload.items as ReviewItem[]) : [];
});
const decisions = reactive<Record<string, ItemChoice>>({});
const replacements = reactive<Record<string, string>>({});
const feedback = ref('');
const problem = ref<string | null>(null);

const allows = (type: HumanReviewDecision['type']) => props.review.allowedDecisions.includes(type);
const allowsReject = computed(() => allows('reject'));
const decisionOf = (itemId: string): ItemChoice => decisions[itemId] ?? 'accept';
const hasItemChanges = computed(() => Object.values(decisions).some((d) => d !== 'accept'));

function setDecision(itemId: string, choice: ItemChoice): void {
  decisions[itemId] = choice;
}

function withFeedback<T extends object>(decision: T): T & { feedback?: string } {
  const text = feedback.value.trim();
  return text ? { ...decision, feedback: text } : decision;
}

function approve(): void {
  problem.value = null;
  emit('decide', withFeedback({ type: 'approve' as const }));
}

function reject(): void {
  const text = feedback.value.trim();
  if (!text) {
    problem.value = 'Say why you are rejecting it.';
    return;
  }
  problem.value = null;
  emit('decide', { type: 'reject', feedback: text });
}

function submitItems(): void {
  const chosen: ItemDecision[] = [];
  for (const item of items.value) {
    const choice = decisionOf(item.itemId);
    if (choice === 'modify') {
      const text = (replacements[item.itemId] ?? '').trim();
      if (!text) {
        problem.value = 'Write your version of each item you rewrite.';
        return;
      }
      chosen.push({ itemId: item.itemId, decision: 'modify', replacement: text });
    } else if (choice === 'reject') {
      chosen.push({ itemId: item.itemId, decision: 'reject' });
    }
  }
  problem.value = null;
  emit('decide', withFeedback({ type: 'modify' as const, items: chosen }));
}
</script>

<style scoped>
.review-panel { display: flex; flex-direction: column; gap: 12px; }
.review-header h3 { margin: 0; }
.hint { margin: 4px 0 0; color: var(--ion-color-medium); font-size: 13px; }
.items { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; }
.item { padding: 10px 12px; border: 1px solid var(--ion-color-light-shade); }
.item-decision { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 8px; font-size: 13px; }
.choice { display: inline-flex; gap: 4px; align-items: center; }
.replacement, .feedback {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--ion-color-medium-tint);
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  font: inherit;
}
.problem { color: var(--ion-color-danger); margin: 0; font-size: 13px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
