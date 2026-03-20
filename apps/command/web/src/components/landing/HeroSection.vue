<template>
  <section class="hero">
    <!-- Ambient background orbs -->
    <div class="hero-bg" aria-hidden="true">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
      <div class="grid-overlay"></div>
    </div>

    <div class="hero-content container">
      <div class="hero-badge animate-fade-up">
        <span class="badge-dot"></span>
        Your AI Platform Foundation
      </div>

      <h1 class="hero-headline animate-fade-up-delay-1">
        {{ content.headline }}
      </h1>

      <p class="hero-sub animate-fade-up-delay-2">
        {{ content.subheadline }}
      </p>

      <div class="hero-actions animate-fade-up-delay-3">
        <a :href="content.primaryCta.href" class="btn btn-primary hero-cta-primary">
          {{ content.primaryCta.label }}
          <span class="cta-arrow">→</span>
        </a>
        <router-link :to="content.secondaryCta.href" class="btn btn-secondary">
          {{ content.secondaryCta.label }}
        </router-link>
      </div>

      <div class="hero-products">
        <span class="products-label">Ships with:</span>
        <div class="product-pills">
          <span v-for="p in productNames" :key="p" class="product-pill">{{ p }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { heroContent } from '@/data/landingConfig';
import { getAllProducts } from '@orchestrator-ai/transport-types';

const content = heroContent;
const productNames = getAllProducts().map(p => p.displayName);
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: calc(var(--nav-height) + 4rem) 0 6rem;
  overflow: hidden;
  background: var(--gradient-hero);
}

/* Background */
.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  animation: float 8s ease-in-out infinite;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.18), transparent 70%);
  top: -200px;
  right: -100px;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.15), transparent 70%);
  bottom: -150px;
  left: -100px;
  animation-delay: -3s;
}

.orb-3 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.1), transparent 70%);
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
  animation-delay: -5s;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

/* Content */
.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 820px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1rem;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 100px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-light);
  margin-bottom: 2rem;
  letter-spacing: 0.02em;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 8px var(--primary);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.hero-headline {
  font-size: clamp(2.8rem, 6vw, 4.5rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin-bottom: 1.5rem;
  background: var(--hero-headline-gradient, linear-gradient(135deg, #f1f5f9 40%, #94a3b8));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-sub {
  font-size: clamp(1.05rem, 2vw, 1.25rem);
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 620px;
  margin-bottom: 2.5rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 3.5rem;
}

.hero-cta-primary {
  padding: 0.9rem 2rem;
  font-size: 1rem;
}

.cta-arrow {
  transition: transform 0.2s ease;
}

.btn-primary:hover .cta-arrow {
  transform: translateX(4px);
}

/* Product pills */
.hero-products {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.products-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 500;
}

.product-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.product-pill {
  padding: 0.3rem 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .hero {
    padding: calc(var(--nav-height) + 2rem) 0 4rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    text-align: center;
    justify-content: center;
  }
}
</style>
