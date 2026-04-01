<template>
  <IonPage>
    <IonContent>
      <div class="dashboard">
        <div class="dashboard__header">
          <h1 class="dashboard__title">Welcome, {{ displayName }}</h1>
          <p class="dashboard__subtitle">Your AI platform is ready. Choose where to start.</p>
        </div>

        <div class="dashboard__products">
          <a
            v-for="product in visibleProducts"
            :key="product.productSlug"
            :href="getProductUrl(product)"
            class="product-card"
            target="_self"
          >
            <div class="product-card__header">
              <div class="product-card__icon">
                <ion-icon :icon="getIcon(product.icon)"></ion-icon>
              </div>
              <div class="product-card__titles">
                <h2 class="product-card__name">{{ product.productName }}</h2>
                <span class="product-card__tagline">{{ product.description }}</span>
              </div>
              <ion-icon :icon="arrowForwardOutline" class="product-card__arrow"></ion-icon>
            </div>
            <p class="product-card__body">{{ getFullDescription(product.productSlug) }}</p>
            <ul class="product-card__features">
              <li v-for="feature in getFeatures(product.productSlug)" :key="feature">{{ feature }}</li>
            </ul>
          </a>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { IonPage, IonContent, IonIcon } from '@ionic/vue';
import {
  arrowForwardOutline,
  hammerOutline,
  layersOutline,
  gitBranchOutline,
  settingsOutline,
  pulseOutline,
  swapHorizontalOutline,
  flaskOutline,
  shieldCheckmarkOutline,
  navigateOutline,
} from 'ionicons/icons';
import { useRbacStore } from '@/stores/rbacStore';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { entitlementsService } from '@/services/entitlementsService';
import { useViewMode } from '@/composables/useViewMode';
import { PRODUCT_REGISTRY, type ProductSlug } from '@orchestrator-ai/transport-types';

const rbacStore = useRbacStore();
const { user } = storeToRefs(rbacStore);

const entitlementsStore = useEntitlementsStore();
const { accessibleProducts } = storeToRefs(entitlementsStore);
const { isVisibleInCurrentMode } = useViewMode();

const displayName = computed(() =>
  user.value?.displayName || user.value?.email || 'there'
);

// Standard mode order: Table Stakes (compose) first, then Big Ideas (forge)
const STANDARD_ORDER: string[] = ['compose', 'forge'];

const visibleProducts = computed(() => {
  const filtered = accessibleProducts.value.filter((p) => isVisibleInCurrentMode(p.productSlug));
  return filtered.sort((a, b) => {
    const ai = STANDARD_ORDER.indexOf(a.productSlug);
    const bi = STANDARD_ORDER.indexOf(b.productSlug);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
});

const iconMap: Record<string, string> = {
  'hammer-outline': hammerOutline,
  'layers-outline': layersOutline,
  'git-branch-outline': gitBranchOutline,
  'settings-outline': settingsOutline,
  'pulse-outline': pulseOutline,
  'swap-horizontal-outline': swapHorizontalOutline,
  'flask-outline': flaskOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'navigate-outline': navigateOutline,
};

function getIcon(iconName: string): string {
  return iconMap[iconName] ?? settingsOutline;
}

function getFullDescription(slug: string): string {
  return PRODUCT_REGISTRY[slug as ProductSlug]?.description ?? '';
}

function getFeatures(slug: string): string[] {
  return PRODUCT_REGISTRY[slug as ProductSlug]?.features ?? [];
}

function getProductUrl(product: { productSlug: string; port: number }): string {
  return entitlementsService.getProductUrl(product as Parameters<typeof entitlementsService.getProductUrl>[0]);
}
</script>

<style scoped>
ion-content {
  --background: var(--oai-bg-page, #0f172a);
}

.dashboard {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 16px;
}

.dashboard__header {
  padding: 32px 8px 8px;
}

.dashboard__title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--ion-text-color);
}

.dashboard__subtitle {
  font-size: 16px;
  color: var(--ion-color-medium);
  margin: 0;
}

.dashboard__products {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 0 48px;
}

.product-card {
  display: block;
  padding: 24px;
  background: var(--ion-card-background, var(--ion-item-background));
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.product-card:hover {
  border-color: var(--ion-color-primary);
  box-shadow: 0 4px 16px rgba(var(--ion-color-primary-rgb), 0.15);
}

.product-card__header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.product-card__icon {
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

.product-card__titles {
  flex: 1;
  min-width: 0;
}

.product-card__name {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--ion-text-color);
}

.product-card__tagline {
  font-size: 13px;
  color: var(--ion-color-medium);
}

.product-card__arrow {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--ion-color-medium);
  transition: transform 0.15s ease;
}

.product-card:hover .product-card__arrow {
  transform: translateX(4px);
  color: var(--ion-color-primary);
}

.product-card__body {
  margin: 0 0 16px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--ion-color-medium-shade, #94a3b8);
}

.product-card__features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.product-card__features li {
  font-size: 13px;
  font-weight: 500;
  color: var(--ion-text-color);
  padding-left: 1.25rem;
  position: relative;
  line-height: 1.4;
}

.product-card__features li::before {
  content: '\2713';
  position: absolute;
  left: 0;
  color: #22c55e;
  font-weight: 700;
}
</style>
