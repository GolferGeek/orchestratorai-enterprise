<template>
  <div class="learning-progress-panel">
    <div v-if="loading" class="learning-progress-panel__loading">
      Loading progress...
    </div>

    <template v-else>
      <!-- Progress bar -->
      <div class="learning-progress-panel__summary">
        <span class="learning-progress-panel__count">
          {{ completedCount }} / {{ milestoneList.length }} completed
        </span>
        <div class="progress-bar" role="progressbar" :aria-valuenow="percentage" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar__fill" :style="{ width: `${percentage}%` }" />
        </div>
        <span class="learning-progress-panel__percentage">{{ percentage }}%</span>
      </div>

      <!-- Milestone list -->
      <ul class="learning-progress-panel__list">
        <li
          v-for="item in milestoneList"
          :key="item.key"
          class="milestone-item"
          :class="{ 'milestone-item--done': isMilestoneCompleted(item.key) }"
        >
          <button
            class="milestone-item__toggle"
            type="button"
            :aria-label="isMilestoneCompleted(item.key) ? `Mark ${item.label} incomplete` : `Mark ${item.label} complete`"
            @click="toggle(item.key)"
          >
            <span class="milestone-item__check" aria-hidden="true">
              {{ isMilestoneCompleted(item.key) ? '✓' : '○' }}
            </span>
          </button>
          <span class="milestone-item__label">{{ item.label }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLearningProgress, MILESTONE_KEYS } from '@/composables/useLearningProgress';

const props = defineProps<{
  orgSlug: string;
}>();

const { progress, loading, isMilestoneCompleted, markComplete, update } = useLearningProgress();

// Human-readable labels for each milestone key
const milestoneList = [
  { key: MILESTONE_KEYS.HARDWARE_SETUP, label: 'Hardware Setup' },
  { key: MILESTONE_KEYS.LOCAL_ENV_CONFIGURED, label: 'Local Environment Configured' },
  { key: MILESTONE_KEYS.FIRST_CONVERSATION, label: 'First Conversation' },
  { key: MILESTONE_KEYS.FIRST_AGENT_CREATED, label: 'First Agent Created' },
  { key: MILESTONE_KEYS.FIRST_AGENT_TESTED, label: 'First Agent Tested' },
  { key: MILESTONE_KEYS.API_INTEGRATION, label: 'API Integration' },
  { key: MILESTONE_KEYS.WEBHOOK_CONFIGURED, label: 'Webhook Configured' },
  { key: MILESTONE_KEYS.STAGING_DEPLOYED, label: 'Staging Deployed' },
  { key: MILESTONE_KEYS.PRODUCTION_DEPLOYED, label: 'Production Deployed' },
  { key: MILESTONE_KEYS.MONITORING_CONFIGURED, label: 'Monitoring Configured' },
];

const completedCount = computed(() =>
  milestoneList.filter((m) => isMilestoneCompleted(m.key)).length,
);

const percentage = computed(() => {
  if (milestoneList.length === 0) return 0;
  return Math.round((completedCount.value / milestoneList.length) * 100);
});

async function toggle(milestoneKey: string): Promise<void> {
  if (isMilestoneCompleted(milestoneKey)) {
    // Uncomplete: send update with completedAt cleared
    await update(milestoneKey, props.orgSlug, undefined, undefined);
  } else {
    await markComplete(milestoneKey, props.orgSlug);
  }
}

// Suppress unused warning — progress is used by isMilestoneCompleted internally
void progress;
</script>

<style scoped>
.learning-progress-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.learning-progress-panel__loading {
  padding: 1rem;
  color: var(--color-text-muted, #6b7280);
  text-align: center;
}

.learning-progress-panel__summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.learning-progress-panel__count,
.learning-progress-panel__percentage {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--color-border, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  background: var(--color-primary, #6366f1);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.learning-progress-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.milestone-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  transition: background 0.1s;
}

.milestone-item:hover {
  background: var(--color-surface-hover, #f9fafb);
}

.milestone-item--done .milestone-item__label {
  color: var(--color-text-muted, #6b7280);
  text-decoration: line-through;
}

.milestone-item__toggle {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.milestone-item__check {
  font-size: 1rem;
  color: var(--color-primary, #6366f1);
}

.milestone-item--done .milestone-item__check {
  color: var(--color-success, #10b981);
}

.milestone-item__label {
  font-size: 0.875rem;
  color: var(--color-text, #111827);
}
</style>
