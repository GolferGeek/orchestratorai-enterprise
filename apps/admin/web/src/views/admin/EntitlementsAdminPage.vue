<template>
  <ion-page>
  <div class="detail-view">
    <div class="detail-header">
      <h2>Entitlements</h2>
      <div class="header-actions">
        <ion-button fill="clear" size="small" @click="refreshData" :disabled="loading">
          <ion-icon :icon="refreshOutline" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <div class="detail-body">
      <!-- Org Selector -->
      <div class="org-selector-bar">
        <ion-label>Organization:</ion-label>
        <ion-select
          :key="`org-select-${orgs.length}`"
          :value="selectedOrgSlug"
          @ionChange="onOrgChange($event)"
          placeholder="Select organization..."
          interface="popover"
        >
          <ion-select-option v-for="org in orgs" :key="org.slug" :value="org.slug">
            {{ org.name }}
          </ion-select-option>
        </ion-select>
      </div>

      <div v-if="!selectedOrgSlug" class="empty-state">
        <ion-icon :icon="businessOutline" />
        <h3>Select an Organization</h3>
        <p>Choose an organization to manage its product entitlements.</p>
      </div>

      <template v-else>
        <!-- Stats Banner -->
        <div class="stats-banner">
          <div class="stat">
            <span class="stat-value">{{ grantedProducts.length }}</span>
            <span class="stat-label">Granted Products</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ ALL_PRODUCTS.length - grantedProducts.length }}</span>
            <span class="stat-label">Not Granted</span>
          </div>
        </div>

        <!-- Products Grid -->
        <div class="products-grid">
          <div
            v-for="product in ALL_PRODUCTS"
            :key="product.id"
            class="product-card"
            :class="{ granted: isGranted(product.id) }"
          >
            <div class="product-header">
              <ion-icon :icon="product.icon" class="product-icon" />
              <div class="product-info">
                <h3>{{ product.name }}</h3>
                <p>{{ product.description }}</p>
              </div>
              <ion-toggle
                :checked="isGranted(product.id)"
                :disabled="toggling === product.id"
                @ionChange="onToggle(product.id, $event)"
              />
            </div>
            <div class="product-status" v-if="isGranted(product.id)">
              <ion-icon :icon="checkmarkCircleOutline" color="success" />
              <span class="granted-text">Granted</span>
            </div>
            <div class="product-status" v-else>
              <ion-icon :icon="closeCircleOutline" color="medium" />
              <span class="not-granted-text">Not granted</span>
            </div>
          </div>
        </div>
      </template>

      <ion-loading :is-open="loading" message="Loading entitlements..." />
    </div>
  </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  IonButton,
  IonIcon,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonLoading,
  toastController,
  IonPage,
} from '@ionic/vue';
import {
  refreshOutline,
  businessOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  flashOutline,
  constructOutline,
  gitNetworkOutline,
  pulseOutline,
  linkOutline,
  personOutline,
} from 'ionicons/icons';
import { authApiService, type Entitlement } from '@/services/auth-api.service';
import { useOrgsStore } from '@/stores/orgs.store';

interface Product {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const ALL_PRODUCTS: Product[] = [
  { id: 'forge', name: 'Forge', description: 'Complex agent dashboards and LangGraph workflows', icon: flashOutline },
  { id: 'compose', name: 'Compose', description: 'Simple composable agents (context, RAG, API, media)', icon: constructOutline },
  { id: 'pulse', name: 'Pulse', description: 'Internal ambient automation — event-driven watchers', icon: pulseOutline },
  { id: 'bridge', name: 'Bridge', description: 'External A2A communication — inbound/outbound', icon: linkOutline },
  { id: 'assistant', name: 'Assistant', description: 'Personal AI assistant', icon: personOutline },
];

const orgsStore = useOrgsStore();
const orgs = computed(() => orgsStore.sortedOrgs);

const selectedOrgSlug = ref<string | null>(null);
const entitlements = ref<Entitlement[]>([]);
const loading = ref(false);
const toggling = ref<string | null>(null);

const grantedProducts = computed(() =>
  entitlements.value.map((e) => e.product),
);

function isGranted(product: string): boolean {
  return grantedProducts.value.includes(product);
}

const onOrgChange = (event: CustomEvent) => {
  selectedOrgSlug.value = event.detail.value;
};

watch(selectedOrgSlug, (slug) => {
  if (slug) {
    fetchEntitlements(slug);
  } else {
    entitlements.value = [];
  }
});

const fetchEntitlements = async (orgSlug: string) => {
  loading.value = true;
  try {
    entitlements.value = await authApiService.listEntitlements(orgSlug);
  } catch (error) {
    console.error('Failed to fetch entitlements:', error);
    entitlements.value = [];
    const toast = await toastController.create({
      message: 'Failed to load entitlements',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    loading.value = false;
  }
};

const onToggle = async (product: string, event: CustomEvent) => {
  if (!selectedOrgSlug.value) return;
  const shouldGrant = event.detail.checked;
  toggling.value = product;
  try {
    if (shouldGrant) {
      const granted = await authApiService.grantEntitlement(selectedOrgSlug.value, { product });
      entitlements.value.push(granted);
      const toast = await toastController.create({
        message: `${product} access granted`,
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } else {
      await authApiService.revokeEntitlement(selectedOrgSlug.value, product);
      entitlements.value = entitlements.value.filter((e) => e.product !== product);
      const toast = await toastController.create({
        message: `${product} access revoked`,
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
    }
  } catch (error) {
    console.error('Failed to update entitlement:', error);
    // Revert the toggle by re-fetching
    if (selectedOrgSlug.value) {
      await fetchEntitlements(selectedOrgSlug.value);
    }
    const toast = await toastController.create({
      message: 'Failed to update entitlement',
      duration: 3000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    toggling.value = null;
  }
};

const refreshData = () => {
  if (selectedOrgSlug.value) {
    fetchEntitlements(selectedOrgSlug.value);
  }
};

onMounted(async () => {
  // Load orgs only when the store is empty.
  // Use the statically-imported authApiService — do NOT use a dynamic import
  // here; under Vite HMR, dynamic re-imports of the same module can yield a
  // second singleton instance, causing the store to receive a write from a
  // stale reference and triggering Ionic's ion-select to render options twice.
  if (orgsStore.orgs.length === 0) {
    try {
      const list = await authApiService.listOrgs();
      orgsStore.setOrgs(list);
    } catch (err) {
      console.error('Failed to load orgs for entitlements:', err);
    }
  }
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

.org-selector-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid var(--ion-color-light-shade);
}

.org-selector-bar ion-label {
  font-weight: 600;
  white-space: nowrap;
  color: var(--dark-text-muted, #555);
}

.org-selector-bar ion-select {
  flex: 1;
  --placeholder-color: var(--ion-color-medium);
}

.stats-banner {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #3a7bd5 0%, #1a4fa0 100%);
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

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.product-card {
  background: var(--ion-card-background, white);
  border: 2px solid var(--ion-border-color, var(--ion-color-light-shade));
  border-radius: 12px;
  padding: 1rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.product-card.granted {
  border-color: var(--ion-color-success);
  box-shadow: 0 2px 8px rgba(45, 211, 111, 0.15);
}

.product-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.product-icon {
  font-size: 1.75rem;
  color: var(--ion-color-primary);
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.product-info {
  flex: 1;
}

.product-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-text-color, #333);
}

.product-info p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--dark-text-muted, #777);
  line-height: 1.4;
}

.product-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.granted-text {
  color: var(--ion-color-success);
}

.not-granted-text {
  color: var(--ion-color-medium);
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
</style>
