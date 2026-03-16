<template>
  <div class="confidence-bar">
    <div class="confidence-bar-container">
      <div
        class="confidence-bar-fill"
        :style="{ width: `${confidence}%`, backgroundColor: barColor }"
      ></div>
    </div>
    <span class="confidence-label">{{ confidence.toFixed(0) }}%</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  confidence: number; // 0-100
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLabel: true,
});

const barColor = computed(() => {
  if (props.confidence >= 80) return '#10b981'; // green
  if (props.confidence >= 60) return '#15803d'; // green (darker)
  if (props.confidence >= 40) return '#f59e0b'; // yellow
  return '#ef4444'; // red
});
</script>

<style scoped>
.confidence-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.confidence-bar-container {
  flex: 1;
  height: 1rem;
  background-color: #e5e7eb;
  border-radius: 0.25rem;
  overflow: hidden;
}

.confidence-bar-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.confidence-label {
  font-size: 0.875rem;
  font-weight: 600;
  min-width: 3rem;
  text-align: right;
}
</style>
