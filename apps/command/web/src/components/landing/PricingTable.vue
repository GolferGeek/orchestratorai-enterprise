<template>
  <section class="pricing-section">
    <div class="container">
      <div class="pricing-grid">
        <div
          v-for="tier in tiers"
          :key="tier.name"
          class="pricing-card"
          :class="{ featured: tier.featured }"
        >
          <div v-if="tier.featured" class="featured-badge">Recommended</div>

          <h3 class="tier-name">{{ tier.name }}</h3>

          <div class="tier-price">
            <span class="price-amount">{{ tier.price }}</span>
            <span v-if="tier.period" class="price-period">{{ tier.period }}</span>
          </div>

          <p class="tier-desc">{{ tier.description }}</p>

          <ul class="tier-features">
            <li v-for="feature in tier.features" :key="feature">
              <span class="check">✓</span>
              {{ feature }}
            </li>
          </ul>

          <a href="mailto:hello@orchestratorai.com" class="btn" :class="tier.featured ? 'btn-primary' : 'btn-secondary'">
            {{ tier.ctaLabel }}
          </a>
        </div>
      </div>

      <p class="pricing-note">
        AI moves too fast for fixed-price software releases. What we offer is better:
        a living platform that evolves with you, built by a team that's invested in your success.
        Our early partners shape the roadmap.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { pricingTiers as tiers } from '@/data/landingConfig';
</script>

<style scoped>
.pricing-section {
  padding: 6rem 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  align-items: start;
}

.pricing-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  transition: var(--transition);
}

.pricing-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.pricing-card.featured {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.06));
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.3), var(--shadow-glow);
}

.featured-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.3rem 1rem;
  border-radius: 100px;
  white-space: nowrap;
  letter-spacing: 0.04em;
}

.tier-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.tier-price {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.price-amount {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.price-period {
  font-size: 1rem;
  color: var(--text-muted);
}

.tier-desc {
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--text-secondary);
}

.tier-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
}

.tier-features li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.check {
  color: var(--success);
  font-weight: 700;
  flex-shrink: 0;
}

.btn {
  width: 100%;
  justify-content: center;
  margin-top: auto;
}

.pricing-note {
  text-align: center;
  margin-top: 2.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .pricing-grid {
    grid-template-columns: 1fr;
    max-width: 400px;
    margin: 0 auto;
  }
}
</style>
