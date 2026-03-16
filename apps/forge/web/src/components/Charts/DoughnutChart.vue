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
  data: {
    type: Array as PropType<number[]>,
    required: true
  },
  colors: {
    type: Array as PropType<string[]>,
    default: () => chartColors.mixed
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
  cutout: {
    type: String,
    default: '60%'
  },
  legendPosition: {
    type: String as PropType<'top' | 'bottom' | 'left' | 'right'>,
    default: 'right'
  }
});

import type { Chart, ChartOptions } from 'chart.js';

// Emits
const emit = defineEmits<{
  'chart-ready': [chart: Chart];
  'chart-error': [error: string];
  'chart-updated': [];
}>();

// Chart configuration
const chartConfig = computed(() => {
  const config = chartConfigs.doughnutChart(
    props.labels,
    props.data,
    props.colors.slice(0, props.data.length)
  );

  // Customize cutout (this is a doughnut chart option, not a dataset property)
  if (config.options) {
    (config.options as ChartOptions<'doughnut'>).cutout = props.cutout;
  }

  // Customize legend position
  if (config.options?.plugins?.legend) {
    config.options.plugins.legend.position = props.legendPosition;
  }

  return config;
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
