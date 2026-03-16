<template>
  <div
    class="learning-queue-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', queueItem.id)"
  >
    <div class="card-header">
      <div class="queue-info">
        <span class="queue-title">{{ queueItem.suggestedTitle }}</span>
        <div class="badges">
          <span class="learning-type-badge" :class="queueItem.suggestedLearningType">
            {{ formatLearningType(queueItem.suggestedLearningType) }}
          </span>
          <span class="scope-badge" :class="queueItem.suggestedScopeLevel">
            {{ queueItem.suggestedScopeLevel }}
          </span>
        </div>
      </div>
      <div class="status-actions">
        <span class="status-badge" :class="queueItem.status">
          {{ queueItem.status }}
        </span>
        <button
          v-if="queueItem.status === 'pending'"
          class="action-btn"
          title="Review"
          @click.stop="$emit('review', queueItem)"
        >
          &#9998;
        </button>
      </div>
    </div>

    <p class="content-preview">
      {{ queueItem.suggestedContent }}
    </p>

    <div class="confidence-bar">
      <div class="confidence-label">
        <span>Confidence</span>
        <span class="confidence-value">{{ Math.round(queueItem.confidence * 100) }}%</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${queueItem.confidence * 100}%` }"
          :class="getConfidenceClass(queueItem.confidence)"
        ></div>
      </div>
    </div>

    <p v-if="queueItem.reasoning" class="reasoning-preview">
      <span class="reasoning-label">Reasoning:</span>
      {{ queueItem.reasoning }}
    </p>

    <div class="card-stats">
      <div v-if="sourceInfo" class="stat">
        <span class="stat-label">Source</span>
        <span class="stat-value">{{ sourceInfo }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Created</span>
        <span class="stat-value">{{ formatDate(queueItem.createdAt) }}</span>
      </div>
      <div v-if="queueItem.reviewedAt" class="stat">
        <span class="stat-label">Reviewed</span>
        <span class="stat-value">{{ formatDate(queueItem.reviewedAt) }}</span>
      </div>
    </div>

    <div v-if="queueItem.reviewNotes" class="review-notes">
      <span class="notes-label">Review Notes:</span>
      <span class="notes-text">{{ queueItem.reviewNotes }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LearningQueueItem } from '@/services/predictionDashboardService';

interface Props {
  queueItem: LearningQueueItem;
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  review: [queueItem: LearningQueueItem];
}>();

const sourceInfo = computed(() => {
  if (props.queueItem.sourceEvaluationId) {
    return 'Evaluation';
  } else if (props.queueItem.sourceMissedOpportunityId) {
    return 'Missed Opportunity';
  }
  return null;
});

function formatLearningType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
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
.learning-queue-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.learning-queue-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.learning-queue-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.queue-info {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}

.queue-title {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.badges {
  display: flex;
  gap: 0.375rem;
}

.learning-type-badge,
.scope-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.learning-type-badge.rule {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.learning-type-badge.pattern {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.learning-type-badge.weight_adjustment {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.learning-type-badge.threshold {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.learning-type-badge.avoid {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.scope-badge.runner {
  background-color: rgba(107, 114, 128, 0.1);
  color: #4b5563;
}

.scope-badge.domain {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.scope-badge.universe {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.scope-badge.target {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status-badge.pending {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-badge.approved {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.status-badge.rejected {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.status-badge.modified {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
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

.content-preview {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.confidence-bar {
  margin-bottom: 0.75rem;
}

.confidence-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 0.25rem;
}

.confidence-value {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.progress-track {
  height: 6px;
  background: var(--progress-bg, #e5e7eb);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-fill.high {
  background: linear-gradient(90deg, #10b981, #059669);
}

.progress-fill.medium {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.progress-fill.low {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.reasoning-preview {
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.reasoning-label {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.card-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stat-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.stat-value {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.review-notes {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--notes-bg, #f9fafb);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.notes-label {
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.notes-text {
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
}

html.ion-palette-dark .learning-queue-card,
html[data-theme="dark"] .learning-queue-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --action-bg: #374151;
  --action-hover: #4b5563;
  --progress-bg: #374151;
  --notes-bg: #374151;
}
</style>
