<template>
  <ModulePage>
  <section class="module-surface module-home">
    <header class="module-header">
      <p class="module-kicker">admin:settings</p>
      <h1>Admin</h1>
      <p class="module-summary">
        Organization, user, role, and entitlement management for the unified platform.
      </p>
    </header>

    <div class="module-grid">
      <RouterLink
        v-for="item in adminModuleRoutes"
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
  </ModulePage>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { IonIcon } from '@ionic/vue';
import ModulePage from '@/shared/layout/ModulePage.vue';
import { adminModuleRoutes } from './routes';
</script>
