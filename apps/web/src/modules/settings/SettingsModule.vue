<template>
  <SystemHealthPage v-if="route.path === '/app/settings/system/health'" />
  <section v-else class="module-surface module-home">
    <header class="module-header">
      <p class="module-kicker">settings:read</p>
      <h1>Settings</h1>
      <p class="module-summary">
        System configuration, model operations, observability, and infrastructure controls.
      </p>
    </header>

    <div class="module-grid">
      <RouterLink
        v-for="item in settingsModuleRoutes"
        :key="item.path"
        :to="item.path"
        class="module-card"
      >
        <span class="module-card__icon">
          <IonIcon :icon="item.icon" />
        </span>
        <span class="module-card__body">
          <span class="module-card__title">{{ item.label }}</span>
          <span class="module-card__description">{{ item.description }}</span>
          <span class="module-card__meta">{{ item.apiPrefix }}</span>
        </span>
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { IonIcon } from '@ionic/vue';
import { settingsModuleRoutes } from './routes';
import SystemHealthPage from './SystemHealthPage.vue';

const route = useRoute();
</script>
