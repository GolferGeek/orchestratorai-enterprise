<template>
  <div class="predictor-list">
    <h3 class="section-title">
      Predictors
      <span class="count">({{ predictors.length }})</span>
    </h3>
    <div v-if="predictors.length === 0" class="empty-message">
      No predictors contributed to this prediction.
    </div>
    <div v-else class="predictors">
      <div
        v-for="predictor in predictors"
        :key="predictor.id"
        class="predictor-item"
        :class="predictor.direction || 'neutral'"
      >
        <div class="predictor-header">
          <span class="direction-badge" :class="predictor.direction || 'neutral'">
            {{ (predictor.direction || 'unknown').toUpperCase() }}
          </span>
          <span class="strength">
            Strength: {{ predictor.strength ?? 0 }}/10
          </span>
        </div>
        <p class="reasoning">{{ predictor.reasoning || 'No reasoning provided' }}</p>
        <div class="predictor-footer">
          <span class="signal-ref">ID: {{ formatId(predictor.signalId || predictor.id) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Predictor {
  id: string;
  direction?: string;
  strength?: number;
  reasoning?: string;
  signalId?: string;
}

interface Props {
  predictors: Predictor[];
}

defineProps<Props>();

/**
 * Format an ID for display - show first 8 characters with ellipsis
 */
const formatId = (id: string | undefined): string => {
  if (!id) return 'N/A';
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
};
</script>

<style scoped>
.predictor-list {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #111827);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.count {
  font-weight: 400;
  color: var(--text-secondary, #6b7280);
}

.empty-message {
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

.predictors {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.predictor-item {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.75rem;
  border-left-width: 4px;
}

.predictor-item.bullish,
.predictor-item.up {
  border-left-color: #22c55e;
}

.predictor-item.bearish,
.predictor-item.down {
  border-left-color: #ef4444;
}

.predictor-item.neutral,
.predictor-item.flat {
  border-left-color: #6b7280;
}

.predictor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.direction-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.direction-badge.bullish,
.direction-badge.up {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-badge.bearish,
.direction-badge.down {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-badge.neutral,
.direction-badge.flat {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.strength {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.reasoning {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.5;
}

.predictor-footer {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .predictor-list,
html[data-theme="dark"] .predictor-list {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
}
</style>
