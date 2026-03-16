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
  label: {
    type: String,
    default: 'Data'
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
  horizontal: {
    type: Boolean,
    default: false
  },
  showLegend: {
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
  const config = chartConfigs.barChart(
    props.labels,
    props.data,
    props.label,
    props.colors.slice(0, props.data.length)
  );

  // Modify for horizontal bars
  if (props.horizontal) {
    config.type = 'bar';
    config.options = {
      ...config.options,
      indexAxis: 'y' as const,
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.2)'
          },
          ticks: {
            color: '#6b7280'
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            color: '#6b7280'
          }
        }
      }
    };
  }

  // Show/hide legend
  if (config.options?.plugins?.legend) {
    config.options.plugins.legend.display = props.showLegend;
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
