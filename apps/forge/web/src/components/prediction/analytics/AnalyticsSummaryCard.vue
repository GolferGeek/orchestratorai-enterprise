<template>
  <div class="analytics-summary-card" :class="trendClass">
    <div class="card-header">
      <h4 class="card-title">{{ title }}</h4>
      <span v-if="trend" class="trend-indicator" :class="trend">
        <span class="trend-icon">{{ trendIcon }}</span>
      </span>
    </div>
    <div class="card-body">
      <div class="card-value">{{ formattedValue }}</div>
      <div v-if="subtitle" class="card-subtitle">{{ subtitle }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'flat';
  format?: 'number' | 'percentage' | 'currency' | 'duration';
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: undefined,
  trend: undefined,
  format: 'number',
});

const formattedValue = computed(() => {
  if (typeof props.value === 'string') {
    return props.value;
  }

  switch (props.format) {
    case 'percentage':
      return `${(props.value * 100).toFixed(1)}%`;
    case 'currency':
      return `$${props.value.toFixed(2)}`;
    case 'duration':
      return `${props.value.toFixed(1)}d`;
    default:
      return props.value.toLocaleString();
  }
});

const trendIcon = computed(() => {
  switch (props.trend) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'flat':
      return '→';
    default:
      return '';
  }
});

const trendClass = computed(() => props.trend ? `trend-${props.trend}` : '');
</script>

<style scoped>
.analytics-summary-card {
  background: var(--ion-card-background, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1.25rem;
  transition: all 0.2s;
}

.analytics-summary-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.card-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ion-color-medium, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.trend-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 1rem;
  font-weight: 700;
}

.trend-indicator.up {
  background: var(--ion-color-success-tint, rgba(16, 185, 129, 0.1));
  color: var(--ion-color-success, #10b981);
}

.trend-indicator.down {
  background: var(--ion-color-danger-tint, rgba(239, 68, 68, 0.1));
  color: var(--ion-color-danger, #ef4444);
}

.trend-indicator.flat {
  background: var(--ion-color-medium-tint, rgba(107, 114, 128, 0.1));
  color: var(--ion-color-medium, #6b7280);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ion-text-color, #111827);
  line-height: 1.2;
}

.card-subtitle {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
}

/* Responsive */
@media (max-width: 768px) {
  .card-value {
    font-size: 1.5rem;
  }
}
</style>
