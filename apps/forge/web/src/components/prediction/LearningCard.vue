<template>
  <div
    class="learning-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', learning.id)"
  >
    <div class="card-header">
      <div class="learning-info">
        <span class="learning-title">{{ learning.title }}</span>
        <div class="badges">
          <span class="scope-badge" :class="learning.scopeLevel">
            {{ learning.scopeLevel }}
          </span>
          <span class="type-badge" :class="learning.learningType">
            {{ formatLearningType(learning.learningType) }}
          </span>
          <span class="source-badge" :class="learning.sourceType">
            {{ formatSourceType(learning.sourceType) }}
          </span>
        </div>
      </div>
      <div class="actions">
        <button class="action-btn" title="Edit" @click.stop="$emit('edit', learning)">
          &#9998;
        </button>
        <button class="action-btn delete" title="Delete" @click.stop="$emit('delete', learning.id)">
          &#10005;
        </button>
      </div>
    </div>

    <p class="content-preview">
      {{ contentPreview }}
    </p>

    <div class="card-metadata">
      <span class="status-badge" :class="learning.status">
        {{ learning.status }}
      </span>
      <span v-if="scopeContext" class="scope-context">
        {{ scopeContext }}
      </span>
    </div>

    <div class="card-footer">
      <span class="created">Created {{ formatDate(learning.createdAt) }}</span>
      <span v-if="learning.updatedAt !== learning.createdAt" class="updated">
        Updated {{ formatDate(learning.updatedAt) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PredictionLearning } from '@/stores/learningStore';

interface Props {
  learning: PredictionLearning;
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  edit: [learning: PredictionLearning];
  delete: [id: string];
}>();

const contentPreview = computed(() => {
  const maxLength = 120;
  if (props.learning.content.length <= maxLength) {
    return props.learning.content;
  }
  return props.learning.content.substring(0, maxLength) + '...';
});

const scopeContext = computed(() => {
  const { scopeLevel, domain, universeId, targetId, analystId } = props.learning;
  if (scopeLevel === 'runner') return 'Global';
  if (scopeLevel === 'domain' && domain) return `Domain: ${domain}`;
  if (scopeLevel === 'universe' && universeId) return 'Universe-specific';
  if (scopeLevel === 'target' && targetId) return 'Target-specific';
  if (analystId) return 'Analyst-specific';
  return null;
});

function formatLearningType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSourceType(type: string): string {
  const map: Record<string, string> = {
    human: 'Human',
    ai_suggested: 'AI Suggested',
    ai_approved: 'AI Approved',
  };
  return map[type] || type;
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
.learning-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.learning-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.learning-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.learning-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.learning-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badges {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.scope-badge,
.type-badge,
.source-badge {
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
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
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

.source-badge.human {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.source-badge.ai_suggested {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.source-badge.ai_approved {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
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

.content-preview {
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  margin: 0 0 0.75rem 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-metadata {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.5rem;
  border-radius: 3px;
  width: fit-content;
}

.status-badge.active {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.status-badge.superseded {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-badge.inactive {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.scope-context {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  font-style: italic;
}

.card-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.created,
.updated {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .learning-card,
html[data-theme="dark"] .learning-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --action-bg: #374151;
  --action-hover: #4b5563;
}
</style>
