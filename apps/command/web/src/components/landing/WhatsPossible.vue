<template>
  <section class="ships-section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">{{ content.sectionLabel }}</span>
        <h2 class="section-headline">{{ content.headline }}</h2>
        <p class="section-sub">{{ content.subheadline }}</p>
      </div>

      <div class="categories-grid">
        <div v-for="cat in content.categories" :key="cat.name" class="category-card">
          <h3 class="category-name">{{ cat.name }}</h3>
          <p class="category-tagline">{{ cat.tagline }}</p>
          <p class="category-desc">{{ cat.description }}</p>
        </div>
      </div>

      <div class="infra-section">
        <h3 class="infra-title">Plus the Infrastructure</h3>
        <div class="infra-pills">
          <span v-for="item in content.infrastructure" :key="item" class="infra-pill">{{ item }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { whatShipsContent } from '@/data/landingConfig';
const content = whatShipsContent;
</script>

<style scoped>
.ships-section {
  padding: 6rem 0;
  background: var(--bg-surface, #0f172a);
  border-top: 1px solid var(--border, #334155);
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.section-header {
  text-align: center;
  margin-bottom: 3.5rem;
}

.section-label {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary-light, #60a5fa);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.75rem;
}

.section-headline {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  font-weight: 800;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
}

.section-sub {
  font-size: 1.05rem;
  color: var(--text-secondary, #94a3b8);
  max-width: 620px;
  margin: 0 auto;
  line-height: 1.7;
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
  margin-bottom: 3rem;
}

@media (max-width: 640px) {
  .categories-grid {
    grid-template-columns: 1fr;
  }
}

.category-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border, #334155);
  border-radius: 12px;
  padding: 2rem;
}

.category-name {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 0.25rem;
}

.category-tagline {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary-light, #60a5fa);
  margin: 0 0 1rem;
}

.category-desc {
  font-size: 0.9rem;
  color: var(--text-secondary, #94a3b8);
  line-height: 1.65;
  margin: 0;
}

.infra-section {
  text-align: center;
}

.infra-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  margin: 0 0 1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.infra-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.infra-pill {
  padding: 0.35rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border, #334155);
  border-radius: 100px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted, #64748b);
}
</style>
