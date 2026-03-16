<template>
  <ion-menu content-id="main-content" type="overlay">
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>OrchestratorAI</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-list-header>
          <ion-label>Products</ion-label>
        </ion-list-header>

        <template v-if="accessibleProducts.length === 0 && !isLoading">
          <ion-item>
            <ion-label color="medium">No products available</ion-label>
          </ion-item>
        </template>

        <ion-item
          v-for="product in accessibleProducts"
          :key="product.productSlug"
          :href="getProductUrl(product)"
          target="_self"
          button
          detail
        >
          <ion-icon :icon="getIcon(product.icon)" slot="start"></ion-icon>
          <ion-label>{{ product.productName }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>Account</ion-label>
        </ion-list-header>

        <ion-item v-if="user" lines="none">
          <ion-icon :icon="personOutline" slot="start"></ion-icon>
          <ion-label>
            <h3>{{ user.displayName || user.email }}</h3>
            <p>{{ currentOrganization || 'No organization' }}</p>
          </ion-label>
        </ion-item>

        <ion-item button detail @click="handleLogout">
          <ion-icon :icon="logOutOutline" slot="start" color="danger"></ion-icon>
          <ion-label color="danger">Sign out</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-menu>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonIcon,
  menuController,
} from '@ionic/vue';
import {
  personOutline,
  logOutOutline,
  hammerOutline,
  layersOutline,
  gitBranchOutline,
  settingsOutline,
  pulseOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { storeToRefs } from 'pinia';
import { useEntitlementsStore } from '@/stores/entitlementsStore';
import { useRbacStore } from '@/stores/rbacStore';
import { entitlementsService } from '@/services/entitlementsService';

const router = useRouter();
const entitlementsStore = useEntitlementsStore();
const rbacStore = useRbacStore();

const { accessibleProducts, isLoading } = storeToRefs(entitlementsStore);
const { user, currentOrganization } = storeToRefs(rbacStore);

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

async function handleLogout(): Promise<void> {
  await menuController.close();
  await rbacStore.logout();
  router.push('/login');
}
</script>
