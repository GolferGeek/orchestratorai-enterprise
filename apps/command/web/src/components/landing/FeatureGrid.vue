<template>
  <section class="features-section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">Platform Capabilities</span>
        <h2 class="section-heading">Built for Enterprise from Day One</h2>
        <p class="section-sub">
          Security, observability, and multi-tenancy are not afterthoughts.
          They are the foundation everything else is built on.
        </p>
      </div>

      <div class="features-grid">
        <div v-for="feature in features" :key="feature.title" class="feature-card">
          <span class="feature-icon">{{ feature.icon }}</span>
          <h3 class="feature-title">{{ feature.title }}</h3>
          <p class="feature-desc">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { platformFeatures as features } from '@/data/landingConfig';
</script>

<style scoped>
.features-section {
  padding: 6rem 0;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
}

.section-header {
  text-align: center;
  margin-bottom: 4rem;
}

.section-header .section-sub {
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.feature-card {
  padding: 2rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  transition: var(--transition);
}

.feature-card:hover {
  border-color: var(--border-active);
  background: var(--bg-card-hover);
  transform: translateY(-2px);
}

.feature-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 1rem;
}

.feature-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.6rem;
}

.feature-desc {
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
