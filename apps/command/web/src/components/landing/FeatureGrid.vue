<template>
  <section class="solution-section">
    <div class="container">
      <h2 class="section-headline">{{ content.headline }}</h2>
      <p class="section-sub">{{ content.subheadline }}</p>

      <ul class="solution-list">
        <li v-for="point in content.points" :key="point.text">{{ point.text }}</li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { solutionContent } from '@/data/landingConfig';
const content = solutionContent;
</script>

<style scoped>
.solution-section {
  padding: 5rem 0;
  background: var(--bg-page, #0f172a);
  border-top: 1px solid var(--border, #334155);
}

.container {
  max-width: 700px;
  margin: 0 auto;
  padding: 0 1.5rem;
  text-align: center;
}

.section-headline {
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 800;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 1rem;
  letter-spacing: -0.02em;
}

.section-sub {
  font-size: 1.05rem;
  color: var(--text-secondary, #94a3b8);
  line-height: 1.7;
  margin: 0 0 2.5rem;
}

.solution-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: left;
  max-width: 480px;
  margin: 0 auto;
}

.solution-list li {
  font-size: 1rem;
  color: var(--text-primary, #f1f5f9);
  font-weight: 500;
  padding-left: 1.5rem;
  position: relative;
  line-height: 1.5;
}

.solution-list li::before {
  content: '\2713';
  position: absolute;
  left: 0;
  color: #22c55e;
  font-weight: 700;
}
</style>
