<template>
  <div class="risk-score-badge" :class="riskLevel">
    <span class="score-value">{{ formattedScore }}</span>
    <span class="score-label">{{ riskLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  score: number;
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLabel: true,
});

// Normalize score to 0-1 range
// Handles multiple scales: 0-1 (already normalized), 1-10 (dimension scores), 0-100 (percentages)
const normalizedScore = computed(() => {
  const score = props.score;
  // Guard against undefined, null, or NaN
  if (score === undefined || score === null || Number.isNaN(score)) return 0;
  if (score <= 1) return score; // Already 0-1 scale
  if (score <= 10) return score / 10; // 1-10 scale (dimension assessments)
  return score / 100; // 0-100 scale (percentages)
});

const formattedScore = computed(() => {
  return (normalizedScore.value * 100).toFixed(0) + '%';
});

const riskLevel = computed(() => {
  const score = normalizedScore.value;
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  if (score >= 0.2) return 'low';
  return 'minimal';
});

const riskLabel = computed(() => {
  const score = normalizedScore.value;
  if (score >= 0.8) return 'Critical';
  if (score >= 0.6) return 'High';
  if (score >= 0.4) return 'Medium';
  if (score >= 0.2) return 'Low';
  return 'Minimal';
});
</script>

<style scoped>
.risk-score-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.score-value {
  font-weight: 600;
}

.score-label {
  font-size: 0.625rem;
  text-transform: uppercase;
}

.critical {
  background: var(--ion-color-danger-muted-bg, #f5d5d5);
  color: var(--ion-color-danger-muted-contrast, #8b4444);
}

.high {
  background: var(--ion-color-warning-muted-bg, #f5e6d5);
  color: var(--ion-color-warning-muted-contrast, #8b6644);
}

.medium {
  background: var(--ion-color-medium-muted-bg, #f5f0d5);
  color: var(--ion-color-medium-muted-contrast, #7a7344);
}

.low {
  background: var(--ion-color-success-muted-bg, #d5e8d5);
  color: var(--ion-color-success-muted-contrast, #447744);
}

.minimal {
  background: var(--ion-color-success-muted-bg, #d5e8d5);
  color: var(--ion-color-success-muted-contrast, #447744);
}
</style>
