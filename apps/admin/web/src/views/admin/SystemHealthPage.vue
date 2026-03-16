<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>System Health</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Checking system health...</p>
      </div>

      <template v-else-if="report">
        <!-- Overall Status -->
        <div :class="['overall-banner', `banner-${report.overallStatus}`]">
          <ion-icon :icon="overallIcon" class="overall-icon" />
          <div>
            <div class="overall-label">System Status</div>
            <div class="overall-status">{{ report.overallStatus.toUpperCase() }}</div>
          </div>
          <div class="overall-time">
            Checked {{ formatTime(report.checkedAt) }}
          </div>
        </div>

        <!-- Products Grid -->
        <div class="products-grid">
          <div
            v-for="product in report.products"
            :key="product.product"
            class="product-card"
          >
            <div class="product-header">
              <span class="product-name">{{ product.displayName }}</span>
              <span :class="['product-overall-dot', `dot-${worstStatus(product)}`]" />
            </div>

            <div class="port-row" v-if="product.apiPort">
              <span class="port-label">API :{{ product.apiPort }}</span>
              <span :class="['status-pill', `status-${product.apiStatus}`]">
                {{ product.apiStatus }}
              </span>
            </div>

            <div class="port-row" v-if="product.webPort">
              <span class="port-label">Web :{{ product.webPort }}</span>
              <span :class="['status-pill', `status-${product.webStatus}`]">
                {{ product.webStatus }}
              </span>
            </div>

            <div class="response-time" v-if="product.responseTimeMs !== null">
              {{ product.responseTimeMs }}ms
            </div>

            <div class="product-message" v-if="product.message">
              {{ product.message }}
            </div>
          </div>
        </div>
      </template>

      <div class="empty-state" v-else>
        <ion-icon :icon="heartOutline" />
        <h3>No Health Data</h3>
        <p>System health data will appear here once the health check endpoint is available.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import {
  refreshOutline,
  heartOutline,
  checkmarkCircleOutline,
  warningOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { adminApiService, type SystemHealthReport, type ProductHealthStatus } from '@/services/admin-api.service';
import { useSystemHealthStore } from '@/stores/system-health.store';

const store = useSystemHealthStore();
const loading = ref(false);
const report = ref<SystemHealthReport | null>(null);

const STATUS_ORDER: Record<string, number> = { healthy: 0, unknown: 1, degraded: 2, down: 3 };

const overallIcon = computed(() => {
  if (!report.value) return heartOutline;
  switch (report.value.overallStatus) {
    case 'healthy': return checkmarkCircleOutline;
    case 'degraded': return warningOutline;
    case 'down': return closeCircleOutline;
    default: return heartOutline;
  }
});

const worstStatus = (product: ProductHealthStatus): string => {
  const statuses = [product.apiStatus, product.webStatus].filter(Boolean);
  return statuses.reduce((worst, s) => {
    return (STATUS_ORDER[s] ?? 0) > (STATUS_ORDER[worst] ?? 0) ? s : worst;
  }, 'healthy');
};

const formatTime = (dateStr: string) => new Date(dateStr).toLocaleString();

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getSystemHealth();
    report.value = data;
    store.setReport(data);
  } catch (_err) {
    const msg = 'Failed to load system health';
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

.overall-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: 10px;
  color: white;
}

.banner-healthy {
  background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
}

.banner-degraded {
  background: linear-gradient(135deg, #f57f17 0%, #e65100 100%);
}

.banner-down {
  background: linear-gradient(135deg, #c5221f 0%, #8b0000 100%);
}

.overall-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.overall-label {
  font-size: 0.8rem;
  opacity: 0.85;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.overall-status {
  font-size: 1.5rem;
  font-weight: 700;
}

.overall-time {
  margin-left: auto;
  font-size: 0.8rem;
  opacity: 0.8;
  white-space: nowrap;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.product-card {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.product-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.product-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ion-text-color, #333);
}

.product-overall-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-healthy {
  background: #10b981;
}

.dot-degraded {
  background: #f57f17;
}

.dot-down {
  background: #ef4444;
}

.dot-unknown {
  background: var(--dark-text-muted, #aaa);
}

.port-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.port-label {
  font-size: 0.85rem;
  font-family: monospace;
  color: var(--dark-text-muted, #666);
}

.status-pill {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.status-healthy {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-degraded {
  background: rgba(245, 127, 23, 0.15);
  color: #f57f17;
}

.status-down {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.status-unknown {
  background: var(--ion-color-light, #f5f5f5);
  color: var(--dark-text-muted, #777);
}

.response-time {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #aaa);
  font-family: monospace;
}

.product-message {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
  border-top: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  padding-top: 0.4rem;
  margin-top: 0.2rem;
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
