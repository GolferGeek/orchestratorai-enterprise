<template>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Agent Registry</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="fetchData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <div class="stats-banner" v-if="agents.length > 0">
        <div class="stat">
          <span class="stat-value">{{ agents.length }}</span>
          <span class="stat-label">Total Agents</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ activeCount }}</span>
          <span class="stat-label">Active</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ productCount }}</span>
          <span class="stat-label">Products</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Search agents..."
          :debounce="300"
          style="max-width: 400px;"
        />
        <select v-model="filterProduct" class="filter-select">
          <option value="">All Products</option>
          <option v-for="p in productOptions" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterStatus" class="filter-select">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div class="table-container" v-if="!loading">
        <table class="data-table">
          <thead>
            <tr>
              <th>Slug</th>
              <th>Display Name</th>
              <th>Product</th>
              <th>Type</th>
              <th>Provider/Model</th>
              <th>Requests</th>
              <th>Last Active</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="agent in filteredAgents"
              :key="agent.slug"
              class="clickable-row"
              @click="navigateToDetail(agent.slug)"
            >
              <td class="mono">{{ agent.slug }}</td>
              <td>{{ agent.displayName }}</td>
              <td><span class="badge badge-product">{{ agent.product }}</span></td>
              <td>{{ agent.agentType }}</td>
              <td class="mono">{{ agent.provider ? `${agent.provider}/${agent.model}` : '-' }}</td>
              <td>{{ agent.requestCount.toLocaleString() }}</td>
              <td>{{ agent.lastActiveAt ? formatDate(agent.lastActiveAt) : '-' }}</td>
              <td>
                <span :class="['status-badge', `status-${agent.status}`]">{{ agent.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="empty-state" v-if="!loading && filteredAgents.length === 0">
        <ion-icon :icon="cogOutline" />
        <h3>No Agents Found</h3>
        <p>Registered agents will appear here.</p>
      </div>

      <div class="loading-state" v-if="loading">
        <ion-spinner />
        <p>Loading agents...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { IonButton, IonIcon, IonSpinner, IonSearchbar, toastController } from '@ionic/vue';
import { refreshOutline, cogOutline } from 'ionicons/icons';
import { adminApiService, type AgentRegistryEntry } from '@/services/admin-api.service';
import { useAgentsAdminStore } from '@/stores/agents-admin.store';

const router = useRouter();
const store = useAgentsAdminStore();
const loading = ref(false);
const agents = ref<AgentRegistryEntry[]>([]);
const searchQuery = ref('');
const filterProduct = ref('');
const filterStatus = ref('');

const productOptions = computed(() => [...new Set(agents.value.map((a) => a.product))].sort());

const activeCount = computed(() => agents.value.filter((a) => a.status === 'active').length);
const productCount = computed(() => new Set(agents.value.map((a) => a.product)).size);

const filteredAgents = computed(() => {
  return agents.value.filter((agent) => {
    if (filterProduct.value && agent.product !== filterProduct.value) return false;
    if (filterStatus.value && agent.status !== filterStatus.value) return false;
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      return (
        agent.slug.toLowerCase().includes(q) ||
        agent.displayName.toLowerCase().includes(q) ||
        agent.agentType.toLowerCase().includes(q)
      );
    }
    return true;
  });
});

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

const fetchData = async () => {
  loading.value = true;
  store.setLoading(true);
  store.setError(null);
  try {
    const data = await adminApiService.getAgents();
    agents.value = data;
    store.setAgents(data);
  } catch (_err) {
    const msg = 'Failed to load agent registry';
    store.setError(msg);
    const toast = await toastController.create({ message: msg, duration: 3000, color: 'danger' });
    await toast.present();
  } finally {
    loading.value = false;
    store.setLoading(false);
  }
};

const navigateToDetail = (slug: string) => {
  router.push(`/app/admin/agents/${slug}`);
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
}

.stats-banner {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #e65100 0%, #bf360c 100%);
  border-radius: 10px;
  margin-bottom: 1.5rem;
  color: white;
}

.stats-banner .stat {
  text-align: center;
}

.stats-banner .stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
}

.stats-banner .stat-label {
  font-size: 0.8rem;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
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
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, var(--ion-color-light-shade));
  font-size: 0.9rem;
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
