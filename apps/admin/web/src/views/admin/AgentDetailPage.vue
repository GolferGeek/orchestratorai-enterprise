<template>
  <div class="detail-view">
    <div class="detail-header">
      <div class="header-left">
        <ion-button fill="clear" size="small" @click="goBack">
          <ion-icon :icon="arrowBackOutline" slot="icon-only" />
        </ion-button>
        <h2>{{ agent?.displayName || slug }}</h2>
      </div>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body" v-if="agent">
      <!-- Overview Cards -->
      <div class="cards-row">
        <div class="info-card">
          <div class="card-label">Status</div>
          <span :class="['status-badge', `status-${agent.status}`]">{{ agent.status }}</span>
        </div>
        <div class="info-card">
          <div class="card-label">Product</div>
          <span class="badge badge-product">{{ agent.product }}</span>
        </div>
        <div class="info-card">
          <div class="card-label">Type</div>
          <div class="card-value">{{ agent.agentType }}</div>
        </div>
        <div class="info-card">
          <div class="card-label">Total Requests</div>
          <div class="card-value">{{ agent.requestCount.toLocaleString() }}</div>
        </div>
      </div>

      <!-- Details -->
      <div class="section">
        <h3>Details</h3>
        <div class="detail-row">
          <span class="detail-label">Slug</span>
          <span class="detail-value mono">{{ agent.slug }}</span>
        </div>
        <div class="detail-row" v-if="agent.description">
          <span class="detail-label">Description</span>
          <span class="detail-value">{{ agent.description }}</span>
        </div>
        <div class="detail-row" v-if="agent.provider">
          <span class="detail-label">Provider</span>
          <span class="detail-value mono">{{ agent.provider }}</span>
        </div>
        <div class="detail-row" v-if="agent.model">
          <span class="detail-label">Model</span>
          <span class="detail-value mono">{{ agent.model }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Active</span>
          <span class="detail-value">{{ agent.lastActiveAt ? formatDate(agent.lastActiveAt) : 'Never' }}</span>
        </div>
      </div>

      <!-- Configuration -->
      <div class="section" v-if="Object.keys(agent.configuration).length > 0">
        <h3>Configuration</h3>
        <pre class="json-block">{{ JSON.stringify(agent.configuration, null, 2) }}</pre>
      </div>

      <!-- Usage by Org -->
      <div class="section" v-if="agent.usageByOrg.length > 0">
        <h3>Usage by Organization</h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Requests</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="usage in agent.usageByOrg" :key="usage.orgSlug">
                <td class="mono">{{ usage.orgSlug }}</td>
                <td>{{ usage.requestCount.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Errors -->
      <div class="section" v-if="agent.recentErrors.length > 0">
        <h3>Recent Errors</h3>
        <div class="error-list">
          <div v-for="(err, idx) in agent.recentErrors" :key="idx" class="error-item">
            {{ err }}
          </div>
        </div>
      </div>
    </div>

    <div class="loading-state" v-else-if="loading">
      <ion-spinner />
      <p>Loading agent details...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue';
import { refreshOutline, arrowBackOutline } from 'ionicons/icons';
import { adminApiService, type AgentDetail } from '@/services/admin-api.service';
import { useAgentsAdminStore } from '@/stores/agents-admin.store';

const route = useRoute();
const router = useRouter();
const store = useAgentsAdminStore();

const slug = route.params.slug as string;
const loading = ref(false);
const agent = ref<AgentDetail | null>(null);

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  try {
    const data = await adminApiService.getAgentDetail(slug);
    agent.value = data;
    store.setSelectedAgent(data);
  } catch (_err) {
    const toast = await toastController.create({
      message: 'Failed to load agent details',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

const goBack = () => {
  router.push('/app/admin/agents');
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

.header-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
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

.info-card {
  background: var(--ion-card-background, white);
  border: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 10px;
  padding: 1rem 1.25rem;
  min-width: 120px;
}

.card-label {
  font-size: 0.75rem;
  color: var(--dark-text-muted, #777);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.4rem;
}

.card-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
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
}

.detail-value {
  color: var(--ion-text-color, #333);
  text-align: right;
}

.mono {
  font-family: monospace;
  font-size: 0.85rem;
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

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-inactive {
  background: var(--ion-color-light, #f5f5f5);
  color: var(--dark-text-muted, #555);
}

.status-error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.json-block {
  background: var(--ion-color-light);
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  overflow-x: auto;
  margin: 0;
}

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
  padding: 0.6rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--dark-text-muted, #555);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
}

.data-table td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.9rem;
  color: var(--ion-text-color);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.error-item {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
  padding: 0.5rem 0.75rem;
  border-radius: 0 4px 4px 0;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #555);
  font-family: monospace;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  color: var(--dark-text-muted, #888);
}
</style>
