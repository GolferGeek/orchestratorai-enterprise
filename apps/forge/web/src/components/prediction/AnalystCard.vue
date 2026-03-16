<template>
  <div
    class="analyst-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', analyst.id)"
  >
    <div class="card-header">
      <div class="analyst-info">
        <span class="analyst-name">{{ analyst.name }}</span>
        <span class="scope-badge" :class="analyst.scopeLevel">
          {{ analyst.scopeLevel }}
        </span>
      </div>
      <div class="actions">
        <button class="action-btn" title="Edit" @click.stop="$emit('edit', analyst)">
          &#9998;
        </button>
        <button class="action-btn delete" title="Delete" @click.stop="$emit('delete', analyst.id)">
          &#10005;
        </button>
      </div>
    </div>

    <div class="analyst-meta">
      <div class="meta-row">
        <span class="meta-label">Slug:</span>
        <span class="meta-value">{{ analyst.slug }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Perspective:</span>
        <span class="meta-value perspective">{{ analyst.perspective }}</span>
      </div>
    </div>

    <div class="card-stats">
      <div class="stat">
        <span class="stat-value">{{ (analyst.defaultWeight ?? 1.0).toFixed(2) }}</span>
        <span class="stat-label">Weight</span>
      </div>
      <div v-if="analyst.domain" class="stat">
        <span class="stat-value domain">{{ analyst.domain }}</span>
        <span class="stat-label">Domain</span>
      </div>
      <div class="stat">
        <span class="stat-value" :class="{ active: analyst.active, inactive: !analyst.active }">
          {{ analyst.active ? 'Active' : 'Inactive' }}
        </span>
        <span class="stat-label">Status</span>
      </div>
    </div>

    <div v-if="hasTierInstructions" class="tier-instructions">
      <span class="config-label">Tier Instructions:</span>
      <div class="tier-indicators">
        <span v-if="analyst.tierInstructions?.gold" class="tier gold" title="Gold tier configured">
          G
        </span>
        <span v-if="analyst.tierInstructions?.silver" class="tier silver" title="Silver tier configured">
          S
        </span>
        <span v-if="analyst.tierInstructions?.bronze" class="tier bronze" title="Bronze tier configured">
          B
        </span>
      </div>
    </div>

    <div class="card-footer">
      <span class="created">Created {{ formatDate(analyst.createdAt) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PredictionAnalyst } from '@/services/predictionDashboardService';

interface Props {
  analyst: PredictionAnalyst;
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  edit: [analyst: PredictionAnalyst];
  delete: [id: string];
}>();

const hasTierInstructions = computed(() => {
  const tiers = props.analyst.tierInstructions;
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
.analyst-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.analyst-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.analyst-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.analyst-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.analyst-name {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.scope-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.scope-badge.runner {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.scope-badge.domain {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.scope-badge.universe {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.scope-badge.target {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
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

.analyst-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.meta-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.meta-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.meta-value {
  font-size: 0.75rem;
  color: var(--text-primary, #111827);
  font-family: monospace;
}

.meta-value.perspective {
  color: var(--text-secondary, #6b7280);
  font-style: italic;
  font-family: inherit;
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

.stat-value.domain {
  font-size: 0.875rem;
  color: var(--ion-color-secondary, #15803d);
  text-transform: capitalize;
}

.stat-value.active {
  font-size: 0.875rem;
  color: #10b981;
}

.stat-value.inactive {
  font-size: 0.875rem;
  color: #ef4444;
}

.stat-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.tier-instructions {
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

html.ion-palette-dark .analyst-card,
html[data-theme="dark"] .analyst-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --action-bg: #374151;
  --action-hover: #4b5563;
}

/* Override global .stat background from components.css landing page styles */
html.ion-palette-dark .analyst-card .stat,
html[data-theme="dark"] .analyst-card .stat {
  background: transparent;
  color: inherit;
}
</style>
