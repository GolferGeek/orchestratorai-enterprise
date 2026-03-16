<template>
  <div
    class="review-queue-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', item.id)"
  >
    <div class="card-header">
      <div class="target-info">
        <span class="target-name">{{ item.targetName }}</span>
        <span class="target-symbol">{{ item.targetSymbol }}</span>
      </div>
      <span class="status-badge" :class="item.status">
        {{ item.status }}
      </span>
    </div>

    <div class="signal-preview">
      <p class="signal-content">{{ truncateContent(item.signalContent) }}</p>
    </div>

    <div class="source-row">
      <span class="source-label">Source:</span>
      <span class="source-value">{{ item.sourceName }}</span>
      <span class="source-type">({{ item.sourceType }})</span>
    </div>

    <div class="ai-disposition-section">
      <div class="disposition-row">
        <span
          class="disposition-badge"
          :class="item.aiDisposition"
        >
          {{ item.aiDisposition }}
        </span>
        <div class="strength-container">
          <span class="strength-label">Strength:</span>
          <div class="strength-bar">
            <div
              class="strength-fill"
              :class="item.aiDisposition"
              :style="{ width: item.aiStrength + '%' }"
            ></div>
          </div>
          <span class="strength-value">{{ item.aiStrength }}%</span>
        </div>
      </div>
      <div class="confidence-row">
        <span class="confidence-label">AI Confidence:</span>
        <span class="confidence-value">{{ item.aiConfidence }}%</span>
      </div>
    </div>

    <div class="card-footer">
      <span class="received">{{ formatDate(item.receivedAt) }}</span>
      <button
        v-if="item.status === 'pending'"
        class="review-btn"
        @click.stop="$emit('review', item)"
      >
        Review
      </button>
      <span v-else class="reviewed-info">
        Reviewed {{ formatDate(item.reviewedAt || item.receivedAt) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReviewQueueItem } from '@/stores/reviewQueueStore';

interface Props {
  item: ReviewQueueItem;
  isSelected?: boolean;
}

withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  review: [item: ReviewQueueItem];
}>();

function truncateContent(content: string, maxLength = 150): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}
</script>

<style scoped>
.review-queue-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.review-queue-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.review-queue-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.target-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.target-symbol {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.status-badge.pending {
  background: rgba(251, 191, 36, 0.1);
  color: #d97706;
}

.status-badge.approved {
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.status-badge.rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}

.status-badge.modified {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.signal-preview {
  padding: 0.75rem;
  background: var(--preview-bg, #f9fafb);
  border-radius: 6px;
}

.signal-content {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
}

.source-row {
  display: flex;
  gap: 0.375rem;
  font-size: 0.75rem;
  align-items: center;
}

.source-label {
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.source-value {
  color: var(--text-primary, #111827);
  font-weight: 600;
}

.source-type {
  color: var(--text-secondary, #6b7280);
}

.ai-disposition-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--disposition-bg, #f3f4f6);
  border-radius: 6px;
}

.disposition-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.disposition-badge {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.disposition-badge.bullish {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
}

.disposition-badge.bearish {
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
}

.disposition-badge.neutral {
  background: rgba(107, 114, 128, 0.15);
  color: #374151;
}

.strength-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.strength-label {
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
  min-width: 50px;
}

.strength-bar {
  flex: 1;
  height: 8px;
  background: var(--bar-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  transition: width 0.3s ease;
  border-radius: 4px;
}

.strength-fill.bullish {
  background: linear-gradient(90deg, #22c55e, #15803d);
}

.strength-fill.bearish {
  background: linear-gradient(90deg, #ef4444, #b91c1c);
}

.strength-fill.neutral {
  background: linear-gradient(90deg, #6b7280, #374151);
}

.strength-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  min-width: 35px;
  text-align: right;
}

.confidence-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.confidence-label {
  color: var(--text-secondary, #6b7280);
  font-weight: 500;
}

.confidence-value {
  color: var(--text-primary, #111827);
  font-weight: 600;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.received {
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
}

.reviewed-info {
  font-size: 0.6875rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

.review-btn {
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-secondary, #15803d);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.review-btn:hover {
  background: var(--ion-color-secondary-shade, #166534);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(21, 128, 61, 0.3);
}

html.ion-palette-dark .review-queue-card,
html[data-theme="dark"] .review-queue-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --preview-bg: #111827;
  --disposition-bg: #374151;
  --bar-bg: #4b5563;
}
</style>
