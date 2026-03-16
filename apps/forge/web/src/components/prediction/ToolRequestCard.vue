<template>
  <div
    class="tool-request-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', request.id)"
  >
    <div class="card-header">
      <div class="request-info">
        <span class="request-title">{{ request.title }}</span>
        <div class="badges">
          <span class="type-badge" :class="request.requestType">
            {{ formatRequestType(request.requestType) }}
          </span>
          <span class="priority-badge" :class="request.priority">
            {{ formatPriority(request.priority) }}
          </span>
          <span class="status-badge" :class="request.status">
            {{ formatStatus(request.status) }}
          </span>
        </div>
      </div>
      <div class="actions">
        <button class="action-btn" title="Update Status" @click.stop="$emit('updateStatus', request)">
          &#9998;
        </button>
        <button class="action-btn delete" title="Delete" @click.stop="$emit('delete', request.id)">
          &#10005;
        </button>
      </div>
    </div>

    <div class="universe-target-info">
      <span class="universe-name">{{ request.universeName }}</span>
      <span v-if="request.targetName" class="target-name">
        &gt; {{ request.targetName }}
      </span>
    </div>

    <p class="description">
      {{ request.description }}
    </p>

    <div v-if="request.sourceType" class="source-info">
      <span class="source-label">From missed opportunity:</span>
      <span class="source-type">{{ request.sourceType }}</span>
    </div>

    <div v-if="request.statusNotes" class="status-notes">
      <span class="notes-label">Status notes:</span>
      <span class="notes-text">{{ request.statusNotes }}</span>
    </div>

    <div class="card-footer">
      <span class="created">Created {{ formatDate(request.createdAt) }}</span>
      <span v-if="request.updatedAt !== request.createdAt" class="updated">
        Updated {{ formatDate(request.updatedAt) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToolRequest } from '@/stores/toolRequestStore';

interface Props {
  request: ToolRequest;
  isSelected?: boolean;
}

withDefaults(defineProps<Props>(), {
  isSelected: false,
});

defineEmits<{
  select: [id: string];
  updateStatus: [request: ToolRequest];
  delete: [id: string];
}>();

function formatRequestType(type: string): string {
  const map: Record<string, string> = {
    source: 'Source',
    integration: 'Integration',
    feature: 'Feature',
  };
  return map[type] || type;
}

function formatPriority(priority: string): string {
  const map: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };
  return map[priority] || priority;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    wishlist: 'Wishlist',
    planned: 'Planned',
    in_progress: 'In Progress',
    done: 'Done',
    rejected: 'Rejected',
  };
  return map[status] || status;
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
.tool-request-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-request-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tool-request-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.request-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.request-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.badges {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.type-badge,
.priority-badge,
.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.type-badge.source {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.type-badge.integration {
  background-color: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.type-badge.feature {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.priority-badge.high {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.priority-badge.medium {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.priority-badge.low {
  background-color: rgba(107, 114, 128, 0.1);
  color: #4b5563;
}

.status-badge.wishlist {
  background-color: rgba(168, 85, 247, 0.1);
  color: #9333ea;
}

.status-badge.planned {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-badge.in_progress {
  background-color: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.status-badge.done {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.status-badge.rejected {
  background-color: rgba(107, 114, 128, 0.1);
  color: #4b5563;
}

.actions {
  display: flex;
  gap: 0.25rem;
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

.universe-target-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.universe-name {
  font-weight: 600;
}

.target-name {
  color: var(--text-secondary, #6b7280);
}

.description {
  font-size: 0.875rem;
  color: var(--text-primary, #111827);
  margin: 0 0 0.75rem 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.source-info {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
}

.source-label {
  color: var(--text-secondary, #6b7280);
}

.source-type {
  font-weight: 600;
  color: var(--ion-color-secondary, #15803d);
}

.status-notes {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: var(--notes-bg, #f9fafb);
  border-radius: 4px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.notes-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
}

.notes-text {
  font-size: 0.75rem;
  color: var(--text-primary, #111827);
  line-height: 1.4;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.created,
.updated {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .tool-request-card,
html[data-theme="dark"] .tool-request-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --selected-bg: rgba(21, 128, 61, 0.15);
  --action-bg: #374151;
  --action-hover: #4b5563;
  --notes-bg: #111827;
}
</style>
