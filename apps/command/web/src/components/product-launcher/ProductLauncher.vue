<template>
  <div class="product-launcher">
    <div v-if="isLoading" class="product-launcher__loading">
      <ion-spinner name="crescent"></ion-spinner>
      <p>Loading products...</p>
    </div>

    <div v-else-if="error" class="product-launcher__error">
      <ion-icon :icon="alertCircleOutline" class="product-launcher__error-icon"></ion-icon>
      <p>{{ error }}</p>
    </div>

    <div v-else class="product-launcher__grid">
      <template v-if="accessibleProducts.length === 0">
        <div class="product-launcher__empty">
          <ion-icon :icon="lockClosedOutline" class="product-launcher__empty-icon"></ion-icon>
          <p>No products are available for your account. Contact your administrator.</p>
        </div>
      </template>

      <a
        v-for="product in accessibleProducts"
        :key="product.productSlug"
        :href="getProductUrl(product)"
        class="product-launcher__card"
        target="_self"
      >
        <div class="product-launcher__card-icon">
          <ion-icon :icon="getIcon(product.icon)"></ion-icon>
        </div>
        <div class="product-launcher__card-content">
          <h3 class="product-launcher__card-title">{{ product.productName }}</h3>
          <p class="product-launcher__card-description">{{ product.description }}</p>
        </div>
        <ion-icon :icon="arrowForwardOutline" class="product-launcher__card-arrow"></ion-icon>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonSpinner, IonIcon } from '@ionic/vue';
import {
  alertCircleOutline,
  lockClosedOutline,
  arrowForwardOutline,
  hammerOutline,
  layersOutline,
  gitBranchOutline,
  settingsOutline,
  pulseOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { entitlementsService } from '@/services/entitlementsService';

const entitlementsStore = useEntitlementsStore();
const { accessibleProducts, isLoading, error } = storeToRefs(entitlementsStore);

const iconMap: Record<string, string> = {
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
};

function getIcon(iconName: string): string {
  return iconMap[iconName] ?? settingsOutline;
}

function getProductUrl(product: { productSlug: string; port: number }): string {
  return entitlementsService.getProductUrl(product as Parameters<typeof entitlementsService.getProductUrl>[0]);
}
</script>

<style scoped>
.product-launcher {
  padding: 24px;
}

.product-launcher__loading,
.product-launcher__error,
.product-launcher__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--ion-color-medium);
  gap: 12px;
  text-align: center;
}

.product-launcher__error-icon,
.product-launcher__empty-icon {
  font-size: 48px;
  color: var(--ion-color-medium);
}

.product-launcher__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.product-launcher__card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--ion-card-background, var(--ion-item-background));
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.product-launcher__card:hover {
  border-color: var(--ion-color-primary);
  box-shadow: 0 4px 16px rgba(var(--ion-color-primary-rgb), 0.15);
}

.product-launcher__card-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary);
  font-size: 24px;
}

.product-launcher__card-content {
  flex: 1;
  min-width: 0;
}

.product-launcher__card-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--ion-text-color);
}

.product-launcher__card-description {
  margin: 0;
  font-size: 13px;
  color: var(--ion-color-medium);
  line-height: 1.4;
}

.product-launcher__card-arrow {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--ion-color-medium);
  transition: transform 0.15s ease;
}

.product-launcher__card:hover .product-launcher__card-arrow {
  transform: translateX(4px);
  color: var(--ion-color-primary);
}
</style>
