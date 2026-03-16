<template>
  <div class="llm-comparison-badge" :class="agreementClass">
    <div class="tier-indicators">
      <span
        v-for="tier in tiers"
        :key="tier.name"
        class="tier-dot"
        :class="[tier.class, tier.direction]"
        :title="tier.tooltip"
      >
        {{ tier.icon }}
      </span>
    </div>
    <span class="agreement-label">{{ agreementLabel }}</span>
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
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  llmEnsembleResults: undefined,
  compact: false,
});

interface TierDisplay {
  name: string;
  icon: string;
  class: string;
  direction: string;
  tooltip: string;
}

const tiers = computed<TierDisplay[]>(() => {
  const results = props.llmEnsembleResults;
  if (!results) return [];

  const tierList: TierDisplay[] = [];

  if (results.gold) {
    tierList.push({
      name: 'gold',
      icon: 'G',
      class: 'tier-gold',
      direction: results.gold.direction,
      tooltip: `Gold (${results.gold.provider}/${results.gold.model}): ${results.gold.direction} (${Math.round(results.gold.confidence * 100)}%)`,
    });
  }

  if (results.silver) {
    tierList.push({
      name: 'silver',
      icon: 'S',
      class: 'tier-silver',
      direction: results.silver.direction,
      tooltip: `Silver (${results.silver.provider}/${results.silver.model}): ${results.silver.direction} (${Math.round(results.silver.confidence * 100)}%)`,
    });
  }

  if (results.bronze) {
    tierList.push({
      name: 'bronze',
      icon: 'B',
      class: 'tier-bronze',
      direction: results.bronze.direction,
      tooltip: `Bronze (${results.bronze.provider}/${results.bronze.model}): ${results.bronze.direction} (${Math.round(results.bronze.confidence * 100)}%)`,
    });
  }

  return tierList;
});

const agreementLevel = computed(() => {
  const results = props.llmEnsembleResults;
  if (!results) return 'none';

  const directions = [
    results.gold?.direction,
    results.silver?.direction,
    results.bronze?.direction,
  ].filter(Boolean);

  if (directions.length < 2) return 'insufficient';

  const uniqueDirections = new Set(directions);

  if (uniqueDirections.size === 1) return 'full';
  if (uniqueDirections.size === 2 && directions.length === 3) return 'partial';
  return 'none';
});

const agreementClass = computed(() => {
  return `agreement-${agreementLevel.value}`;
});

const agreementLabel = computed(() => {
  switch (agreementLevel.value) {
    case 'full':
      return 'Full Agreement';
    case 'partial':
      return 'Partial';
    case 'insufficient':
      return 'Limited Data';
    default:
      return 'No Agreement';
  }
});
</script>

<style scoped>
.llm-comparison-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.tier-indicators {
  display: flex;
  gap: 0.25rem;
}

.tier-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.625rem;
  font-weight: bold;
  color: white;
  cursor: help;
}

.tier-gold {
  background: linear-gradient(135deg, #ffd700, #b8860b);
}

.tier-silver {
  background: linear-gradient(135deg, #c0c0c0, #808080);
}

.tier-bronze {
  background: linear-gradient(135deg, #cd7f32, #8b4513);
}

/* Direction indicators */
.tier-dot.up {
  box-shadow: 0 0 0 2px #22c55e;
}

.tier-dot.down {
  box-shadow: 0 0 0 2px #ef4444;
}

.tier-dot.flat {
  box-shadow: 0 0 0 2px #6b7280;
}

/* Agreement levels */
.agreement-full {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #16a34a;
}

.agreement-partial {
  background-color: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.3);
  color: #ca8a04;
}

.agreement-none {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #dc2626;
}

.agreement-insufficient {
  background-color: rgba(107, 114, 128, 0.1);
  border: 1px solid rgba(107, 114, 128, 0.3);
  color: #6b7280;
}

.agreement-label {
  white-space: nowrap;
}

/* Dark mode support */
html.ion-palette-dark .agreement-full,
html[data-theme="dark"] .agreement-full {
  background-color: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

html.ion-palette-dark .agreement-partial,
html[data-theme="dark"] .agreement-partial {
  background-color: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}

html.ion-palette-dark .agreement-none,
html[data-theme="dark"] .agreement-none {
  background-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

html.ion-palette-dark .agreement-insufficient,
html[data-theme="dark"] .agreement-insufficient {
  background-color: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}
</style>
