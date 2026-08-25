<template>
  <div class="features-page">
    <NavBar />
    <main>
      <!-- Page Hero -->
      <section class="page-hero">
        <div class="container">
          <span class="section-label">Features</span>
          <h1 class="page-headline">A Complete Enterprise AI Platform</h1>
          <p class="page-sub">
            Six integrated products. One unified platform. Built with enterprise-grade
            security, observability, and multi-tenancy from the ground up.
          </p>
        </div>
      </section>

      <!-- Products in depth -->
      <section class="products-detail">
        <div class="container">
          <div
            v-for="product in products"
            :key="product.slug"
            :id="product.slug"
            class="product-detail"
          >
            <div class="detail-content">
              <div class="detail-header">
                <span class="product-icon-lg">{{ product.icon }}</span>
                <div>
                  <h2 class="detail-name">{{ product.name }}</h2>
                  <span class="detail-tagline">{{ product.tagline }}</span>
                </div>
              </div>
              <p class="detail-desc">{{ product.description }}</p>
              <ul class="detail-features">
                <li v-for="feature in product.features" :key="feature">
                  <span class="check">✓</span>
                  {{ feature }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Platform features -->
      <FeatureGrid />

      <CTASection />
    </main>
    <Footer />
    <CustomerServiceWidget />
  </div>
</template>

<script setup lang="ts">
import CustomerServiceWidget from '@/modules/landing/components/CustomerServiceWidget.vue';
import NavBar from '@/modules/landing/components/landing/NavBar.vue';
import FeatureGrid from '@/modules/landing/components/landing/FeatureGrid.vue';
import CTASection from '@/modules/landing/components/landing/CTASection.vue';
import Footer from '@/modules/landing/components/landing/Footer.vue';
import { products } from '@/modules/landing/data/landingConfig';
</script>

<style scoped>
.features-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

/* Page Hero */
.page-hero {
  padding: calc(var(--nav-height) + 5rem) 0 5rem;
  background: var(--gradient-hero);
  text-align: center;
  position: relative;
}

.page-hero::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
}

.page-headline {
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 1rem 0;
  line-height: 1.15;
}

.page-sub {
  font-size: 1.1rem;
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 580px;
  margin: 0 auto;
}

/* Products detail */
.products-detail {
  padding: 6rem 0;
  background: var(--bg-surface);
}

.product-detail {
  padding: 4rem 0;
  border-bottom: 1px solid var(--border);
  max-width: 800px;
  margin: 0 auto;
}

.product-detail:last-child {
  border-bottom: none;
}

/* Detail content */
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.product-icon-lg {
  font-size: 2.5rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 14px;
  flex-shrink: 0;
}

.detail-name {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin-bottom: 0.25rem;
}

.detail-tagline {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary-light);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-desc {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.detail-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.detail-features li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.92rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.check {
  color: var(--success);
  font-weight: 700;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .product-detail {
    max-width: 100%;
  }
}
</style>
