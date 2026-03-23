<template>
  <ion-page>
    <ion-content>
      <LandingNav />
      <main class="pricing-main">
      <!-- Page Hero -->
      <section class="page-hero">
        <div class="container">
          <span class="section-label">Partnership Model</span>
          <h1 class="page-headline">Let's Build Together</h1>
          <p class="page-sub">
            We're not selling a box. We're partnering with forward-thinking organizations
            to build their AI capabilities — together, at AI speed.
          </p>
        </div>
      </section>

      <PricingTable />

      <!-- FAQ -->
      <section class="faq-section">
        <div class="container">
          <h2 class="section-heading faq-heading">Frequently Asked Questions</h2>
          <div class="faq-grid">
            <div v-for="item in faqItems" :key="item.q" class="faq-item">
              <h3 class="faq-q">{{ item.q }}</h3>
              <p class="faq-a">{{ item.a }}</p>
            </div>
          </div>
        </div>
      </section>

      <CTASection />
      <Footer />
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from '@ionic/vue';
import LandingNav from '@/components/landing/LandingNav.vue';
import PricingTable from '@/components/landing/PricingTable.vue';
import CTASection from '@/components/landing/CTASection.vue';
import Footer from '@/components/landing/Footer.vue';

const faqItems = [
  {
    q: 'What does "partnership" actually mean?',
    a: 'It means we build alongside you, not just hand you a codebase. Your team and our team work together to define, build, and deploy agents that are genuinely useful for your organization — then we stay engaged as your needs evolve.',
  },
  {
    q: 'What comes with the platform foundation?',
    a: 'All five products ship with working configurations: Forge with LangGraph workflow examples, Compose with starter agents, Pulse with event automation wiring, Bridge with A2A endpoints, and Admin with full observability. These are your starting point — not your ceiling.',
  },
  {
    q: 'Can we use our own LLM providers?',
    a: 'Yes. OrchestratorAI supports OpenAI, Anthropic, Azure OpenAI, and GCP Vertex AI. You can configure different providers per product or per agent — your data stays under your control.',
  },
  {
    q: 'What is Sovereign Mode?',
    a: 'Sovereign Mode routes all LLM calls through your own infrastructure — no data leaves your cloud. This is essential for regulated industries and is available as part of a Full Partnership engagement.',
  },
  {
    q: 'How long does a Pilot Program take?',
    a: 'Most pilots run four to eight weeks. We focus on a meaningful slice of value — two or three custom agents for your domain, deployed and running — so you can see what\'s possible before committing to a full build-out.',
  },
  {
    q: 'Why a partnership model instead of a subscription?',
    a: 'AI moves faster than traditional software releases. A subscription implies a finished product. What we offer is better: a living platform and a team that evolves it with you. Our early partners get direct influence over the roadmap and first access to new capabilities.',
  },
];
</script>

<style scoped>
.pricing-main {
  display: flex;
  flex-direction: column;
}

.page-hero {
  padding: 5rem 0;
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
  max-width: 560px;
  margin: 0 auto;
}

/* FAQ */
.faq-section {
  padding: 6rem 0;
  background: var(--bg-base);
  border-top: 1px solid var(--border);
}

.faq-heading {
  text-align: center;
  margin-bottom: 3rem;
}

.faq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
  max-width: var(--max-width);
}

.faq-item {
  padding: 1.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.faq-q {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.faq-a {
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .faq-grid {
    grid-template-columns: 1fr;
  }
}
</style>
