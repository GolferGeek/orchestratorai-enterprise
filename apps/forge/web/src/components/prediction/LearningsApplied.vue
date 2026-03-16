<template>
  <div class="learnings-applied">
    <h3 class="section-title">
      Applied Learnings
      <span class="count">({{ learnings.length }})</span>
    </h3>
    <div v-if="learnings.length === 0" class="empty-message">
      No learnings were applied to this prediction.
    </div>
    <div v-else class="learnings-list">
      <div
        v-for="learning in learnings"
        :key="learning.id"
        class="learning-item"
        :class="learning.learningType"
      >
        <div class="learning-header">
          <span class="learning-title">{{ learning.title }}</span>
          <span class="learning-type" :class="learning.learningType">
            {{ formatLearningType(learning.learningType) }}
          </span>
        </div>
        <p class="learning-content">{{ learning.content }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Learning {
  id: string;
  title: string;
  learningType: string;
  content: string;
}

interface Props {
  learnings: Learning[];
}

defineProps<Props>();

function formatLearningType(type: string): string {
  const map: Record<string, string> = {
    rule: 'Rule',
    pattern: 'Pattern',
    weight_adjustment: 'Weight',
    threshold: 'Threshold',
    avoid: 'Avoid',
  };
  return map[type] || type;
}
</script>

<style scoped>
.learnings-applied {
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

.learnings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.learning-item {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 0.75rem;
  border-left-width: 4px;
}

.learning-item.rule {
  border-left-color: #15803d;
}

.learning-item.pattern {
  border-left-color: #8b5cf6;
}

.learning-item.weight_adjustment {
  border-left-color: #f59e0b;
}

.learning-item.threshold {
  border-left-color: #10b981;
}

.learning-item.avoid {
  border-left-color: #ef4444;
}

.learning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.learning-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.learning-type {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.learning-type.rule {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.learning-type.pattern {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.learning-type.weight_adjustment {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.learning-type.threshold {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.learning-type.avoid {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.learning-content {
  font-size: 0.8125rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.4;
}

html.ion-palette-dark .learnings-applied,
html[data-theme="dark"] .learnings-applied {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
}
</style>
