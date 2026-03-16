<template>
  <div
    class="universe-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', universe.id)"
  >
    <div class="card-header">
      <div class="universe-info">
        <span class="universe-name">{{ universe.name }}</span>
        <span class="domain-badge" :class="universe.domain">
          {{ universe.domain }}
        </span>
      </div>
      <div class="actions">
        <button class="action-btn" title="Edit" @click.stop="$emit('edit', universe)">
          &#9998;
        </button>
        <button class="action-btn delete" title="Delete" @click.stop="$emit('delete', universe.id)">
          &#10005;
        </button>
      </div>
    </div>

    <p v-if="universe.description" class="description">
      {{ universe.description }}
    </p>

    <div class="card-stats">
      <div class="stat">
        <span class="stat-value">{{ targetCount }}</span>
        <span class="stat-label">Targets</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ predictionCount }}</span>
        <span class="stat-label">Predictions</span>
      </div>
      <div v-if="strategy" class="stat">
        <span class="stat-value strategy">{{ strategy.name }}</span>
        <span class="stat-label">Strategy</span>
      </div>
    </div>

    <div v-if="hasLlmConfig" class="llm-config">
      <span class="config-label">LLM Tiers:</span>
      <div class="tier-indicators">
        <span v-if="universe.llmConfig?.tiers?.gold" class="tier gold" title="Gold tier configured">
          G
        </span>
        <span v-if="universe.llmConfig?.tiers?.silver" class="tier silver" title="Silver tier configured">
          S
        </span>
        <span v-if="universe.llmConfig?.tiers?.bronze" class="tier bronze" title="Bronze tier configured">
          B
        </span>
      </div>
    </div>

    <div class="card-footer">
      <span class="created">Created {{ formatDate(universe.createdAt) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PredictionUniverse, PredictionStrategy } from '@/services/predictionDashboardService';

interface Props {
  universe: PredictionUniverse;
  isSelected?: boolean;
  targetCount?: number;
  predictionCount?: number;
  strategy?: PredictionStrategy;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  targetCount: 0,
  predictionCount: 0,
  strategy: undefined,
});

defineEmits<{
  select: [id: string];
  edit: [universe: PredictionUniverse];
  delete: [id: string];
}>();

const hasLlmConfig = computed(() => {
  const tiers = props.universe.llmConfig?.tiers;
  return tiers && (tiers.gold || tiers.silver || tiers.bronze);
});

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
</script>

<style scoped>
.universe-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.universe-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.universe-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.universe-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.universe-name {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.domain-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.domain-badge.stocks {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.domain-badge.crypto {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.domain-badge.elections {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.domain-badge.polymarket {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.actions {
  display: flex;
  gap: 0.25rem;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--action-bg, #f3f4f6);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--action-hover, #e5e7eb);
  color: var(--text-primary, #111827);
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.description {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.stat-value.strategy {
  font-size: 0.875rem;
  color: var(--ion-color-secondary, #15803d);
}

.stat-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.llm-config {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.config-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.tier-indicators {
  display: flex;
  gap: 0.25rem;
}

.tier {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: bold;
  color: white;
}

.tier.gold {
  background: linear-gradient(135deg, #ffd700, #b8860b);
}

.tier.silver {
  background: linear-gradient(135deg, #c0c0c0, #808080);
}

.tier.bronze {
  background: linear-gradient(135deg, #cd7f32, #8b4513);
}

.card-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.created {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .universe-card,
html[data-theme="dark"] .universe-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --action-bg: #374151;
  --action-hover: #4b5563;
}
</style>
