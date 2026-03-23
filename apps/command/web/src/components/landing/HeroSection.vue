<template>
  <section class="hero">
    <div class="hero-bg" aria-hidden="true">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
    </div>

    <div class="hero-content">
      <h1 class="hero-headline">{{ content.headline }}</h1>
      <p class="hero-sub">{{ content.subheadline }}</p>
      <a :href="content.primaryCta.href" class="btn btn-primary">
        {{ content.primaryCta.label }} &rarr;
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { heroContent } from '@/data/landingConfig';
const content = heroContent;
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: calc(var(--nav-height, 60px) + 4rem) 1.5rem 6rem;
  overflow: hidden;
  background: var(--gradient-hero);
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
}

.orb-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15), transparent 70%);
  top: -150px;
  right: -100px;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.12), transparent 70%);
  bottom: -100px;
  left: -80px;
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 700px;
}

.hero-headline {
  font-size: clamp(2.4rem, 5.5vw, 3.8rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0 0 1.5rem;
  background: linear-gradient(135deg, #f1f5f9 40%, #94a3b8);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-sub {
  font-size: clamp(1rem, 2vw, 1.2rem);
  line-height: 1.7;
  color: var(--text-secondary, #94a3b8);
  margin: 0 0 2.5rem;
}
</style>
