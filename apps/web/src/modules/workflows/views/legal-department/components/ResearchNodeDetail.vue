<template>
  <div class="node-detail">
    <div class="node-header">
      <span class="node-status-dot" :class="`status-${node.status}`" />
      <h3 class="node-question">{{ node.question }}</h3>
    </div>

    <div class="node-meta">
      <ion-badge :color="confidenceColor(node.confidence)">
        {{ node.confidence ?? 'pending' }}
      </ion-badge>
      <ion-badge color="medium">depth {{ node.depth }}</ion-badge>
      <ion-badge color="light">{{ node.status }}</ion-badge>
    </div>

    <div v-if="node.findings" class="node-findings">
      <h4>Findings</h4>
      <!-- Rendered as markdown -->
      <ReportMarkdown :markdown="node.findings" />
    </div>

    <div v-if="node.citations && node.citations.length > 0" class="node-citations">
      <h4>Citations ({{ node.citations.length }})</h4>
      <ul class="citation-list">
        <li
          v-for="(citation, i) in node.citations"
          :key="i"
          class="citation-item"
          :class="{ unverified: !citation.verified }"
        >
          <div class="citation-header">
            <ion-badge :color="citation.verified ? 'success' : 'warning'">
              {{ citation.verified ? 'Verified' : 'Unverified' }}
            </ion-badge>
            <span class="citation-source">{{ citation.source }}</span>
            <span class="citation-score">
              relevance: {{ Math.round(citation.relevanceScore * 100) }}%
            </span>
          </div>
          <p class="citation-text">{{ citation.text }}</p>
        </li>
      </ul>
    </div>

    <div v-if="node.childIds.length > 0" class="node-children">
      <h4>Sub-questions ({{ node.childIds.length }})</h4>
      <ul class="child-list">
        <li v-for="childId in node.childIds" :key="childId" class="child-id">
          {{ childId }}
        </li>
      </ul>
    </div>

    <div v-if="!node.findings && node.status === 'pending'" class="node-pending">
      <ion-icon :icon="hourglassOutline" color="medium" />
      <span>This question has not been researched yet.</span>
    </div>

    <div v-if="!node.findings && node.status === 'skipped'" class="node-skipped">
      <ion-icon :icon="removeCircleOutline" color="medium" />
      <span>This question was skipped.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonBadge, IonIcon } from '@ionic/vue';
import { hourglassOutline, removeCircleOutline } from 'ionicons/icons';
import type { ResearchTreeNode } from './research-types';
import ReportMarkdown from './ReportMarkdown.vue';

defineProps<{
  node: ResearchTreeNode;
}>();

function confidenceColor(confidence: ResearchTreeNode['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'success';
    case 'medium':
      return 'warning';
    case 'low':
      return 'danger';
    default:
      return 'medium';
  }
}
</script>

<style scoped>
.node-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.node-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.node-status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

.status-answered {
  background: var(--ion-color-success);
}

.status-researching {
  background: var(--ion-color-primary);
}

.status-pending {
  background: var(--ion-color-medium);
}

.status-skipped {
  background: var(--ion-color-step-300);
}

.node-question {
  margin: 0;
  font-size: 1em;
  font-weight: 600;
  line-height: 1.4;
}

.node-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.node-findings h4,
.node-citations h4,
.node-children h4 {
  margin: 0 0 8px 0;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--ion-color-medium-shade);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.citation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.citation-item {
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--ion-color-step-50);
}

.citation-item.unverified {
  border-color: var(--ion-color-warning-tint);
}

.citation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.citation-source {
  font-size: 0.82em;
  color: var(--ion-color-medium);
  font-style: italic;
}

.citation-score {
  font-size: 0.78em;
  color: var(--ion-color-medium);
  margin-left: auto;
}

.citation-text {
  margin: 0;
  font-size: 0.88em;
  line-height: 1.5;
  color: var(--ion-color-dark);
}

.child-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.child-id {
  font-size: 0.82em;
  font-family: monospace;
  color: var(--ion-color-medium);
  padding: 2px 6px;
  background: var(--ion-color-step-100);
  border-radius: 4px;
}

.node-pending,
.node-skipped {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ion-color-medium);
  font-size: 0.88em;
  padding: 8px 0;
}
</style>
