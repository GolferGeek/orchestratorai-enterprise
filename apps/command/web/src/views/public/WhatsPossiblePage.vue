<template>
  <ion-page>
    <ion-content>
      <LandingNav />
      <main class="wp-page">
      <div class="wp-page-hero">
        <div class="container">
          <span class="section-label">Agent Ideas</span>
          <h1 class="wp-page-title">What's Possible With AI Agents</h1>
          <p class="wp-page-sub">
            Every industry has workflows that can be transformed by intelligent agents.
            Browse use cases by industry and see how OrchestratorAI products power each one.
          </p>
        </div>
      </div>

      <!-- Iterate all industries at once on the full page -->
      <div class="wp-page-body container">
        <div
          v-for="industry in industries"
          :key="industry.id"
          class="wp-industry-block"
        >
          <div class="wp-industry-heading">
            <span class="wp-industry-icon" aria-hidden="true">{{ industry.icon }}</span>
            <h2 class="wp-industry-title">{{ industry.label }}</h2>
          </div>

          <div class="wp-grid">
            <div
              v-for="idea in industry.ideas"
              :key="idea.name"
              class="wp-full-card card"
            >
              <div class="wp-full-card-top">
                <div class="wp-full-card-name">{{ idea.name }}</div>
                <span
                  class="wp-badge"
                  :style="{
                    color: productColors[idea.product],
                    borderColor: productColors[idea.product] + '44',
                    background: productColors[idea.product] + '18',
                  }"
                >
                  {{ getAgentIdeaProductName(idea.product) }}
                </span>
              </div>
              <p class="wp-full-card-desc">{{ idea.description }}</p>
              <div class="wp-workflow">
                <div class="wp-workflow-label">Workflow</div>
                <div class="wp-workflow-text">{{ idea.workflow }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA section -->
      <section class="wp-page-cta">
        <div class="container">
          <h2 class="wp-cta-heading">Ready to Build Your Agent?</h2>
          <p class="wp-cta-sub">
            Log in to OrchestratorAI and start deploying intelligent agents for your organization.
          </p>
          <router-link to="/login" class="btn btn-primary wp-cta-btn">
            Launch Platform
            <span>→</span>
          </router-link>
        </div>
      </section>
      <Footer />
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from '@ionic/vue';
import LandingNav from '@/components/landing/LandingNav.vue';
import Footer from '@/components/landing/Footer.vue';
import { industries, productColors, getAgentIdeaProductName } from '@/data/agentIdeas';
</script>

<style scoped>
.wp-page {
  display: flex;
  flex-direction: column;
}

/* ─── Hero ──────────────────────────────────────────────────── */
.wp-page-hero {
  padding: 4rem 0 3rem;
  background: var(--gradient-hero);
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.wp-page-title {
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin-bottom: 1rem;
  line-height: 1.15;
}

.wp-page-sub {
  font-size: 1.1rem;
  line-height: 1.75;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

/* ─── Body ──────────────────────────────────────────────────── */
.wp-page-body {
  padding: 4rem 2rem;
  flex: 1;
}

.wp-industry-block {
  margin-bottom: 4rem;
}

.wp-industry-heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.wp-industry-icon {
  font-size: 1.6rem;
}

.wp-industry-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.wp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 1.25rem;
}

/* Cards */
.wp-full-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
}

.wp-full-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.wp-full-card-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.wp-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 100px;
  font-size: 0.72rem;
  font-weight: 700;
  border: 1px solid;
  white-space: nowrap;
  flex-shrink: 0;
}

.wp-full-card-desc {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-secondary);
  flex: 1;
}

.wp-workflow {
  background: var(--bg-base);
  border-radius: 8px;
  padding: 0.75rem;
  border: 1px solid var(--border);
}

.wp-workflow-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}

.wp-workflow-text {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.55;
}

/* ─── CTA ───────────────────────────────────────────────────── */
.wp-page-cta {
  background: var(--bg-elevated);
  border-top: 1px solid var(--border);
  padding: 5rem 0;
  text-align: center;
}

.wp-cta-heading {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.wp-cta-sub {
  font-size: 1.05rem;
  color: var(--text-secondary);
  margin-bottom: 1.75rem;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.wp-cta-btn {
  padding: 0.9rem 2.25rem;
  font-size: 1rem;
}
</style>
