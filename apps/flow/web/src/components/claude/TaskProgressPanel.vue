<template>
  <div class="task-progress-panel">
    <!-- Header -->
    <div class="task-progress-panel__header">
      <div class="task-progress-panel__title">
        <span class="task-progress-panel__icon">&#128187;</span>
        <span class="task-progress-panel__title-text">Claude Code: {{ taskTitle }}</span>
      </div>
      <div class="task-progress-panel__status">
        <span v-if="isConnected && !isComplete" class="task-progress-panel__live">
          <span class="task-progress-panel__live-dot"></span>
          Live
        </span>
        <span
          v-if="latestStatus"
          class="task-progress-panel__badge"
          :class="`task-progress-panel__badge--${latestStatus}`"
        >
          {{ latestStatus }}
        </span>
      </div>
    </div>

    <!-- Connecting / empty state -->
    <div v-if="events.length === 0" class="task-progress-panel__empty">
      <span class="task-progress-panel__spinner" aria-label="Loading"></span>
      Waiting for Claude Code to start...
    </div>

    <!-- Events list — newest first, auto-scrolls to bottom -->
    <div v-else ref="scrollContainer" class="task-progress-panel__scroll">
      <div
        v-for="(event, i) in reversedEvents"
        :key="reversedEvents.length - 1 - i"
        class="task-progress-panel__event"
        :class="{
          'task-progress-panel__event--thinking': event.eventType === 'thinking',
        }"
      >
        <span class="task-progress-panel__time">{{ formatTime(event.timestamp) }}</span>
        <span
          class="task-progress-panel__event-icon"
          :title="event.eventType"
          v-html="getEventIcon(event, i === 0)"
        ></span>
        <span
          v-if="event.toolName"
          class="task-progress-panel__tool-badge"
        >{{ event.toolName }}</span>
        <span
          class="task-progress-panel__message"
          :class="{
            'task-progress-panel__message--assistant': event.eventType === 'assistant',
            'task-progress-panel__message--thinking': event.eventType === 'thinking',
          }"
        >
          {{ event.message || event.eventType }}
        </span>
      </div>
    </div>

    <!-- Completion indicator -->
    <div v-if="isComplete" class="task-progress-panel__complete">
      <span v-if="latestStatus === 'completed'" class="task-progress-panel__complete--success">
        Task completed
      </span>
      <span v-else-if="latestStatus === 'failed'" class="task-progress-panel__complete--failed">
        Task failed
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef } from 'vue';
import { useTaskProgress } from '@/composables/useTaskProgress';

const props = defineProps<{
  taskId: string;
  taskTitle: string;
  expanded?: boolean;
}>();

const taskIdRef = toRef(props, 'taskId');
const { events, isConnected, isComplete, latestStatus } = useTaskProgress(taskIdRef);

const scrollContainer = ref<HTMLElement | null>(null);

const reversedEvents = computed(() => [...events.value].reverse());

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getEventIcon(event: { eventType: string; status: string }, isLatest: boolean): string {
  // Event-type-specific icons
  switch (event.eventType) {
    case 'thinking':
      return isLatest ? '&#129504;' : '&#129504;'; // brain
    case 'assistant':
      return '&#128172;'; // speech bubble
    case 'tool_use':
      return '&#128421;'; // terminal
    case 'tool_result':
      return '&#128295;'; // wrench
  }

  // Fall back to status-based icon
  const displayStatus = event.status === 'running' && !isLatest ? 'completed' : event.status;
  switch (displayStatus) {
    case 'running':
      return '&#9651;'; // spinner placeholder
    case 'completed':
      return '&#10003;';
    case 'failed':
      return '&#10007;';
    default:
      return '&#8226;';
  }
}

// Auto-scroll to bottom on new events
watch(events, async () => {
  await nextTick();
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
});
</script>

<style scoped>
.task-progress-panel {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-card, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-progress-panel__header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-progress-panel__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.task-progress-panel__icon {
  flex-shrink: 0;
  font-size: 14px;
}

.task-progress-panel__title-text {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-progress-panel__status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.task-progress-panel__live {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-muted, #94a3b8);
}

.task-progress-panel__live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.task-progress-panel__badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  text-transform: capitalize;
  border: 1px solid currentColor;
}

.task-progress-panel__badge--running {
  color: #3b82f6;
  background: #eff6ff;
}

.task-progress-panel__badge--completed {
  color: #16a34a;
  background: #f0fdf4;
}

.task-progress-panel__badge--failed {
  color: #dc2626;
  background: #fef2f2;
}

.task-progress-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  gap: 8px;
}

.task-progress-panel__spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-top-color: var(--color-primary, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.task-progress-panel__scroll {
  overflow-y: auto;
  max-height: v-bind("props.expanded ? '50vh' : '160px'");
  padding: 4px 12px;
}

.task-progress-panel__event {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 0;
}

.task-progress-panel__event--thinking {
  opacity: 0.6;
}

.task-progress-panel__time {
  font-size: 11px;
  font-family: monospace;
  color: var(--color-muted, #94a3b8);
  flex-shrink: 0;
  margin-top: 2px;
}

.task-progress-panel__event-icon {
  flex-shrink: 0;
  font-size: 13px;
  margin-top: 1px;
}

.task-progress-panel__tool-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 1.4;
}

.task-progress-panel__message {
  font-size: 13px;
  flex: 1;
  word-break: break-word;
}

.task-progress-panel__message--assistant {
  color: var(--color-muted, #94a3b8);
}

.task-progress-panel__message--thinking {
  color: var(--color-muted, #94a3b8);
  font-style: italic;
  font-size: 12px;
}

.task-progress-panel__complete {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.task-progress-panel__complete--success {
  color: #16a34a;
}

.task-progress-panel__complete--failed {
  color: #dc2626;
}
</style>
