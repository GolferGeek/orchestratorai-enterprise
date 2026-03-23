<template>
  <section class="problem-section">
    <div class="container">
      <h2 class="section-headline">{{ content.headline }}</h2>

      <div class="problems-grid">
        <div v-for="point in content.points" :key="point.label" class="problem-card">
          <h3 class="problem-label">{{ point.label }}</h3>
          <p class="problem-text">{{ point.problem }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { problemContent } from '@/data/landingConfig';
const content = problemContent;
</script>

<style scoped>
.problem-section {
  padding: 5rem 0;
  background: var(--bg-surface, #0f172a);
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.section-headline {
  font-size: clamp(1.6rem, 3.5vw, 2.2rem);
  font-weight: 800;
  color: var(--text-primary, #f1f5f9);
  text-align: center;
  margin: 0 0 3rem;
  letter-spacing: -0.02em;
}

.problems-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .problems-grid { grid-template-columns: 1fr; }
}

.problem-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border, #334155);
  border-radius: 12px;
  padding: 1.75rem;
}

.problem-label {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary, #f1f5f9);
  margin: 0 0 0.75rem;
}

.problem-text {
  font-size: 0.9rem;
  color: var(--text-muted, #64748b);
  line-height: 1.65;
  margin: 0;
}
</style>
