<template>
  <section class="products-section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">The Platform Foundation</span>
        <h2 class="section-heading">Six Products. All Working. All Yours to Extend.</h2>
        <p class="section-sub">
          Every product ships as a working foundation — real agents, real workflows, real infrastructure.
          We customize each one for your industry, your data, and your team.
        </p>
      </div>

      <div class="products-grid">
        <div
          v-for="product in products"
          :key="product.slug"
          class="product-card card"
        >
          <div class="card-header">
            <span class="product-icon">{{ product.icon }}</span>
            <div class="product-meta">
              <h3 class="product-name">{{ product.name }}</h3>
              <span class="product-tagline">{{ product.tagline }}</span>
            </div>
          </div>

          <p class="product-desc">{{ product.description }}</p>

          <ul class="product-features">
            <li v-for="feature in product.features" :key="feature">
              <span class="feature-check">✓</span>
              {{ feature }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { products } from '@/data/landingConfig';
</script>

<style scoped>
.products-section {
  padding: 6rem 0;
  background: var(--bg-surface);
}

.section-header {
  text-align: center;
  margin-bottom: 4rem;
}

.section-header .section-sub {
  margin: 0 auto;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.product-card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.product-icon {
  font-size: 2rem;
  line-height: 1;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.product-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.2rem;
}

.product-tagline {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary-light);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.product-desc {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-secondary);
  flex: 1;
}

.product-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.product-features li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.feature-check {
  color: var(--success);
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

@media (max-width: 768px) {
  .products-grid {
    grid-template-columns: 1fr;
  }
}
</style>
