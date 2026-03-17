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
            v-for="(product, index) in products"
            :key="product.slug"
            class="product-detail"
            :class="{ reverse: index % 2 !== 0 }"
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

            <div class="detail-visual">
              <div class="visual-card">
                <div class="visual-header">
                  <div class="visual-dots">
                    <span></span><span></span><span></span>
                  </div>
                  <span class="visual-title">{{ product.name }}</span>
                </div>
                <div class="visual-body">
                  <div v-for="feature in product.features" :key="feature" class="visual-row">
                    <span class="visual-indicator"></span>
                    <span>{{ feature }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Platform features -->
      <FeatureGrid />

      <CTASection />
    </main>
    <Footer />
  </div>
</template>

<script setup lang="ts">
import NavBar from '@/components/landing/NavBar.vue';
import FeatureGrid from '@/components/landing/FeatureGrid.vue';
import CTASection from '@/components/landing/CTASection.vue';
import Footer from '@/components/landing/Footer.vue';
import { products } from '@/data/landingConfig';
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5rem;
  align-items: center;
  padding: 4rem 0;
  border-bottom: 1px solid var(--border);
}

.product-detail:last-child {
  border-bottom: none;
}

.product-detail.reverse {
  direction: rtl;
}

.product-detail.reverse > * {
  direction: ltr;
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

/* Visual card */
.detail-visual {
  display: flex;
  align-items: center;
  justify-content: center;
}

.visual-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  width: 100%;
  max-width: 380px;
  box-shadow: var(--shadow-card);
}

.visual-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}

.visual-dots {
  display: flex;
  gap: 5px;
}

.visual-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
}

.visual-dots span:first-child { background: #ff5f57; }
.visual-dots span:nth-child(2) { background: #febc2e; }
.visual-dots span:last-child { background: #28c840; }

.visual-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  font-family: monospace;
}

.visual-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.visual-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.visual-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--primary);
}

@media (max-width: 900px) {
  .product-detail {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }

  .product-detail.reverse {
    direction: ltr;
  }

  .detail-visual {
    order: -1;
  }
}
</style>
