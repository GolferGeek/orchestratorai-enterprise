<template>
  <IonPage>
    <IonContent>
      <div class="dashboard">
        <div class="dashboard__header">
          <h1 class="dashboard__title">Welcome, {{ displayName }}</h1>
          <p class="dashboard__subtitle">Select a product to get started.</p>
        </div>

        <ProductLauncher />
      </div>
    </IonContent>
  </IonPage>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { IonPage, IonContent } from '@ionic/vue';
import { useRbacStore } from '@/stores/rbacStore';
import ProductLauncher from '@/components/product-launcher/ProductLauncher.vue';

const rbacStore = useRbacStore();
const { user } = storeToRefs(rbacStore);

const displayName = computed(() =>
  user.value?.displayName || user.value?.email || 'there'
);
</script>

<style scoped>
ion-content {
  --background: var(--oai-bg-page, #0f172a);
}

.dashboard {
  max-width: 1200px;
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
</style>
