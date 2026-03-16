<template>
  <ion-modal :is-open="isOpen" @willDismiss="onDismiss" class="price-history-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ target?.symbol }} Price History</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="onDismiss">
            <ion-icon :icon="closeOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <!-- Target Header -->
      <div v-if="target" class="target-header">
        <div class="target-title">
          <span class="symbol">{{ target.symbol }}</span>
          <span class="name">{{ target.name }}</span>
        </div>
        <div class="current-price" v-if="target.currentPrice != null">
          {{ formatPrice(target.currentPrice, target.targetType) }}
        </div>
      </div>

      <!-- Period Selector -->
      <ion-segment :value="selectedPeriod" @ionChange="onPeriodChange" class="period-selector">
        <ion-segment-button value="day"><ion-label>Day</ion-label></ion-segment-button>
        <ion-segment-button value="2days"><ion-label>2D</ion-label></ion-segment-button>
        <ion-segment-button value="3days"><ion-label>3D</ion-label></ion-segment-button>
        <ion-segment-button value="week"><ion-label>Week</ion-label></ion-segment-button>
        <ion-segment-button value="month"><ion-label>Month</ion-label></ion-segment-button>
      </ion-segment>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading price history...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <ion-button size="small" @click="loadHistory">Try Again</ion-button>
      </div>

      <!-- No Data State -->
      <div v-else-if="!historyData || historyData.snapshots.length === 0" class="empty-state">
        <p>No price data available for this period.</p>
      </div>

      <!-- Chart + Stats -->
      <div v-else class="chart-container">
        <LineChart
          :labels="chartLabels"
          :datasets="chartDatasets"
          :height="280"
          :filled="true"
        />

        <!-- Summary Stats -->
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Start</span>
            <span class="stat-value">{{ formatStatPrice(historyData.change.startValue) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">End</span>
            <span class="stat-value">{{ formatStatPrice(historyData.change.endValue) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Change</span>
            <span class="stat-value" :class="changeValueClass">
              {{ formatStatChange(historyData.change.changeAbsolute) }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Change %</span>
            <span class="stat-value" :class="changeValueClass">
              {{ formatStatPercent(historyData.change.changePercent) }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">High</span>
            <span class="stat-value">{{ formatStatPrice(snapshotHigh) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Low</span>
            <span class="stat-value">{{ formatStatPrice(snapshotLow) }}</span>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonSpinner,
} from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import LineChart from '@/components/Charts/LineChart.vue';
import { predictionDashboardService } from '@/services/predictionDashboardService';
import type { InstrumentPrice, PriceHistoryData, PriceHistoryPeriod } from '@/services/predictionDashboardService';

interface Props {
  isOpen: boolean;
  target: InstrumentPrice | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  dismiss: [];
}>();

const selectedPeriod = ref<PriceHistoryPeriod>('day');
const historyData = ref<PriceHistoryData | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

function onDismiss() {
  emit('dismiss');
}

function onPeriodChange(ev: CustomEvent) {
  selectedPeriod.value = ev.detail.value as PriceHistoryPeriod;
  loadHistory();
}

async function loadHistory() {
  if (!props.target) return;

  isLoading.value = true;
  error.value = null;

  try {
    historyData.value = await predictionDashboardService.getTargetPriceHistory(
      props.target.id,
      selectedPeriod.value,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load price history';
  } finally {
    isLoading.value = false;
  }
}

// Load when modal opens or target changes
watch(
  () => [props.isOpen, props.target?.id],
  ([open]) => {
    if (open && props.target) {
      selectedPeriod.value = 'day';
      loadHistory();
    } else {
      historyData.value = null;
    }
  },
);

// Chart data
const chartLabels = computed<string[]>(() => {
  if (!historyData.value) return [];
  return historyData.value.snapshots.map(s => {
    const d = new Date(s.createdAt);
    if (selectedPeriod.value === 'day') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });
});

const chartDatasets = computed(() => {
  if (!historyData.value) return [];
  const values = historyData.value.snapshots.map(s => s.value);
  const isPositive = (historyData.value.change.changePercent ?? 0) >= 0;
  const color = isPositive ? '#16a34a' : '#dc2626';

  return [{
    label: props.target?.symbol || 'Price',
    data: values,
    borderColor: color,
    backgroundColor: color + '20',
    fill: true,
  }];
});

const snapshotHigh = computed(() => {
  if (!historyData.value || historyData.value.snapshots.length === 0) return null;
  return Math.max(...historyData.value.snapshots.map(s => s.value));
});

const snapshotLow = computed(() => {
  if (!historyData.value || historyData.value.snapshots.length === 0) return null;
  return Math.min(...historyData.value.snapshots.map(s => s.value));
});

const changeValueClass = computed(() => {
  const pct = historyData.value?.change.changePercent;
  if (pct == null) return '';
  if (pct > 0) return 'positive';
  if (pct < 0) return 'negative';
  return '';
});

function formatPrice(value: number, targetType?: string): string {
  if (targetType === 'polymarket' || targetType === 'election') {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value >= 1
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;
}

function formatStatPrice(value: number | null): string {
  if (value == null) return '--';
  return formatPrice(value, props.target?.targetType);
}

function formatStatChange(value: number | null): string {
  if (value == null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatPrice(Math.abs(value), props.target?.targetType)}`;
}

function formatStatPercent(value: number | null): string {
  if (value == null) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
</script>

<style scoped>
.target-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.target-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.symbol {
  font-size: 1.25rem;
  font-weight: 700;
}

.name {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.current-price {
  font-size: 1.25rem;
  font-weight: 600;
}

.period-selector {
  margin-bottom: 1rem;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  gap: 0.75rem;
  color: var(--ion-color-medium);
}

.chart-container {
  margin-top: 0.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-color-light);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
}

.stat-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.stat-value {
  font-size: 0.875rem;
  font-weight: 600;
}

.stat-value.positive {
  color: #16a34a;
}

.stat-value.negative {
  color: #dc2626;
}
</style>
