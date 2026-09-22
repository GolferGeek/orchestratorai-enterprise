<template>
  <ion-page>
    <div class="detail-view">
      <div class="detail-header">
        <h2>Pseudonym Mappings</h2>
        <div class="header-actions">
          <ion-button fill="clear" size="small" :disabled="loading" @click="fetchData">
            <ion-icon :icon="refreshOutline" slot="icon-only" />
          </ion-button>
        </div>
      </div>

      <div class="detail-body">
        <div v-if="loading" class="loading-state">
          <ion-spinner />
          <p>Loading mappings...</p>
        </div>

        <div v-else class="page-content">
          <p class="page-note">
            Pseudonyms issued by the hash-based pseudonymizer, so the same value
            always gets the same stand-in. The source value is never written to
            this table — only its SHA-256 — which is why the first column shows
            a hash rather than what it stands for.
          </p>

          <div class="stats-banner">
            <div class="stat">
              <span class="stat-value">{{ total }}</span>
              <span class="stat-label">Mappings</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ dataTypeCount }}</span>
              <span class="stat-label">Data types</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ totalUsage }}</span>
              <span class="stat-label">Total uses</span>
            </div>
          </div>

          <div class="filter-row">
            <ion-select
              v-model="dataTypeFilter"
              label="Data type"
              label-placement="stacked"
              interface="popover"
              @ion-change="reload"
            >
              <ion-select-option value="all">All</ion-select-option>
              <ion-select-option v-for="t in dataTypeOptions" :key="t" :value="t">
                {{ t }}
              </ion-select-option>
            </ion-select>
            <ion-input
              v-model="contextFilter"
              label="Context"
              label-placement="stacked"
              placeholder="Filter by context"
              @ion-change="reload"
            />
          </div>

          <div v-if="mappings.length === 0" class="empty-state">
            <ion-icon :icon="swapHorizontalOutline" />
            <h3>No mappings yet</h3>
            <p>
              Rows appear here once the hash-based pseudonymizer issues its first
              stand-in. Dictionary-based pseudonyms are managed on the
              Dictionary page instead.
            </p>
          </div>

          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Original (hashed)</th>
                  <th>Pseudonym</th>
                  <th>Data Type</th>
                  <th>Context</th>
                  <th>Uses</th>
                  <th>First Issued</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="mapping in mappings" :key="mapping.id">
                  <td class="mono hash-cell" :title="mapping.originalHash">
                    {{ mapping.originalHash.slice(0, 16) }}…
                  </td>
                  <td class="mono">{{ mapping.pseudonym }}</td>
                  <td class="mono">{{ mapping.dataType }}</td>
                  <td class="muted">{{ mapping.context ?? '—' }}</td>
                  <td class="mono">{{ mapping.usageCount }}</td>
                  <td class="muted">{{ formatDate(mapping.createdAt) }}</td>
                  <td class="muted">{{ formatDate(mapping.lastUsedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="total > pageSize" class="pagination">
            <ion-button
              fill="outline"
              size="small"
              :disabled="offset === 0"
              @click="prevPage"
            >
              Previous
            </ion-button>
            <span class="page-info">
              {{ offset + 1 }}–{{ Math.min(offset + pageSize, total) }} of {{ total }}
            </span>
            <ion-button
              fill="outline"
              size="small"
              :disabled="offset + pageSize >= total"
              @click="nextPage"
            >
              Next
            </ion-button>
          </div>
        </div>
      </div>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  IonPage,
  IonButton,
  IonIcon,
  IonSpinner,
  IonInput,
  IonSelect,
  IonSelectOption,
  toastController,
} from '@ionic/vue';
import { refreshOutline, swapHorizontalOutline } from 'ionicons/icons';
import {
  privacyApiService,
  type PrivacyMapping,
} from '../../services/privacy-api.service';

const pageSize = 50;

const loading = ref(false);
const mappings = ref<PrivacyMapping[]>([]);
const total = ref(0);
const offset = ref(0);
const dataTypeFilter = ref('all');
const contextFilter = ref('');

const dataTypeOptions = computed(() =>
  [...new Set(mappings.value.map((m) => m.dataType))].sort(),
);
const dataTypeCount = computed(() => dataTypeOptions.value.length);
const totalUsage = computed(() =>
  mappings.value.reduce((sum, m) => sum + m.usageCount, 0),
);

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

const fetchData = async () => {
  loading.value = true;
  try {
    const res = await privacyApiService.listMappings({
      dataType: dataTypeFilter.value,
      context: contextFilter.value.trim() || undefined,
      limit: pageSize,
      offset: offset.value,
    });
    mappings.value = res.mappings;
    total.value = res.total;
  } catch (error) {
    const toast = await toastController.create({
      message: error instanceof Error ? error.message : 'Failed to load mappings',
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
};

/** Filters change the result set, so go back to the first page. */
const reload = async () => {
  offset.value = 0;
  await fetchData();
};

const nextPage = async () => {
  offset.value += pageSize;
  await fetchData();
};

const prevPage = async () => {
  offset.value = Math.max(0, offset.value - pageSize);
  await fetchData();
};

onMounted(fetchData);
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

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.page-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.page-note {
  margin: 0;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #888);
}

.stats-banner {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #4a6fa1 0%, #2c4a7c 100%);
  border-radius: 8px;
  color: white;
}

.stats-banner .stat {
  text-align: center;
  flex: 1;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.7rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 0.75rem;
  align-items: end;
}

.table-container {
  background: var(--ion-card-background, white);
  border-radius: 10px;
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  overflow-x: auto;
}

.data-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.85rem;
  color: var(--ion-text-color);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.hash-cell {
  color: var(--dark-text-muted, #888);
}

.muted {
  color: var(--dark-text-muted, #888);
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.empty-state h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.empty-state p {
  margin: 0;
  max-width: 34rem;
  font-size: 0.85rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.page-info {
  font-size: 0.8rem;
  color: var(--dark-text-muted, #888);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--ion-color-medium);
}

@media (max-width: 768px) {
  .filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
