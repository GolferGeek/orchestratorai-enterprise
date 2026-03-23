<template>
  <section class="cta-section">
    <div class="container">
      <h2 class="cta-headline">{{ content.headline }}</h2>
      <p class="cta-sub">{{ content.subheadline }}</p>
      <a :href="content.primaryCta.href" class="btn btn-primary">
        {{ content.primaryCta.label }} &rarr;
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ctaContent } from '@/data/landingConfig';
const content = ctaContent;
</script>

<style scoped>
.cta-section {
  padding: 5rem 0;
  text-align: center;
  border-top: 1px solid var(--border, #334155);
}

.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.cta-headline {
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 800;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
}

.cta-sub {
  font-size: 1.05rem;
  color: var(--text-secondary, #94a3b8);
  line-height: 1.7;
  margin: 0 0 2rem;
}
</style>
