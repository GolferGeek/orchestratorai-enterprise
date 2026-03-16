<template>
  <div class="base-chart" :class="{ 'chart-loading': !isReady }">
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
    <div v-if="!isReady && !error" class="chart-loading-spinner">
      <ion-spinner name="crescent"></ion-spinner>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, type PropType } from 'vue';
import { IonIcon, IonSpinner } from '@ionic/vue';
import { alertCircleOutline } from 'ionicons/icons';
import { useChart, type ChartConfig } from '@/composables/useChart';
import type { ChartData } from 'chart.js';

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
  'chart-updated': [];
}>();

// Template refs
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Chart configuration as computed ref
const chartConfig = computed(() => props.config);

// Use chart composable
const { chart, isReady, error, updateChart, resizeChart } = useChart(canvasRef, chartConfig);

// Watch for ready state changes
watch(isReady, (ready) => {
  if (ready && chart.value) {
    emit('chart-ready', chart.value);
  }
});

// Watch for error changes
watch(error, (err) => {
  if (err) {
    emit('chart-error', err);
  }
});

// Expose methods for parent components
const updateData = (newData: ChartData) => {
  updateChart(newData);
  emit('chart-updated');
};

const resize = () => {
  if (props.autoResize) {
    resizeChart();
  }
};

// Handle window resize
if (props.autoResize) {
  window.addEventListener('resize', resize);
}

// Expose methods to parent
defineExpose({
  updateData,
  resize,
  chart,
  isReady,
  error
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
  opacity: 0.7;
}

.chart-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--ion-color-danger);
  font-size: 14px;
}

.chart-loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

canvas {
  display: block;
}
</style>
