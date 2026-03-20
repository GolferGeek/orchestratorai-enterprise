<template>
  <section class="whats-possible">
    <div class="container">
      <!-- Section header -->
      <div class="wp-header">
        <span class="section-label">What's Possible</span>
        <h2 class="section-heading">What's Possible With AI Agents</h2>
        <p class="section-sub">
          These are examples of what the platform can do — agents and workflows that demonstrate
          the range of what's buildable. Your agents will be custom-built for your industry,
          your data, and your workflows.
        </p>
      </div>

      <!-- Industry selector -->
      <div class="wp-tabs" role="tablist" aria-label="Industry selector">
        <button
          v-for="industry in industries"
          :key="industry.id"
          class="wp-tab"
          :class="{ 'wp-tab--active': activeId === industry.id }"
          role="tab"
          :aria-selected="activeId === industry.id"
          @click="activeId = industry.id"
        >
          <span class="wp-tab-icon" aria-hidden="true">{{ industry.icon }}</span>
          <span>{{ industry.label }}</span>
        </button>
      </div>

      <!-- Agent idea cards -->
      <Transition name="wp-cards" mode="out-in">
        <div :key="activeId" class="wp-cards">
          <div
            v-for="idea in activeIndustry.ideas"
            :key="idea.name"
            class="wp-card card"
          >
            <div class="wp-card-top">
              <div class="wp-card-name">{{ idea.name }}</div>
              <span
                class="wp-badge"
                :style="{ color: productColors[idea.product], borderColor: productColors[idea.product] + '44', background: productColors[idea.product] + '18' }"
              >
                {{ getAgentIdeaProductName(idea.product) }}
              </span>
            </div>
            <p class="wp-card-desc">{{ idea.description }}</p>
            <div class="wp-workflow">
              <div class="wp-workflow-label">Workflow</div>
              <div class="wp-workflow-text">{{ idea.workflow }}</div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- CTA -->
      <div class="wp-cta">
        <a href="mailto:hello@orchestratorai.com" class="btn btn-primary">
          Let's Build Yours
          <span>→</span>
        </a>
        <router-link to="/whats-possible" class="btn btn-secondary">
          Explore All Industries
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { industries, productColors, getAgentIdeaProductName } from '@/data/agentIdeas';

const activeId = ref(industries[0].id);

const activeIndustry = computed(
  () => industries.find((i) => i.id === activeId.value) ?? industries[0],
);
</script>

<style scoped>
.whats-possible {
  padding: 6rem 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.wp-header {
  text-align: center;
  margin-bottom: 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ─── Industry tabs ─────────────────────────────────────────── */
.wp-tabs {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 2.5rem;
}

.wp-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: var(--transition);
}

.wp-tab:hover {
  color: var(--text-primary);
  border-color: var(--border-active);
  background: rgba(59, 130, 246, 0.06);
}

.wp-tab--active {
  color: var(--primary-light);
  border-color: var(--border-active);
  background: rgba(59, 130, 246, 0.12);
}

.wp-tab-icon {
  font-size: 1rem;
}

/* ─── Cards grid ────────────────────────────────────────────── */
.wp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}

/* Card transition */
.wp-cards-enter-active,
.wp-cards-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.wp-cards-enter-from,
.wp-cards-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.wp-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
}

.wp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.wp-card-name {
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

.wp-card-desc {
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
.wp-cta {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 600px) {
  .wp-cta {
    flex-direction: column;
    align-items: stretch;
  }

  .wp-cta .btn {
    justify-content: center;
    text-align: center;
  }
}
</style>
