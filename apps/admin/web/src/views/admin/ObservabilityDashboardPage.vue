<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Observability Dashboard</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading metrics...</p>
      </div>

      <template v-else-if="metrics">
        <!-- Summary Cards -->
        <div class="cards-row">
          <div class="metric-card">
            <div class="card-label">Events (24h)</div>
            <div class="card-value">{{ metrics.totalEventsLast24h.toLocaleString() }}</div>
          </div>
          <div class="metric-card metric-card-error">
            <div class="card-label">Errors (24h)</div>
            <div class="card-value error-value">{{ metrics.errorCountLast24h.toLocaleString() }}</div>
          </div>
          <div class="metric-card metric-card-warn">
            <div class="card-label">Warnings (24h)</div>
            <div class="card-value warn-value">{{ metrics.warnCountLast24h.toLocaleString() }}</div>
          </div>
        </div>

        <div class="sections-row">
          <!-- Top Products -->
          <div class="section">
            <h3>Top Products by Events</h3>
            <div v-if="metrics.topProducts.length === 0" class="empty-section">No data</div>
            <div v-else class="bar-list">
              <div v-for="item in metrics.topProducts" :key="item.product" class="bar-item">
                <div class="bar-label">
                  <span class="badge badge-product">{{ item.product }}</span>
                  <span class="bar-count">{{ item.eventCount.toLocaleString() }}</span>
                </div>
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    :style="{ width: barWidth(item.eventCount, metrics!.topProducts) + '%' }"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Top Errors -->
          <div class="section">
            <h3>Top Error Messages</h3>
            <div v-if="metrics.topErrorMessages.length === 0" class="empty-section">No errors</div>
            <div v-else class="error-list">
              <div
                v-for="(item, idx) in metrics.topErrorMessages"
                :key="idx"
                class="top-error-item"
              >
                <div class="error-count">{{ item.count }}</div>
                <div class="error-message">{{ item.message }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick nav to full events log -->
        <div class="nav-card">
          <span>View the full event log for search, filtering, and detailed inspection.</span>
          <ion-button size="small" router-link="/app/admin/observability/events">
            Open Event Log
            <ion-icon :icon="arrowForwardOutline" slot="end" />
          </ion-button>
        </div>
      </template>

      <div class="empty-state" v-else>
        <ion-icon :icon="pulseOutline" />
        <h3>No Metrics Available</h3>
        <p>Observability data will appear here once events are recorded.</p>
      </div>
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { refreshOutline, pulseOutline, arrowForwardOutline } from 'ionicons/icons';
import { adminApiService, type ObservabilityMetrics } from '@/services/admin-api.service';
import { useObservabilityStore } from '@/stores/observability.store';

const store = useObservabilityStore();
const loading = ref(false);
const metrics = ref<ObservabilityMetrics | null>(null);

const barWidth = (value: number, items: Array<{ eventCount: number }>) => {
  const max = Math.max(...items.map((i) => i.eventCount), 1);
  return Math.round((value / max) * 100);
};

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getObservabilityMetrics();
    metrics.value = data;
    store.setMetrics(data);
  } catch (_err) {
    const msg = 'Failed to load observability metrics';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  background: var(--ion-toolbar-background, var(--ion-color-light));
}

.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.cards-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.metric-card {
  flex: 1;
  min-width: 140px;
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.metric-card-error {
  border-left: 4px solid #ef4444;
}

.metric-card-warn {
  border-left: 4px solid #f57f17;
}

.card-label {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #777);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.4rem;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ion-text-color, #333);
}

.error-value {
  color: #ef4444;
}

.warn-value {
  color: #f57f17;
}

.sections-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .sections-row {
    grid-template-columns: 1fr;
  }
}

.section {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.section h3 {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-section {
  color: var(--dark-text-muted, #aaa);
  font-size: 0.9rem;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bar-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bar-count {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  font-weight: 600;
}

.bar-track {
  height: 6px;
  background: var(--ion-color-light-shade);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--ion-color-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.badge-product {
  background: rgba(59, 130, 246, 0.15);
  color: var(--ion-color-primary, #2c4a7c);
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.top-error-item {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.top-error-item:last-child {
  border-bottom: none;
}

.error-count {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  flex-shrink: 0;
  min-width: 28px;
  text-align: center;
}

.error-message {
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  font-family: monospace;
  word-break: break-all;
}

.nav-card {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.9rem;
  color: var(--dark-text-muted, #555);
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}

.empty-state ion-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.empty-state h3 {
  margin: 0 0 0.5rem;
  color: var(--ion-text-color, #555);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}
</style>
