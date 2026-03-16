<template>
  <div class="prediction-timeline">
    <h3 class="section-title">Timeline</h3>
    <div v-if="timeline.length === 0" class="empty-message">
      No timeline events available.
    </div>
    <div v-else class="timeline-container">
      <div
        v-for="(event, index) in timeline"
        :key="index"
        class="timeline-item"
      >
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="event-header">
            <span class="event-name">{{ event.event }}</span>
            <span class="event-time">{{ formatTime(event.timestamp) }}</span>
          </div>
          <p v-if="event.details" class="event-details">{{ event.details }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TimelineEvent {
  timestamp: string;
  event: string;
  details?: string;
}

interface Props {
  timeline: TimelineEvent[];
}

defineProps<Props>();

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
</script>

<style scoped>
.prediction-timeline {
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
}

.empty-message {
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

.timeline-container {
  position: relative;
  padding-left: 1.5rem;
}

.timeline-container::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--border-color, #e5e7eb);
}

.timeline-item {
  position: relative;
  padding-bottom: 1rem;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot {
  position: absolute;
  left: -1.5rem;
  top: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--ion-color-secondary, #15803d);
  border: 2px solid var(--card-bg, #ffffff);
  z-index: 1;
}

.timeline-content {
  background: var(--content-bg, #f9fafb);
  border-radius: 6px;
  padding: 0.75rem;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.event-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.event-time {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}

.event-details {
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  margin: 0.5rem 0 0 0;
  line-height: 1.4;
}

html.ion-palette-dark .prediction-timeline,
html[data-theme="dark"] .prediction-timeline {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --content-bg: #111827;
}
</style>
