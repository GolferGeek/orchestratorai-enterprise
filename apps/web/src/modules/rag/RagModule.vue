<template>
  <ModulePage>
  <section class="module-surface module-home">
    <header class="module-header">
      <p class="module-kicker">rag:read</p>
      <h1>RAG</h1>
      <p class="module-summary">
        Knowledge collections, documents, retrieval metadata, and ingestion status.
      </p>
    </header>

    <div class="module-grid">
      <RouterLink
        v-for="item in ragModuleRoutes"
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
import { ragModuleRoutes } from './routes';
</script>
