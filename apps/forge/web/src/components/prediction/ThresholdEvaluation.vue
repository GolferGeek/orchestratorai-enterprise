<template>
  <div class="threshold-evaluation">
    <h3 class="section-title">
      Threshold Evaluation
      <span class="result-badge" :class="evaluation.passed ? 'passed' : 'failed'">
        {{ evaluation.passed ? 'PASSED' : 'FAILED' }}
      </span>
    </h3>
    <div class="thresholds-grid">
      <div class="threshold-item">
        <div class="threshold-header">
          <span class="threshold-label">Predictors</span>
          <span class="threshold-status" :class="getPredictorsStatus">
            {{ evaluation.actualPredictors }}/{{ evaluation.minPredictors }}
          </span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getPredictorsStatus"
            :style="{ width: getPredictorsPercent + '%' }"
          ></div>
        </div>
        <span class="threshold-desc">
          Min {{ evaluation.minPredictors }} required
        </span>
      </div>

      <div class="threshold-item">
        <div class="threshold-header">
          <span class="threshold-label">Combined Strength</span>
          <span class="threshold-status" :class="getStrengthStatus">
            {{ evaluation.actualStrength.toFixed(1) }}/{{ evaluation.minStrength }}
          </span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getStrengthStatus"
            :style="{ width: getStrengthPercent + '%' }"
          ></div>
        </div>
        <span class="threshold-desc">
          Min {{ evaluation.minStrength }} required
        </span>
      </div>

      <div class="threshold-item">
        <div class="threshold-header">
          <span class="threshold-label">Direction Consensus</span>
          <span class="threshold-status" :class="getConsensusStatus">
            {{ Math.round(evaluation.actualConsensus * 100) }}%/{{ Math.round(evaluation.minConsensus * 100) }}%
          </span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="getConsensusStatus"
            :style="{ width: getConsensusPercent + '%' }"
          ></div>
        </div>
        <span class="threshold-desc">
          Min {{ Math.round(evaluation.minConsensus * 100) }}% required
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface ThresholdEval {
  minPredictors: number;
  actualPredictors: number;
  minStrength: number;
  actualStrength: number;
  minConsensus: number;
  actualConsensus: number;
  passed: boolean;
}

interface Props {
  evaluation: ThresholdEval;
}

const props = defineProps<Props>();

const getPredictorsStatus = computed(() => {
  return props.evaluation.actualPredictors >= props.evaluation.minPredictors
    ? 'passed'
    : 'failed';
});

const getPredictorsPercent = computed(() => {
  if (props.evaluation.minPredictors === 0) return 100;
  return Math.min(
    100,
    (props.evaluation.actualPredictors / props.evaluation.minPredictors) * 100
  );
});

const getStrengthStatus = computed(() => {
  return props.evaluation.actualStrength >= props.evaluation.minStrength
    ? 'passed'
    : 'failed';
});

const getStrengthPercent = computed(() => {
  if (props.evaluation.minStrength === 0) return 100;
  return Math.min(
    100,
    (props.evaluation.actualStrength / props.evaluation.minStrength) * 100
  );
});

const getConsensusStatus = computed(() => {
  return props.evaluation.actualConsensus >= props.evaluation.minConsensus
    ? 'passed'
    : 'failed';
});

const getConsensusPercent = computed(() => {
  if (props.evaluation.minConsensus === 0) return 100;
  return Math.min(
    100,
    (props.evaluation.actualConsensus / props.evaluation.minConsensus) * 100
  );
});
</script>

<style scoped>
.threshold-evaluation {
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

.result-badge {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.result-badge.passed {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.result-badge.failed {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.thresholds-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.threshold-item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.threshold-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.threshold-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
}

.threshold-status {
  font-size: 0.875rem;
  font-weight: 600;
}

.threshold-status.passed {
  color: #16a34a;
}

.threshold-status.failed {
  color: #dc2626;
}

.progress-bar {
  height: 8px;
  background-color: var(--progress-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.passed {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.progress-fill.failed {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.threshold-desc {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

html.ion-palette-dark .threshold-evaluation,
html[data-theme="dark"] .threshold-evaluation {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --progress-bg: #374151;
}
</style>
