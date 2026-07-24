<template>
  <ModulePage>
  <section class="settings-detail">
    <header class="settings-detail__header">
      <div>
        <p class="module-kicker">admin:settings</p>
        <h1>System Health</h1>
      </div>
      <ion-button fill="clear" size="small" :disabled="loading" @click="fetchData">
        <ion-icon :icon="refreshOutline" slot="icon-only" />
      </ion-button>
    </header>

    <div v-if="loading" class="settings-health-state">
      <ion-spinner />
      <p>Checking system health...</p>
    </div>

    <div v-else-if="errorMessage" class="settings-health-state settings-health-state--error">
      <ion-icon :icon="closeCircleOutline" />
      <h2>Health Check Failed</h2>
      <p>{{ errorMessage }}</p>
    </div>

    <template v-else-if="report">
      <div :class="['health-banner', `health-banner--${report.overallStatus}`]">
        <ion-icon :icon="checkmarkCircleOutline" class="health-banner__icon" />
        <div>
          <div class="health-banner__label">System Status</div>
          <div class="health-banner__status">{{ report.overallStatus.toUpperCase() }}</div>
        </div>
        <div class="health-banner__time">Checked {{ formatTime(report.checkedAt) }}</div>
      </div>

      <div class="health-services">
        <div v-for="service in report.services" :key="service.service" class="health-service">
          <div class="health-service__header">
            <span class="health-service__name">{{ service.displayName }}</span>
            <span :class="['health-service__dot', `health-service__dot--${service.status}`]" />
          </div>
          <div class="health-service__row">
            <span class="health-service__label">{{ service.apiPrefix }}</span>
            <span :class="['health-service__pill', `health-service__pill--${service.status}`]">
              {{ service.status }}
            </span>
          </div>
          <div class="health-service__response">{{ service.responseTimeMs }}ms</div>
          <div class="health-service__message">{{ service.message }}</div>
        </div>
      </div>
    </template>
  </section>
  </ModulePage>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue';
import ModulePage from '@/shared/layout/ModulePage.vue';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  refreshOutline,
} from 'ionicons/icons';
import {
  systemHealthService,
  type PlatformHealthReport,
} from './services/systemHealthService';

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const report = ref<PlatformHealthReport | null>(null);

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

async function fetchData(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;

  try {
    report.value = await systemHealthService.getSystemHealth();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'System health request failed.';
    report.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchData();
});
</script>
