<template>
  <div class="redline-viewer">
    <!-- Flagged-only toggle -->
    <ion-item lines="none" class="filter-row">
      <ion-label>Show flagged only</ion-label>
      <ion-toggle v-model="showFlaggedOnly" slot="end" />
    </ion-item>

    <div v-if="visibleClauses.length === 0" class="empty">
      No clauses to display.
    </div>

    <ion-card
      v-for="clause in visibleClauses"
      :key="clause.clauseId"
      class="clause-card"
    >
      <ion-card-content>
        <!-- Header row: risk badge + clause id -->
        <div class="clause-header">
          <ion-badge :color="riskColor(clause.overallRisk)" class="risk-badge">
            {{ clause.overallRisk }}
          </ion-badge>
          <span class="clause-id">{{ clause.clauseId }}</span>
        </div>

        <!-- Summary -->
        <p class="clause-summary">{{ clause.summary }}</p>

        <!-- Original text (truncated with expand toggle) -->
        <div class="original-text-block">
          <div
            class="original-text"
            :class="{ truncated: !expandedText.has(clause.clauseId) }"
          >
            {{ clause.originalText }}
          </div>
          <button
            v-if="clause.originalText.length > TRUNCATE_THRESHOLD"
            class="expand-toggle"
            @click="toggleText(clause.clauseId)"
          >
            {{ expandedText.has(clause.clauseId) ? 'Show less' : 'Show more' }}
          </button>
        </div>

        <!-- Suggested redline: diff-like old → new -->
        <div v-if="clause.suggestedRedline" class="redline-diff">
          <div class="diff-label">Suggested redline</div>
          <div class="diff-old">{{ clause.originalText }}</div>
          <div class="diff-arrow">&#8595;</div>
          <div class="diff-new">{{ clause.suggestedRedline }}</div>
        </div>

        <!-- Annotations (expandable) -->
        <details
          v-if="clause.annotations.length > 0"
          class="annotations-details"
        >
          <summary class="annotations-summary">
            {{ clause.annotations.length }}
            {{ clause.annotations.length === 1 ? 'annotation' : 'annotations' }}
          </summary>
          <div
            v-for="(ann, i) in clause.annotations"
            :key="i"
            class="annotation"
          >
            <div class="annotation-header">
              <ion-badge :color="riskColor(ann.riskLevel)" class="ann-badge">
                {{ ann.riskLevel }}
              </ion-badge>
              <span class="ann-category">{{ ann.category }}</span>
            </div>
            <p class="ann-finding">{{ ann.finding }}</p>
            <p class="ann-reasoning muted">{{ ann.reasoning }}</p>
            <div v-if="ann.suggestedLanguage" class="ann-suggested">
              <span class="ann-suggested-label">Suggested:</span>
              {{ ann.suggestedLanguage }}
            </div>
          </div>
        </details>

        <!-- Decision buttons (readonly hides these) -->
        <div v-if="!readonly" class="decision-row">
          <ion-button
            size="small"
            :fill="currentDecision(clause.clauseId) === 'accept' ? 'solid' : 'outline'"
            :color="currentDecision(clause.clauseId) === 'accept' ? 'success' : 'medium'"
            @click="setDecision(clause.clauseId, 'accept')"
          >
            Accept
          </ion-button>
          <ion-button
            size="small"
            :fill="currentDecision(clause.clauseId) === 'reject' ? 'solid' : 'outline'"
            :color="currentDecision(clause.clauseId) === 'reject' ? 'danger' : 'medium'"
            @click="setDecision(clause.clauseId, 'reject')"
          >
            Reject
          </ion-button>
          <ion-button
            size="small"
            :fill="currentDecision(clause.clauseId) === 'modify' ? 'solid' : 'outline'"
            :color="currentDecision(clause.clauseId) === 'modify' ? 'warning' : 'medium'"
            @click="setDecision(clause.clauseId, 'modify')"
          >
            Modify
          </ion-button>

          <!-- Inline textarea for modify mode -->
          <div
            v-if="currentDecision(clause.clauseId) === 'modify'"
            class="modify-area"
          >
            <ion-textarea
              :value="modifyText(clause.clauseId)"
              :placeholder="clause.suggestedRedline ?? clause.originalText"
              :rows="4"
              :auto-grow="false"
              @ion-input="onModifyInput(clause.clauseId, $event)"
            />
          </div>
        </div>

        <!-- Readonly: show the recorded decision badge when present -->
        <div
          v-else-if="clauseDecisions[clause.clauseId]"
          class="readonly-decision"
        >
          <ion-badge :color="decisionColor(clauseDecisions[clause.clauseId].decision)">
            {{ clauseDecisions[clause.clauseId].decision }}
          </ion-badge>
          <span
            v-if="clauseDecisions[clause.clauseId].modifiedLanguage"
            class="muted readonly-modified"
          >
            — modified
          </span>
        </div>
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonCard,
  IonCardContent,
  IonBadge,
  IonButton,
  IonTextarea,
  IonToggle,
  IonItem,
  IonLabel,
} from '@ionic/vue';
import type { ClauseSynthesis, ClauseDecision } from '../legalJobsService';

// ────────────────────────────────────────────────────────────────────────
// Props / emits
// ────────────────────────────────────────────────────────────────────────

const props = defineProps<{
  clauses: ClauseSynthesis[];
  clauseDecisions: Record<string, ClauseDecision>;
  readonly: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:clauseDecisions', value: Record<string, ClauseDecision>): void;
}>();

// ────────────────────────────────────────────────────────────────────────
// Local state
// ────────────────────────────────────────────────────────────────────────

const TRUNCATE_THRESHOLD = 300;

const showFlaggedOnly = ref(false);
const expandedText = ref<Set<string>>(new Set());

// ────────────────────────────────────────────────────────────────────────
// Sorting and filtering
// ────────────────────────────────────────────────────────────────────────

const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  acceptable: 4,
};

const sortedClauses = computed(() =>
  [...props.clauses].sort(
    (a, b) =>
      (RISK_ORDER[a.overallRisk] ?? 5) - (RISK_ORDER[b.overallRisk] ?? 5),
  ),
);

const visibleClauses = computed(() => {
  if (!showFlaggedOnly.value) return sortedClauses.value;
  return sortedClauses.value.filter((c) => c.overallRisk !== 'acceptable');
});

// ────────────────────────────────────────────────────────────────────────
// Text expand/collapse
// ────────────────────────────────────────────────────────────────────────

function toggleText(clauseId: string): void {
  const next = new Set(expandedText.value);
  if (next.has(clauseId)) {
    next.delete(clauseId);
  } else {
    next.add(clauseId);
  }
  expandedText.value = next;
}

// ────────────────────────────────────────────────────────────────────────
// Risk / decision colour helpers
// ────────────────────────────────────────────────────────────────────────

function riskColor(
  risk: 'critical' | 'high' | 'medium' | 'low' | 'acceptable',
): string {
  switch (risk) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'tertiary';
    case 'low':
      return 'primary';
    case 'acceptable':
      return 'success';
  }
}

function decisionColor(decision: 'accept' | 'reject' | 'modify'): string {
  switch (decision) {
    case 'accept':
      return 'success';
    case 'reject':
      return 'danger';
    case 'modify':
      return 'warning';
  }
}

// ────────────────────────────────────────────────────────────────────────
// Decision management (emits v-model update)
// ────────────────────────────────────────────────────────────────────────

function currentDecision(
  clauseId: string,
): 'accept' | 'reject' | 'modify' | null {
  return props.clauseDecisions[clauseId]?.decision ?? null;
}

function modifyText(clauseId: string): string {
  return props.clauseDecisions[clauseId]?.modifiedLanguage ?? '';
}

function setDecision(
  clauseId: string,
  decision: 'accept' | 'reject' | 'modify',
): void {
  const existing = props.clauseDecisions[clauseId];
  const updated: ClauseDecision = {
    clauseId,
    decision,
    modifiedLanguage:
      decision === 'modify' ? (existing?.modifiedLanguage ?? '') : undefined,
  };
  emit('update:clauseDecisions', {
    ...props.clauseDecisions,
    [clauseId]: updated,
  });
}

function onModifyInput(clauseId: string, event: CustomEvent): void {
  const value = (event.detail as { value?: string }).value ?? '';
  const existing = props.clauseDecisions[clauseId];
  // Spread the existing decision first so the explicit fields below override
  // (the previous order silently shadowed the new clauseId/decision/modifiedLanguage).
  const updated: ClauseDecision = {
    ...(existing ?? {}),
    clauseId,
    decision: 'modify',
    modifiedLanguage: value,
  };
  emit('update:clauseDecisions', {
    ...props.clauseDecisions,
    [clauseId]: updated,
  });
}
</script>

<style scoped>
.redline-viewer {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.filter-row {
  --background: transparent;
  margin-bottom: 8px;
}

.empty {
  padding: 24px;
  color: var(--ion-color-medium);
  text-align: center;
}

.clause-card {
  margin: 0 0 12px 0;
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  box-shadow: none;
}

.clause-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.risk-badge {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.clause-id {
  font-size: 12px;
  color: var(--ion-color-medium);
  font-family: var(--ion-font-family, monospace);
}

.clause-summary {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: var(--ion-text-color);
  line-height: 1.5;
}

.original-text-block {
  margin-bottom: 10px;
}

.original-text {
  font-size: 13px;
  color: var(--ion-text-color);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--ion-color-step-50);
  padding: 8px 10px;
  border-radius: 5px;
  border: 1px solid var(--ion-color-step-150);
}

.original-text.truncated {
  max-height: 80px;
  overflow: hidden;
}

.expand-toggle {
  margin-top: 4px;
  background: none;
  border: none;
  color: var(--ion-color-primary);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.redline-diff {
  margin-bottom: 10px;
  padding: 10px;
  background: color-mix(in srgb, var(--ion-color-warning, #ffc409) 8%, var(--ion-background-color));
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  font-size: 13px;
}

.diff-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ion-color-medium);
  margin-bottom: 6px;
}

.diff-old {
  text-decoration: line-through;
  color: var(--ion-color-danger);
  background: color-mix(in srgb, var(--ion-color-danger, #eb445a) 8%, transparent);
  padding: 4px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-arrow {
  text-align: center;
  color: var(--ion-color-medium);
  font-size: 16px;
  padding: 2px 0;
}

.diff-new {
  color: var(--ion-color-success);
  background: color-mix(in srgb, var(--ion-color-success, #2dd36f) 10%, transparent);
  padding: 4px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.annotations-details {
  margin-bottom: 10px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
  overflow: hidden;
}

.annotations-summary {
  cursor: pointer;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--ion-color-medium);
  background: var(--ion-color-step-50);
  user-select: none;
  list-style: none;
}

.annotations-summary::-webkit-details-marker {
  display: none;
}

.annotations-details[open] .annotations-summary {
  color: var(--ion-text-color);
  border-bottom: 1px solid var(--ion-color-step-150);
}

.annotation {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ion-color-step-100);
}

.annotation:last-child {
  border-bottom: none;
}

.annotation-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.ann-badge {
  font-size: 10px;
  text-transform: uppercase;
}

.ann-category {
  font-size: 12px;
  font-weight: 600;
  color: var(--ion-text-color);
}

.ann-finding {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--ion-text-color);
  line-height: 1.4;
}

.ann-reasoning {
  margin: 0 0 4px 0;
  font-size: 12px;
  line-height: 1.4;
}

.ann-suggested {
  font-size: 12px;
  color: var(--ion-color-success);
  margin-top: 4px;
}

.ann-suggested-label {
  font-weight: 600;
  margin-right: 4px;
}

.decision-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
  margin-top: 10px;
}

.modify-area {
  width: 100%;
  margin-top: 6px;
}

.readonly-decision {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.readonly-modified {
  font-size: 12px;
}

.muted {
  color: var(--ion-color-medium);
}
</style>
