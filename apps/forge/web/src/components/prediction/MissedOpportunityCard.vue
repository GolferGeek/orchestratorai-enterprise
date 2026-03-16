<template>
  <div class="opportunity-card" @click="$emit('select', opportunity.id)">
    <div class="card-header">
      <div class="opportunity-info">
        <div class="target-info">
          <span class="target-name">{{ opportunity.targetName }}</span>
          <span class="target-symbol">{{ opportunity.targetSymbol }}</span>
        </div>
        <span class="status-badge" :class="opportunity.analysisStatus">
          {{ opportunity.analysisStatus }}
        </span>
      </div>
    </div>

    <div class="opportunity-metrics">
      <div class="direction-indicator" :class="opportunity.direction">
        <span class="direction-arrow">
          {{ opportunity.direction === 'up' ? '↑' : '↓' }}
        </span>
        <span class="move-percent">
          {{ formatPercent(opportunity.movePercent) }}%
        </span>
      </div>

      <div class="value-range">
        <div class="value-item">
          <span class="value-label">Start</span>
          <span class="value">{{ formatValue(opportunity.startValue) }}</span>
          <span class="timestamp">{{ formatTimestamp(opportunity.moveStartAt) }}</span>
        </div>
        <div class="value-item">
          <span class="value-label">End</span>
          <span class="value">{{ formatValue(opportunity.endValue) }}</span>
          <span class="timestamp">{{ formatTimestamp(opportunity.moveEndAt) }}</span>
        </div>
      </div>
    </div>

    <div v-if="opportunity.discoveredDrivers && opportunity.discoveredDrivers.length > 0" class="drivers-preview">
      <span class="drivers-label">Discovered Drivers:</span>
      <div class="drivers-list">
        <span
          v-for="(driver, idx) in previewDrivers"
          :key="idx"
          class="driver-tag"
        >
          {{ driver }}
        </span>
        <span v-if="opportunity.discoveredDrivers && opportunity.discoveredDrivers.length > 3" class="more-count">
          +{{ opportunity.discoveredDrivers.length - 3 }} more
        </span>
      </div>
    </div>

    <div class="card-footer">
      <span class="created">Detected {{ formatDate(opportunity.createdAt) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MissedOpportunity } from '@/stores/missedOpportunityStore';

interface Props {
  opportunity: MissedOpportunity;
}

const props = defineProps<Props>();

defineEmits<{
  select: [id: string];
}>();

const previewDrivers = computed(() => {
  return props.opportunity.discoveredDrivers?.slice(0, 3) || [];
});

function formatPercent(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

function formatValue(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
.opportunity-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.opportunity-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.opportunity-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.target-name {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.target-symbol {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  padding: 0.125rem 0.375rem;
  background: var(--symbol-bg, #f3f4f6);
  border-radius: 3px;
}

.status-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  width: fit-content;
}

.status-badge.pending {
  background-color: rgba(251, 191, 36, 0.1);
  color: #f59e0b;
}

.status-badge.analyzed {
  background-color: rgba(21, 128, 61, 0.1);
  color: #15803d;
}

.status-badge.actioned {
  background-color: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.opportunity-metrics {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--metrics-bg, #f9fafb);
  border-radius: 6px;
}

.direction-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-right: 1rem;
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.direction-indicator.up .direction-arrow {
  color: #10b981;
}

.direction-indicator.down .direction-arrow {
  color: #ef4444;
}

.direction-arrow {
  font-size: 1.5rem;
  font-weight: bold;
}

.move-percent {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.value-range {
  display: flex;
  gap: 1.5rem;
  flex: 1;
}

.value-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.value-label {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.timestamp {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
}

.drivers-preview {
  margin-bottom: 0.75rem;
}

.drivers-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
  display: block;
  margin-bottom: 0.375rem;
}

.drivers-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.driver-tag {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  background: var(--tag-bg, #e0e7ff);
  color: var(--tag-text, #4f46e5);
  border-radius: 12px;
}

.more-count {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  background: var(--more-bg, #f3f4f6);
  color: var(--text-secondary, #6b7280);
  border-radius: 12px;
  font-weight: 500;
}

.card-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.created {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .opportunity-card,
html[data-theme="dark"] .opportunity-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --symbol-bg: #374151;
  --metrics-bg: #111827;
  --tag-bg: #312e81;
  --tag-text: #a5b4fc;
  --more-bg: #374151;
}
</style>
