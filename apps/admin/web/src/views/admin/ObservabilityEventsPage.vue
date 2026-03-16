<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Event Log</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Filters -->
      <div class="filter-bar">
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Search messages..."
          :debounce="500"
          style="max-width: 360px;"
          @ionInput="onSearch"
        />
        <select v-model="filterProduct" class="filter-select" @change="onSearch">
          <option value="">All Products</option>
          <option v-for="p in productOptions" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterSeverity" class="filter-select" @change="onSearch">
          <option value="">All Severity</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      <!-- Events Table -->
      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Severity</th>
              <th>Product</th>
              <th>Type</th>
              <th>Message</th>
              <th>Org</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="event in events"
              :key="event.id"
              class="clickable-row"
              @click="selectEvent(event)"
            >
              <td class="mono time-cell">{{ formatTime(event.occurredAt) }}</td>
              <td>
                <span :class="['severity-badge', `severity-${event.severity}`]">
                  {{ event.severity }}
                </span>
              </td>
              <td><span class="badge badge-product">{{ event.product }}</span></td>
              <td class="mono type-cell">{{ event.eventType }}</td>
              <td class="message-cell">{{ truncate(event.message, 100) }}</td>
              <td class="mono">{{ event.orgSlug }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && events.length === 0">
        <ion-icon :icon="listOutline" />
        <h3>No Events Found</h3>
        <p>Try adjusting your filters or check back later.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading events...</p>
      </div>

      <!-- Load More -->
      <div class="load-more" v-if="!loading && events.length > 0 && hasMore">
        <ion-button fill="outline" size="small" @click="loadMore" :disabled="loadingMore">
          {{ loadingMore ? 'Loading...' : 'Load More' }}
        </ion-button>
      </div>

      <!-- Event Detail Modal -->
      <ion-modal :is-open="!!selectedEvent" @didDismiss="selectedEvent = null">
        <ion-header>
          <ion-toolbar>
            <ion-title>Event Detail</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="selectedEvent = null">Close</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding" v-if="selectedEvent">
          <div class="event-detail">
            <div class="detail-row">
              <span class="detail-label">Time</span>
              <span class="detail-value mono">{{ formatTime(selectedEvent.occurredAt) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Severity</span>
              <span :class="['severity-badge', `severity-${selectedEvent.severity}`]">{{ selectedEvent.severity }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Event Type</span>
              <span class="detail-value mono">{{ selectedEvent.eventType }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Product</span>
              <span class="detail-value">{{ selectedEvent.product }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Organization</span>
              <span class="detail-value mono">{{ selectedEvent.orgSlug }}</span>
            </div>
            <div class="detail-row" v-if="selectedEvent.userId">
              <span class="detail-label">User ID</span>
              <span class="detail-value mono">{{ selectedEvent.userId }}</span>
            </div>
            <div class="detail-row" v-if="selectedEvent.agentSlug">
              <span class="detail-label">Agent</span>
              <span class="detail-value mono">{{ selectedEvent.agentSlug }}</span>
            </div>
            <div class="detail-row" v-if="selectedEvent.conversationId">
              <span class="detail-label">Conversation</span>
              <span class="detail-value mono">{{ selectedEvent.conversationId }}</span>
            </div>
            <div class="detail-section-header">Message</div>
            <pre class="detail-message">{{ selectedEvent.message }}</pre>
            <div class="detail-section-header" v-if="Object.keys(selectedEvent.metadata).length > 0">Metadata</div>
            <pre v-if="Object.keys(selectedEvent.metadata).length > 0" class="detail-json">{{ JSON.stringify(selectedEvent.metadata, null, 2) }}</pre>
          </div>
        </ion-content>
      </ion-modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonButton,
  IonIcon,
  IonSpinner,
  IonSearchbar,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  toastController,
} from '@ionic/vue';
import { refreshOutline, listOutline } from 'ionicons/icons';
import { adminApiService, type ObservabilityEvent } from '@/services/admin-api.service';
import { useObservabilityStore } from '@/stores/observability.store';

const PAGE_SIZE = 50;

const store = useObservabilityStore();
const loading = ref(false);
const loadingMore = ref(false);
const events = ref<ObservabilityEvent[]>([]);
const searchQuery = ref('');
const filterProduct = ref('');
const filterSeverity = ref<'' | 'info' | 'warn' | 'error'>('');
const selectedEvent = ref<ObservabilityEvent | null>(null);
const hasMore = ref(true);
const offset = ref(0);

const allProducts = ref<string[]>([]);
const productOptions = computed(() => allProducts.value);

const truncate = (text: string, max: number) =>
  text.length > max ? text.substring(0, max) + '...' : text;

const formatTime = (dateStr: string) => new Date(dateStr).toLocaleString();

const buildQuery = () => ({
  product: filterProduct.value || undefined,
  severity: (filterSeverity.value || undefined) as 'info' | 'warn' | 'error' | undefined,
  search: searchQuery.value || undefined,
  limit: PAGE_SIZE,
  offset: 0,
});

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  offset.value = 0;
  hasMore.value = true;
  try {
    const data = await adminApiService.getObservabilityEvents(buildQuery());
    events.value = data;
    store.setEvents(data);
    hasMore.value = data.length === PAGE_SIZE;
    // Collect product names for filter
    const products = [...new Set(data.map((e) => e.product))].sort();
    products.forEach((p) => {
      if (!allProducts.value.includes(p)) allProducts.value.push(p);
    });
  } catch (_err) {
    const msg = 'Failed to load events';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

const onSearch = () => {
  fetchData();
};

const loadMore = async () => {
  loadingMore.value = true;
  const nextOffset = events.value.length;
  try {
    const data = await adminApiService.getObservabilityEvents({
      ...buildQuery(),
      offset: nextOffset,
    });
    events.value.push(...data);
    hasMore.value = data.length === PAGE_SIZE;
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to load more events',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loadingMore.value = false;
  }
};

const selectEvent = (event: ObservabilityEvent) => {
  selectedEvent.value = event;
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
  gap: 1rem;
}

.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.filter-select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  background: var(--ion-item-background, white);
  font-size: 0.9rem;
  color: var(--ion-text-color, #333);
  cursor: pointer;
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.88rem;
  color: var(--ion-text-color);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.clickable-row:hover {
  background: var(--ion-color-light-tint);
}

.mono {
  font-family: monospace;
  font-size: 0.82rem;
}

.time-cell {
  white-space: nowrap;
}

.type-cell {
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.severity-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.severity-info {
  background: rgba(59, 130, 246, 0.15);
  color: var(--ion-color-primary, #2c4a7c);
}

.severity-warn {
  background: rgba(245, 127, 23, 0.15);
  color: #f57f17;
}

.severity-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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

.load-more {
  text-align: center;
  padding: 1rem;
}

/* Event detail modal */
.event-detail {
  padding: 0.5rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  gap: 1rem;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  font-weight: 500;
  color: var(--dark-text-muted, #666);
  flex-shrink: 0;
  min-width: 100px;
}

.detail-value {
  color: var(--ion-text-color, #333);
  text-align: right;
  word-break: break-all;
}

.detail-section-header {
  margin: 1rem 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-message {
  background: var(--ion-color-light);
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.detail-json {
  background: var(--ion-color-light);
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.82rem;
  overflow-x: auto;
  margin: 0;
}
</style>
