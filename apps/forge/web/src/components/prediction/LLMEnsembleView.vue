<template>
  <div class="llm-ensemble-view">
    <h3 class="section-title">LLM Ensemble Results</h3>
    <div v-if="!hasResults" class="empty-message">
      No LLM ensemble results available.
    </div>
    <div v-else class="ensemble-grid">
      <div
        v-for="tier in orderedTiers"
        :key="tier.name"
        class="tier-card"
        :class="tier.name"
      >
        <div class="tier-header">
          <span class="tier-name">{{ tier.name.toUpperCase() }}</span>
          <span class="model-info">{{ tier.result.provider }}/{{ tier.result.model }}</span>
        </div>
        <div class="tier-result">
          <div class="direction-display" :class="tier.result.direction">
            <span class="direction-icon">{{ getDirectionIcon(tier.result.direction) }}</span>
            <span class="direction-text">{{ tier.result.direction.toUpperCase() }}</span>
          </div>
          <div class="confidence-meter">
            <div
              class="confidence-bar"
              :style="{ width: `${tier.result.confidence * 100}%` }"
              :class="tier.result.direction"
            ></div>
            <span class="confidence-text">
              {{ Math.round(tier.result.confidence * 100) }}%
            </span>
          </div>
        </div>
        <p class="reasoning">{{ tier.result.reasoning }}</p>
      </div>
    </div>

    <!-- Agreement Indicator -->
    <div v-if="hasResults" class="agreement-section">
      <div class="agreement-indicator" :class="agreementLevel">
        <span class="agreement-icon">{{ agreementIcon }}</span>
        <span class="agreement-text">{{ agreementText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TierResult } from '@/services/predictionDashboardService';

interface Props {
  llmEnsembleResults?: {
    gold?: TierResult;
    silver?: TierResult;
    bronze?: TierResult;
  };
}

const props = defineProps<Props>();

interface TierDisplay {
  name: 'gold' | 'silver' | 'bronze';
  result: TierResult;
}

const hasResults = computed(() => {
  const r = props.llmEnsembleResults;
  return r && (r.gold || r.silver || r.bronze);
});

const orderedTiers = computed<TierDisplay[]>(() => {
  const tiers: TierDisplay[] = [];
  const r = props.llmEnsembleResults;
  if (!r) return tiers;

  if (r.gold) tiers.push({ name: 'gold', result: r.gold });
  if (r.silver) tiers.push({ name: 'silver', result: r.silver });
  if (r.bronze) tiers.push({ name: 'bronze', result: r.bronze });

  return tiers;
});

const agreementLevel = computed(() => {
  const r = props.llmEnsembleResults;
  if (!r) return 'none';

  const directions = [r.gold?.direction, r.silver?.direction, r.bronze?.direction].filter(
    Boolean
  );

  if (directions.length < 2) return 'insufficient';

  const unique = new Set(directions);
  if (unique.size === 1) return 'full';
  if (unique.size === 2 && directions.length === 3) return 'partial';
  return 'none';
});

const agreementText = computed(() => {
  switch (agreementLevel.value) {
    case 'full':
      return 'All tiers agree on direction';
    case 'partial':
      return '2 of 3 tiers agree on direction';
    case 'insufficient':
      return 'Insufficient tier data';
    default:
      return 'Tiers disagree on direction';
  }
});

const agreementIcon = computed(() => {
  switch (agreementLevel.value) {
    case 'full':
      return '\u2713'; // ✓
    case 'partial':
      return '\u2248'; // ≈
    case 'insufficient':
      return '?';
    default:
      return '\u2717'; // ✗
  }
});

function getDirectionIcon(direction: string): string {
  switch (direction) {
    case 'up':
      return '\u2191'; // ↑
    case 'down':
      return '\u2193'; // ↓
    default:
      return '\u2194'; // ↔
  }
}
</script>

<style scoped>
.llm-ensemble-view {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #111827);
}

.empty-message {
  color: var(--text-secondary, #6b7280);
  font-size: 0.875rem;
  font-style: italic;
}

.ensemble-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

.tier-card {
  border: 2px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
}

.tier-card.gold {
  border-color: #ffd700;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05), rgba(184, 134, 11, 0.05));
}

.tier-card.silver {
  border-color: #c0c0c0;
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.05), rgba(128, 128, 128, 0.05));
}

.tier-card.bronze {
  border-color: #cd7f32;
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.05), rgba(139, 69, 19, 0.05));
}

.tier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.tier-name {
  font-size: 0.875rem;
  font-weight: 700;
}

.tier-card.gold .tier-name {
  color: #b8860b;
}

.tier-card.silver .tier-name {
  color: #6b7280;
}

.tier-card.bronze .tier-name {
  color: #8b4513;
}

.model-info {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
  background: var(--model-bg, #f3f4f6);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.tier-result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.direction-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-weight: 600;
}

.direction-display.up {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.direction-display.down {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.direction-display.flat {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.direction-icon {
  font-size: 1.25rem;
}

.direction-text {
  font-size: 0.875rem;
}

.confidence-meter {
  position: relative;
  height: 20px;
  background-color: var(--meter-bg, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.confidence-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.confidence-bar.up {
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.confidence-bar.down {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

.confidence-bar.flat {
  background: linear-gradient(90deg, #6b7280, #4b5563);
}

.confidence-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.reasoning {
  font-size: 0.8125rem;
  color: var(--text-primary, #111827);
  margin: 0;
  line-height: 1.4;
}

.agreement-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.agreement-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.agreement-indicator.full {
  background-color: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.agreement-indicator.partial {
  background-color: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.agreement-indicator.none {
  background-color: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.agreement-indicator.insufficient {
  background-color: rgba(107, 114, 128, 0.1);
  color: #6b7280;
}

.agreement-icon {
  font-size: 1rem;
}

html.ion-palette-dark .llm-ensemble-view,
html[data-theme="dark"] .llm-ensemble-view {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --meter-bg: #374151;
  --model-bg: #374151;
}
</style>
