import { ref, onMounted, onUnmounted, watch, readonly, type Ref } from 'vue';
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  // type ChartConfiguration,
  type ChartType,
  type ChartData,
  type ChartOptions
} from 'chart.js';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface ChartConfig {
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
}

export function useChart(canvasRef: Ref<HTMLCanvasElement | null>, config: Ref<ChartConfig>) {
  const chart = ref<Chart | null>(null);
  const isReady = ref(false);
  const error = ref<string | null>(null);

  const createChart = () => {
    if (!canvasRef.value) {
      error.value = 'Canvas element not available';
      return;
    }

    try {
      // Destroy existing chart if it exists
      if (chart.value) {
        chart.value.destroy();
      }

      // Create new chart
      chart.value = new Chart(canvasRef.value, {
        type: config.value.type,
        data: config.value.data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...config.value.options
        }
      });

      isReady.value = true;
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create chart';
      console.error('Chart creation error:', err);
    }
  };

  const updateChart = (newData: ChartData) => {
    if (!chart.value) return;

    try {
      chart.value.data = newData;
      chart.value.update('active');
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update chart';
      console.error('Chart update error:', err);
    }
  };

  const destroyChart = () => {
    if (chart.value) {
      chart.value.destroy();
      chart.value = null;
      isReady.value = false;
    }
  };

  const resizeChart = () => {
    if (chart.value) {
      chart.value.resize();
    }
  };

  // Watch for config changes
  watch(
    config,
    () => {
      createChart();
    },
    { deep: true }
  );

  // Watch for canvas availability
  watch(canvasRef, (newCanvas) => {
    if (newCanvas) {
      createChart();
    }
  });

  onMounted(() => {
    if (canvasRef.value) {
      createChart();
    }
  });

  onUnmounted(() => {
    destroyChart();
  });

  return {
    chart: readonly(chart) as Readonly<Ref<Chart | null>>,
    isReady: readonly(isReady) as Readonly<Ref<boolean>>,
    error: readonly(error) as Readonly<Ref<string | null>>,
    updateChart,
    destroyChart,
    resizeChart
  };
}

// Predefined chart configurations
export const chartConfigs = {
  barChart: (labels: string[], data: number[], label: string, backgroundColor?: string[]): ChartConfig => ({
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: backgroundColor || [
          '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b'
        ],
        borderColor: backgroundColor?.map(color => color) || [
          '#2563eb', '#059669', '#7c3aed', '#dc2626', '#d97706'
        ],
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.2)'
          },
          ticks: {
            color: '#6b7280'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#6b7280'
          }
        }
      }
    }
  }),

  lineChart: (labels: string[], datasets: Array<{
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    fill?: boolean;
  }>): ChartConfig => ({
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(dataset => ({
        ...dataset,
        borderWidth: 3,
        pointBackgroundColor: dataset.borderColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.4
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20,
            color: '#374151'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.2)'
          },
          ticks: {
            color: '#6b7280'
          }
        },
        x: {
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280'
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  }),

  pieChart: (labels: string[], data: number[], backgroundColor: string[]): ChartConfig => ({
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor,
        borderColor: '#fff',
        borderWidth: 2,
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20,
            color: '#374151'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const total = context.dataset.data.reduce((sum: number, value) => {
                const num = typeof value === 'number' ? value : 0;
                return (sum as number) + num;
              }, 0 as number) as number;
              const parsed = typeof context.parsed === 'number' ? context.parsed : 0;
              const percentage = (total as number) > 0 ? ((parsed / (total as number)) * 100).toFixed(1) : '0.0';
              return `${context.label}: ${parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  }),

  doughnutChart: (labels: string[], data: number[], backgroundColor: string[]): ChartConfig => ({
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor,
        borderColor: '#fff',
        borderWidth: 2,
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 20,
            color: '#374151'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const total = context.dataset.data.reduce((sum: number, value) => {
                const num = typeof value === 'number' ? value : 0;
                return (sum as number) + num;
              }, 0 as number) as number;
              const parsed = typeof context.parsed === 'number' ? context.parsed : 0;
              const percentage = (total as number) > 0 ? ((parsed / (total as number)) * 100).toFixed(1) : '0.0';
              return `${context.label}: ${parsed} (${percentage}%)`;
            }
          }
        }
      }
    } as ChartOptions
  })
};

// Chart color palettes
export const chartColors = {
  primary: ['#3b82f6', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  success: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
  warning: ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'],
  danger: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
  purple: ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'],
  mixed: ['#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#84cc16']
};

// Utility functions
export const formatChartData = {
  currency: (value: number): string => `$${value.toFixed(2)}`,
  percentage: (value: number): string => `${value.toFixed(1)}%`,
  number: (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  },
  duration: (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
};
