<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Forge — Complex Agent Dashboards</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="agent-index-content">
      <div class="agent-grid">
        <div
          v-for="agent in agents"
          :key="agent.slug"
          class="agent-card"
          @click="$router.push(agent.path)"
        >
          <div class="agent-icon">
            <ion-icon :icon="agent.icon" />
          </div>
          <h2 class="agent-name">{{ agent.name }}</h2>
          <p class="agent-description">{{ agent.description }}</p>
          <ion-button fill="outline" size="small">Open Dashboard</ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/vue';
import {
  megaphoneOutline,
  scaleOutline,
  constructOutline,
  warningOutline,
  trendingUpOutline,
} from 'ionicons/icons';

const agents = [
  {
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    description: 'Multi-agent LangGraph workflow for marketing content generation. Parallel specialist agents collaborate to produce comprehensive campaigns.',
    path: '/app/agents/marketing-swarm',
    icon: megaphoneOutline,
  },
  {
    slug: 'legal-department',
    name: 'Legal Department AI',
    description: 'Specialist legal agents for document analysis, contract review, compliance, and risk assessment with human-in-the-loop approval.',
    path: '/app/agents/legal-department',
    icon: scaleOutline,
  },
  {
    slug: 'cad-agent',
    name: 'CAD Agent',
    description: 'AI-powered CAD model generation. Describe your design requirements and watch the pipeline produce 3D models step by step.',
    path: '/app/agents/cad-agent',
    icon: constructOutline,
  },
  {
    slug: 'risk-runner',
    name: 'Risk Runner',
    description: 'Multi-dimensional risk analysis across subjects and portfolios. LangGraph workflow with parallel analyst agents and scenario simulation.',
    path: '/app/agents/risk-runner',
    icon: warningOutline,
  },
  {
    slug: 'predictor',
    name: 'Predictor',
    description: 'LLM ensemble prediction pipeline with multiple analyst agents, learning loops, and portfolio management dashboards.',
    path: '/app/prediction/dashboard',
    icon: trendingUpOutline,
  },
];
</script>

<style scoped>
.agent-index-content {
  --padding-top: 32px;
  --padding-start: 24px;
  --padding-end: 24px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.agent-card {
  background: var(--ion-color-step-50, #f9f9f9);
  border: 1px solid var(--ion-color-step-150, #e0e0e0);
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-card:hover {
  border-color: var(--ion-color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.agent-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--ion-color-primary-tint);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-icon ion-icon {
  font-size: 24px;
  color: var(--ion-color-primary);
}

.agent-name {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  color: var(--ion-text-color);
}

.agent-description {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}
</style>
