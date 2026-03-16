<template>
  <div class="about-page">
    <NavBar />
    <main>
      <!-- Page Hero -->
      <section class="page-hero">
        <div class="container">
          <span class="section-label">About</span>
          <h1 class="page-headline">{{ content.headline }}</h1>
          <p class="page-sub">{{ content.mission }}</p>
        </div>
      </section>

      <!-- Values -->
      <section class="values-section">
        <div class="container">
          <div class="section-header">
            <span class="section-label">Our Values</span>
            <h2 class="section-heading">How We Build</h2>
          </div>
          <div class="values-grid">
            <div v-for="value in content.values" :key="value.title" class="value-card card">
              <h3 class="value-title">{{ value.title }}</h3>
              <p class="value-desc">{{ value.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Platform architecture callout -->
      <section class="arch-section">
        <div class="container">
          <div class="arch-inner">
            <div class="arch-text">
              <span class="section-label">Architecture</span>
              <h2 class="section-heading">The Platform Is the Product</h2>
              <p class="section-sub">
                OrchestratorAI Enterprise is a monorepo of nine independent products
                communicating via A2A protocol (JSON-RPC 2.0). Every agent call carries
                an ExecutionContext for full traceability — who ran it, when, on what model,
                at what cost.
              </p>
              <ul class="arch-list">
                <li v-for="item in archItems" :key="item.port" class="arch-item">
                  <span class="arch-port">{{ item.port }}</span>
                  <span class="arch-product">{{ item.product }}</span>
                  <span class="arch-desc">{{ item.desc }}</span>
                </li>
              </ul>
            </div>

            <div class="arch-visual">
              <div class="arch-diagram">
                <div class="diagram-center">
                  <span>Command</span>
                  <span class="diagram-port">:6001</span>
                </div>
                <div class="diagram-ring">
                  <div v-for="node in diagramNodes" :key="node.name" class="diagram-node">
                    <span class="node-icon">{{ node.icon }}</span>
                    <span class="node-name">{{ node.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTASection />
    </main>
    <Footer />
  </div>
</template>

<script setup lang="ts">
import NavBar from '@/components/landing/NavBar.vue';
import CTASection from '@/components/landing/CTASection.vue';
import Footer from '@/components/landing/Footer.vue';
import { aboutContent as content } from '@/data/landingConfig';

const archItems = [
  { port: ':6001', product: 'Command', desc: 'Navigation shell and routing' },
  { port: ':6200', product: 'Forge', desc: 'Complex LangGraph agent dashboards' },
  { port: ':6300', product: 'Compose', desc: 'Simple composable agents' },
  { port: ':6400', product: 'Landing', desc: 'Public marketing site (you are here)' },
  { port: ':6500', product: 'Pulse', desc: 'Internal event automation' },
  { port: ':6600', product: 'Bridge', desc: 'External A2A communication' },
  { port: ':6900', product: 'Flow', desc: 'Team productivity' },
];

const diagramNodes = [
  { name: 'Forge', icon: '⚡' },
  { name: 'Compose', icon: '🧩' },
  { name: 'Flow', icon: '🌊' },
  { name: 'Pulse', icon: '💓' },
  { name: 'Bridge', icon: '🌉' },
  { name: 'Admin', icon: '🛡️' },
];
</script>

<style scoped>
.about-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

/* Page hero */
.page-hero {
  padding: calc(var(--nav-height) + 5rem) 0 5rem;
  background: var(--gradient-hero);
  text-align: center;
  border-bottom: 1px solid var(--border);
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
  max-width: 620px;
  margin: 0 auto;
}

/* Values */
.values-section {
  padding: 6rem 0;
  background: var(--bg-surface);
}

.section-header {
  margin-bottom: 3rem;
}

.values-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.value-card {
  background: var(--bg-card);
}

.value-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.value-desc {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* Architecture */
.arch-section {
  padding: 6rem 0;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
}

.arch-inner {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 5rem;
  align-items: center;
}

.arch-list {
  list-style: none;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.arch-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.88rem;
}

.arch-port {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--primary-light);
  background: rgba(59, 130, 246, 0.1);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.arch-product {
  font-weight: 700;
  color: var(--text-primary);
  width: 70px;
  flex-shrink: 0;
}

.arch-desc {
  color: var(--text-secondary);
}

/* Diagram */
.arch-diagram {
  position: relative;
  width: 340px;
  height: 340px;
  margin: 0 auto;
}

.diagram-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90px;
  height: 90px;
  background: var(--gradient-primary);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  z-index: 2;
  box-shadow: var(--shadow-glow);
}

.diagram-center span {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

.diagram-port {
  font-size: 0.65rem !important;
  opacity: 0.8;
  font-family: monospace;
}

.diagram-ring {
  position: absolute;
  inset: 0;
  border: 1px dashed var(--border);
  border-radius: 50%;
}

.diagram-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  transform: translate(-50%, -50%);
}

/* Position nodes around the circle */
.diagram-node:nth-child(1) { top: 8%; left: 50%; }
.diagram-node:nth-child(2) { top: 25%; left: 90%; }
.diagram-node:nth-child(3) { top: 75%; left: 90%; }
.diagram-node:nth-child(4) { top: 92%; left: 50%; }
.diagram-node:nth-child(5) { top: 75%; left: 10%; }
.diagram-node:nth-child(6) { top: 25%; left: 10%; }

.node-icon {
  font-size: 1.5rem;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 50%;
}

.node-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

@media (max-width: 900px) {
  .arch-inner {
    grid-template-columns: 1fr;
    gap: 3rem;
  }

  .arch-diagram {
    width: 280px;
    height: 280px;
  }
}

@media (max-width: 768px) {
  .values-grid {
    grid-template-columns: 1fr;
  }
}
</style>
