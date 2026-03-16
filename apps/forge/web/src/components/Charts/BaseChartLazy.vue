<template>
  <div class="base-chart" :class="{ 'chart-loading': isLoading }">
    <div v-if="error" class="chart-error">
      <ion-icon :icon="alertCircleOutline" color="danger"></ion-icon>
      <span>{{ error }}</span>
    </div>
    <canvas
      v-else
      ref="canvasRef"
      :width="width"
      :height="height"
      :style="{ maxWidth: '100%', maxHeight: '100%' }"
    ></canvas>
    <div v-if="isLoading && !error" class="chart-loading-spinner">
      <ion-spinner name="crescent"></ion-spinner>
      <p class="loading-text">Loading chart...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, type PropType } from 'vue';
import { IonIcon, IonSpinner } from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { useChart, type ChartConfig } from '@/composables/useChartLazy';

// Props
const props = defineProps({
  config: {
    type: Object as PropType<ChartConfig>,
    required: true
  },
  width: {
    type: Number,
    default: 400
  },
  height: {
    type: Number,
    default: 300
  },
  autoResize: {
    type: Boolean,
    default: true
  }
});

import type { Chart } from 'chart.js';

// Emits
const emit = defineEmits<{
  'chart-ready': [chart: Chart];
  'chart-error': [error: string];
}>();

// Template refs
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Computed config
const chartConfig = computed(() => props.config);

// Use lazy-loaded chart composable
const { chartInstance, isLoading, error, createChart, destroyChart } = useChart(
  canvasRef,
  chartConfig
);

// Watch for chart instance changes
watch(chartInstance, (newChart) => {
  if (newChart) {
    emit('chart-ready', newChart);
  }
});

// Watch for errors
watch(error, (newError) => {
  if (newError) {
    emit('chart-error', newError);
  }
});

// Expose methods for parent components
defineExpose({
  chart: chartInstance,
  isLoading,
  error,
  refresh: createChart,
  destroy: destroyChart
});
</script>

<style scoped>
.base-chart {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.chart-loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--ion-color-medium);
}

.loading-text {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.chart-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--ion-color-danger-tint);
  border-radius: 8px;
  color: var(--ion-color-danger-contrast);
  font-size: 0.9rem;
}

canvas {
  display: block;
}
</style>
