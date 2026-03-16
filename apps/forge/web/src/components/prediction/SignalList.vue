<template>
  <div class="signal-list">
    <h3 class="section-title">
      Recent Signals
      <span class="count">({{ signals.length }})</span>
    </h3>
    <div v-if="signals.length === 0" class="empty-message">
      No signals available for this target.
    </div>
    <div v-else class="signals">
      <div
        v-for="signal in signals"
        :key="signal.id"
        class="signal-item"
        :class="[signal.disposition, signal.status]"
      >
        <div class="signal-header">
          <span class="disposition-badge" :class="signal.disposition">
            {{ signal.disposition.toUpperCase() }}
          </span>
          <span class="status-badge" :class="signal.status">
            {{ signal.status }}
          </span>
          <span class="urgency-badge" :class="signal.urgency">
            {{ signal.urgency }}
          </span>
        </div>
        <p class="signal-content">{{ signal.content }}</p>
        <div class="signal-footer">
          <span class="source">Source: {{ signal.source }}</span>
          <span class="timestamp">{{ formatTime(signal.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Signal {
  id: string;
  content: string;
  disposition: 'bullish' | 'bearish' | 'neutral';
  status: 'new' | 'processing' | 'promoted' | 'rejected' | 'stale';
  urgency: 'urgent' | 'notable' | 'routine';
  source: string;
  createdAt: string;
}

interface Props {
  signals: Signal[];
}

defineProps<Props>();

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.signal-list {
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

.signals {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.signal-item {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.75rem;
  border-left-width: 4px;
}

.signal-item.bullish {
  border-left-color: #22c55e;
}

.signal-item.bearish {
  border-left-color: #ef4444;
}

.signal-item.neutral {
  border-left-color: #6b7280;
}

.signal-item.rejected {
  opacity: 0.6;
}

.signal-item.stale {
  opacity: 0.5;
}

.signal-header {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.disposition-badge,
.status-badge,
.urgency-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.disposition-badge.bullish {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.disposition-badge.bearish {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.disposition-badge.neutral {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.status-badge.new {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-badge.processing {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-badge.promoted {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-badge.rejected {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.status-badge.stale {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.urgency-badge.urgent {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.urgency-badge.notable {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.urgency-badge.routine {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.signal-content {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.5;
}

.signal-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .signal-list,
html[data-theme="dark"] .signal-list {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
}
</style>
