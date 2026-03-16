<template>
  <BaseChart
    :config="chartConfig"
    :width="width"
    :height="height"
    :auto-resize="autoResize"
    @chart-ready="onChartReady"
    @chart-error="onChartError"
    @chart-updated="onChartUpdated"
  />
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue';
import BaseChart from './BaseChart.vue';
import { chartConfigs, chartColors } from '@/composables/useChart';

// Props
const props = defineProps({
  labels: {
    type: Array as PropType<string[]>,
    required: true
  },
  datasets: {
    type: Array as PropType<Array<{
      label: string;
      data: number[];
      borderColor?: string;
      backgroundColor?: string;
      fill?: boolean;
    }>>,
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
  },
  filled: {
    type: Boolean,
    default: false
  }
});

import type { Chart } from 'chart.js';

// Emits
const emit = defineEmits<{
  'chart-ready': [chart: Chart];
  'chart-error': [error: string];
  'chart-updated': [];
}>();

// Chart configuration
const chartConfig = computed(() => {
  const processedDatasets = props.datasets.map((dataset, index) => ({
    ...dataset,
    borderColor: dataset.borderColor || chartColors.mixed[index % chartColors.mixed.length],
    backgroundColor: dataset.backgroundColor || 
      (props.filled 
        ? chartColors.mixed[index % chartColors.mixed.length] + '20' // Add transparency
        : chartColors.mixed[index % chartColors.mixed.length]
      ),
    fill: dataset.fill !== undefined ? dataset.fill : props.filled
  }));

  return chartConfigs.lineChart(props.labels, processedDatasets);
});

// Event handlers
const onChartReady = (chart: Chart) => {
  emit('chart-ready', chart);
};

const onChartError = (error: string) => {
  emit('chart-error', error);
};

const onChartUpdated = () => {
  emit('chart-updated');
};
</script>
