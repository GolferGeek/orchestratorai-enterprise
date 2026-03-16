<template>
  <div
    class="promotion-candidate-card"
    :class="{ selected: isSelected, ready: candidate.readyForPromotion }"
    @click="$emit('select', candidate.id)"
  >
    <div class="card-header">
      <div class="candidate-info">
        <h4 class="candidate-title">{{ candidate.title }}</h4>
        <div class="badges">
          <span class="type-badge" :class="candidate.learning_type">
            {{ formatLearningType(candidate.learning_type) }}
          </span>
          <span class="scope-badge" :class="candidate.scope_level">
            {{ candidate.scope_level }}
          </span>
          <span v-if="candidate.domain" class="domain-badge">
            {{ candidate.domain }}
          </span>
          <span v-if="candidate.readyForPromotion" class="ready-badge">
            Ready for Promotion
          </span>
        </div>
      </div>
    </div>

    <p class="description">{{ truncateDescription(candidate.description) }}</p>

    <div class="metrics-section">
      <div class="metric">
        <span class="metric-label">Applied</span>
        <span class="metric-value">{{ candidate.validationMetrics.timesApplied }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Helpful</span>
        <span class="metric-value">{{ candidate.validationMetrics.timesHelpful }}</span>
      </div>
      <div class="metric success-rate">
        <span class="metric-label">Success Rate</span>
        <span class="metric-value">{{ formatSuccessRate(candidate.validationMetrics.successRate) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <span class="created-date">Created {{ formatDate(candidate.created_at) }}</span>
      <span class="test-badge">TEST</span>
    </div>

    <div class="card-actions" @click.stop>
      <button
        class="btn btn-sm btn-secondary"
        @click="$emit('validate', candidate.id)"
        title="Validate candidate"
      >
        Validate
      </button>
      <button
        class="btn btn-sm btn-secondary"
        @click="$emit('backtest', candidate.id)"
        title="Run backtest"
      >
        Backtest
      </button>
      <button
        class="btn btn-sm btn-primary"
        @click="$emit('promote', candidate.id)"
        :disabled="!candidate.readyForPromotion"
        title="Promote to production"
      >
        Promote
      </button>
      <button
        class="btn btn-sm btn-danger"
        @click="$emit('reject', candidate.id)"
        title="Reject candidate"
      >
        Reject
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PromotionCandidate } from '@/services/learningPromotionService';

interface Props {
  candidate: PromotionCandidate;
  isSelected?: boolean;
}

withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  validate: [id: string];
  backtest: [id: string];
  promote: [id: string];
  reject: [id: string];
}>();

function formatLearningType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateDescription(desc: string, maxLength = 120): string {
  if (desc.length <= maxLength) return desc;
  return desc.substring(0, maxLength) + '...';
}

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

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
.promotion-candidate-card {
  background: var(--ion-card-background, #ffffff);
  border: 2px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.promotion-candidate-card:hover {
  border-color: var(--ion-color-primary-tint, #22c55e);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.promotion-candidate-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: rgba(21, 128, 61, 0.06);
}

.promotion-candidate-card.ready {
  border-left: 4px solid var(--ion-color-success, #10b981);
}

.card-header {
  margin-bottom: 0.75rem;
}

.candidate-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.candidate-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badges {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.type-badge,
.scope-badge,
.domain-badge,
.ready-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.type-badge.rule {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.type-badge.pattern {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.type-badge.weight_adjustment {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.type-badge.threshold {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.type-badge.avoid {
  background-color: rgba(107, 114, 128, 0.1);
  color: #4b5563;
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
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.domain-badge {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.ready-badge {
  background-color: rgba(16, 185, 129, 0.15);
  color: #059669;
  font-weight: 700;
}

.description {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #6b7280);
  margin: 0 0 0.75rem 0;
  line-height: 1.5;
}

.metrics-section {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--ion-color-light, #f3f4f6);
  border-radius: 6px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.metric-label {
  font-size: 0.625rem;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.metric-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
}

.metric.success-rate .metric-value {
  color: var(--ion-color-success, #10b981);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-border-color, #e5e7eb);
  margin-bottom: 0.75rem;
}

.created-date {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

.test-badge {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.125rem 0.5rem;
  border-radius: 3px;
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.75rem;
  transition: all 0.2s;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: var(--ion-color-secondary, #15803d);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--ion-color-secondary-shade, #166534);
}

.btn-secondary {
  background: var(--ion-color-light, #f3f4f6);
  color: var(--ion-text-color, #111827);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

.btn-danger {
  background: var(--ion-color-danger, #ef4444);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: var(--ion-color-danger-shade, #dc2626);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
