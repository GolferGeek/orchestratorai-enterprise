<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Database Admin</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading database info...</p>
      </div>

      <div class="content-area" v-else>
        <!-- Connection status banner -->
        <div class="status-banner" :class="['healthy', 'ok'].includes(health?.status) ? 'banner-healthy' : 'banner-error'">
          <ion-icon :icon="['healthy', 'ok'].includes(health?.status) ? checkmarkCircleOutline : alertCircleOutline" class="banner-icon" />
          <div class="banner-text">
            <span class="banner-title">{{ ['healthy', 'ok'].includes(health?.status) ? 'Connected' : 'Connection Error' }}</span>
            <span class="banner-message">{{ health?.message ?? 'Unknown status' }}</span>
          </div>
          <span class="banner-provider">{{ config?.provider ?? '—' }}</span>
        </div>

        <!-- Stats row -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">{{ tables.length }}</span>
            <span class="stat-label">Tables</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ migrations.length }}</span>
            <span class="stat-label">Migrations</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ config?.schemas?.length ?? 0 }}</span>
            <span class="stat-label">Schemas</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ totalRows }}</span>
            <span class="stat-label">Total Rows</span>
          </div>
        </div>

        <!-- Config card -->
        <div class="section-card" v-if="config">
          <h4 class="section-title">Connection Configuration</h4>
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">Provider</span>
              <span class="info-value">{{ config.provider }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">URL</span>
              <span class="info-value mono">{{ maskedUrl(config.url) }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Schemas</span>
              <span class="info-value">
                <ion-badge v-for="schema in config.schemas" :key="schema" color="medium" class="schema-badge">
                  {{ schema }}
                </ion-badge>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Clients</span>
              <span class="info-value">
                <ion-badge :color="config.clientsAvailable.service ? 'success' : 'danger'" class="schema-badge">
                  service: {{ config.clientsAvailable.service ? 'yes' : 'no' }}
                </ion-badge>
                <ion-badge :color="config.clientsAvailable.anon ? 'success' : 'medium'" class="schema-badge">
                  anon: {{ config.clientsAvailable.anon ? 'yes' : 'no' }}
                </ion-badge>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Checked At</span>
              <span class="info-value">{{ formatDateTime(config.checkedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Tables list -->
        <div class="section-card">
          <div class="section-title-row">
            <h4 class="section-title">Tables</h4>
            <ion-searchbar
              v-model="tableSearch"
              placeholder="Filter tables..."
              mode="md"
              class="table-search"
            />
          </div>
          <div class="empty-state small" v-if="filteredTables.length === 0">
            <p>{{ tableSearch ? 'No tables match your filter.' : 'No tables found.' }}</p>
          </div>
          <div class="table-container" v-else>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Schema</th>
                  <th>Table</th>
                  <th class="num-col">Rows</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="table in filteredTables" :key="`${table.schema}.${table.name}`">
                  <td><span class="schema-tag">{{ table.schema }}</span></td>
                  <td class="mono">{{ table.name }}</td>
                  <td class="num-col">{{ table.rowCount.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent migrations -->
        <div class="section-card">
          <h4 class="section-title">Recent Migrations</h4>
          <div class="empty-state small" v-if="migrations.length === 0">
            <p>No migrations found.</p>
          </div>
          <div class="table-container" v-else>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Migration</th>
                  <th>Executed At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="migration in recentMigrations" :key="migration.name">
                  <td class="mono migration-name">{{ migration.name }}</td>
                  <td>{{ formatDateTime(migration.executedAt) }}</td>
                  <td>
                    <span :class="['status-badge', migration.success ? 'status-active' : 'status-inactive']">
                      {{ migration.success ? 'Success' : 'Failed' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonButton, IonIcon, IonSpinner, IonBadge, IonSearchbar,
  toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline, checkmarkCircleOutline, alertCircleOutline,
} from 'ionicons/icons';
import {
  adminApiService,
  type DatabaseHealth,
  type DatabaseConfig,
  type DatabaseTable,
  type DatabaseMigration,
} from '@/services/admin-api.service';

const loading = ref(false);
const health = ref<DatabaseHealth | null>(null);
const config = ref<DatabaseConfig | null>(null);
const tables = ref<DatabaseTable[]>([]);
const migrations = ref<DatabaseMigration[]>([]);
const tableSearch = ref('');

const totalRows = computed(() => {
  const sum = tables.value.reduce((acc, t) => acc + t.rowCount, 0);
  if (sum >= 1000000) return `${(sum / 1000000).toFixed(1)}M`;
  if (sum >= 1000) return `${(sum / 1000).toFixed(1)}k`;
  return sum.toLocaleString();
});

const filteredTables = computed(() => {
  const q = tableSearch.value.toLowerCase().trim();
  if (!q) return tables.value;
  return tables.value.filter(
    (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q),
  );
});

const recentMigrations = computed(() => migrations.value.slice(0, 50));

function maskedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url.replace(/:([^@/]+)@/, ':***@');
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

async function fetchData(): Promise<void> {
  loading.value = true;
  try {
    const [healthResult, configResult, tablesResult, migrationsResult] = await Promise.allSettled([
      adminApiService.getDatabaseHealth(),
      adminApiService.getDatabaseConfig(),
      adminApiService.getDatabaseTables(),
      adminApiService.getDatabaseMigrations(),
    ]);

    if (healthResult.status === 'fulfilled') {
      health.value = healthResult.value;
    } else {
      const toast = await toastController.create({ message: 'Failed to load database health', duration: 3000, color: 'danger' });
      await toast.present();
    }

    if (configResult.status === 'fulfilled') {
      config.value = configResult.value;
    } else {
      const toast = await toastController.create({ message: 'Failed to load database config', duration: 3000, color: 'danger' });
      await toast.present();
    }

    if (tablesResult.status === 'fulfilled') {
      tables.value = tablesResult.value.tables;
    } else {
      const toast = await toastController.create({ message: 'Failed to load tables', duration: 3000, color: 'danger' });
      await toast.present();
    }

    if (migrationsResult.status === 'fulfilled') {
      migrations.value = migrationsResult.value.migrations;
    } else {
      const toast = await toastController.create({ message: 'Failed to load migrations', duration: 3000, color: 'danger' });
      await toast.present();
    }
  } finally {
    loading.value = false;
  }
}

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
}

.content-area {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

/* Status Banner */
.status-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
  border-radius: 8px;
  border: 1px solid transparent;
}

.banner-healthy {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.banner-error {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.banner-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.banner-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.banner-message {
  font-size: 0.8rem;
  opacity: 0.85;
}

.banner-provider {
  font-size: 0.8rem;
  font-family: monospace;
  opacity: 0.8;
  flex-shrink: 0;
}

/* Stats Row */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.stat-card {
  background: var(--ion-card-background, var(--ion-background-color));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ion-color-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Section Cards */
.section-card {
  background: var(--ion-card-background, var(--ion-background-color));
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  padding: 1rem;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dark-text-muted, #888);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-title-row .section-title {
  margin-bottom: 0;
}

.table-search {
  --background: var(--ion-background-color);
  max-width: 280px;
  height: 36px;
  --padding-start: 0.5rem;
}

/* Info Grid */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.info-row {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.info-label {
  width: 100px;
  flex-shrink: 0;
  font-weight: 500;
  color: var(--dark-text-muted, #888);
}

.info-value {
  color: var(--ion-text-color);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.schema-badge {
  font-size: 0.7rem;
  margin-right: 0.25rem;
}

/* Table */
.table-container {
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 8px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--ion-toolbar-background, var(--ion-color-light));
  padding: 0.55rem 0.75rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.82rem;
  color: var(--ion-text-color);
  vertical-align: middle;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.num-col {
  text-align: right;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.schema-tag {
  background: var(--ion-color-step-100, rgba(0, 0, 0, 0.08));
  color: var(--dark-text-muted, #555);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: monospace;
}

.migration-name {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-inactive {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.empty-state.small {
  padding: 1.5rem 1rem;
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
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .section-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .table-search {
    max-width: 100%;
    width: 100%;
  }
}
</style>
