<template>
  <div
    class="prediction-group-card"
    :class="{ selected: isSelected }"
    @click="$emit('click')"
  >
    <div class="card-header">
      <div class="target-info">
        <span v-if="isTest" class="test-badge">TEST</span>
        <span class="target-symbol">{{ targetSymbol }}</span>
        <span class="target-name">{{ targetName }}</span>
      </div>
      <div class="meta-info">
        <span v-if="priceInfo?.currentPrice != null" class="inline-price">
          <span class="price-value">{{ formatInlinePrice(priceInfo) }}</span>
          <span
            v-if="priceInfo.change24hPercent != null"
            class="price-change"
            :class="priceChangeClass(priceInfo.change24hPercent)"
          >{{ formatPriceChange(priceInfo.change24hPercent) }}</span>
        </span>
        <span class="timeframe" v-if="timeframe">{{ timeframe }}</span>
        <span class="date">{{ formatDate(generatedAt) }}</span>
      </div>
    </div>

    <div class="analyst-indicators">
      <div
        v-for="analyst in analysts"
        :key="analyst.slug"
        class="analyst-indicator"
        :class="[getDirectionClass(analyst.direction), getAnalystClass(analyst.slug)]"
        :title="`${analyst.name}: ${analyst.direction} (${Math.round(analyst.confidence * 100)}%)`"
        @click.stop="$emit('analyst-click', analyst.slug)"
      >
        <span class="analyst-name">{{ getFullName(analyst.slug) }}</span>
        <span class="direction-arrow">{{ getDirectionArrow(analyst.direction) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <span class="prediction-count">{{ analysts.length }} analyst{{ analysts.length !== 1 ? 's' : '' }}</span>
      <div v-if="canTrade" class="trade-buttons">
        <button
          class="trade-button trade-buy"
          @click.stop="$emit('trade', 'buy')"
          title="Buy (Long)"
        >
          Buy ↑
        </button>
        <button
          class="trade-button trade-sell"
          @click.stop="$emit('trade', 'sell')"
          title="Sell (Short)"
        >
          Sell ↓
        </button>
      </div>
      <span v-else class="click-hint">Click to view details</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Prediction, InstrumentPrice } from '@/services/predictionDashboardService';

interface AnalystSummary {
  slug: string;
  name: string;
  direction: string;
  confidence: number;
}

interface Props {
  predictions: Prediction[];
  isSelected?: boolean;
  prices?: Map<string, InstrumentPrice>;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  prices: undefined,
});

defineEmits<{
  click: [];
  'analyst-click': [slug: string];
  trade: [direction: 'buy' | 'sell'];
}>();

// Get target info from first prediction
const targetSymbol = computed(() => props.predictions[0]?.targetSymbol || 'N/A');
const targetName = computed(() => props.predictions[0]?.targetName || '');
const timeframe = computed(() => props.predictions[0]?.timeframe || '');
const generatedAt = computed(() => props.predictions[0]?.generatedAt || '');
const isTest = computed(() => props.predictions[0]?.isTest || false);

const priceInfo = computed(() => {
  const sym = targetSymbol.value;
  return props.prices?.get(sym) ?? null;
});

// Check if a prediction represents a flat-only analyst (both user and AI forks are flat)
function isFlatOnlyAnalyst(p: Prediction): boolean {
  const ensemble = (p as unknown as Record<string, unknown>).analystEnsemble as {
    user_fork?: { is_flat?: boolean; direction?: string };
    ai_fork?: { is_flat?: boolean; direction?: string };
    active_forks?: string[];
  } | undefined;
  if (!ensemble) return false;

  // Use active_forks if available (new format)
  if (ensemble.active_forks) {
    return ensemble.active_forks.length === 0;
  }

  // Fallback: check is_flat flags on individual forks
  const userFlat = !ensemble.user_fork || ensemble.user_fork.is_flat === true;
  const aiFlat = !ensemble.ai_fork || ensemble.ai_fork.is_flat === true;
  return userFlat && aiFlat;
}

// Build analyst summary from predictions (excluding flat-only analysts)
const analysts = computed<AnalystSummary[]>(() => {
  return props.predictions
    .filter(p => p.analystSlug && p.analystSlug !== 'arbitrator')
    .filter(p => !isFlatOnlyAnalyst(p))
    .map(p => ({
      slug: p.analystSlug!,
      name: formatAnalystName(p.analystSlug!),
      direction: p.direction || 'flat',
      confidence: p.confidence || 0,
    }))
    .sort((a, b) => {
      // Sort by analyst order: Fred, Tina, Sally, Alex, Carl
      const order = ['fundamental-fred', 'technical-tina', 'sentiment-sally', 'aggressive-alex', 'cautious-carl'];
      return order.indexOf(a.slug) - order.indexOf(b.slug);
    });
});

// Determine consensus direction from the arbitrator prediction or majority vote
const consensusDirection = computed(() => {
  // Prefer arbitrator prediction if it exists
  const arbitrator = props.predictions.find(p => p.isArbitrator);
  if (arbitrator) return arbitrator.direction;
  // Otherwise use majority direction
  const upCount = analysts.value.filter(a => a.direction === 'up' || a.direction === 'bullish').length;
  const downCount = analysts.value.filter(a => a.direction === 'down' || a.direction === 'bearish').length;
  if (upCount > downCount) return 'up';
  if (downCount > upCount) return 'down';
  return 'flat';
});

// Can trade if predictions are active and directional
const canTrade = computed(() => {
  const hasActive = props.predictions.some(p => p.status === 'active');
  const dir = consensusDirection.value;
  return hasActive && (dir === 'up' || dir === 'down');
});

function formatAnalystName(slug: string): string {
  const nameMap: Record<string, string> = {
    'fundamental-fred': 'Fundamental Fred',
    'technical-tina': 'Technical Tina',
    'sentiment-sally': 'Sentiment Sally',
    'aggressive-alex': 'Aggressive Alex',
    'cautious-carl': 'Cautious Carl',
  };
  return nameMap[slug] || slug;
}

function getFullName(slug: string): string {
  const nameMap: Record<string, string> = {
    'fundamental-fred': 'Fundamental Fred',
    'technical-tina': 'Technical Tina',
    'sentiment-sally': 'Sentiment Sally',
    'aggressive-alex': 'Aggressive Alex',
    'cautious-carl': 'Cautious Carl',
  };
  return nameMap[slug] || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDirectionClass(direction: string): string {
  const dir = direction?.toLowerCase();
  if (dir === 'up' || dir === 'bullish') return 'direction-up';
  if (dir === 'down' || dir === 'bearish') return 'direction-down';
  return 'direction-neutral';
}

function getAnalystClass(slug: string): string {
  const classMap: Record<string, string> = {
    'fundamental-fred': 'analyst-fred',
    'technical-tina': 'analyst-tina',
    'sentiment-sally': 'analyst-sally',
    'aggressive-alex': 'analyst-alex',
    'cautious-carl': 'analyst-carl',
  };
  return classMap[slug] || '';
}

function getDirectionArrow(direction: string): string {
  const dir = direction?.toLowerCase();
  if (dir === 'up' || dir === 'bullish') return '↑';
  if (dir === 'down' || dir === 'bearish') return '↓';
  return '→';
}

function formatInlinePrice(price: InstrumentPrice): string {
  if (price.currentPrice == null) return '';
  if (price.targetType === 'polymarket' || price.targetType === 'election') {
    return `${(price.currentPrice * 100).toFixed(1)}%`;
  }
  return price.currentPrice >= 1
    ? `$${price.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.currentPrice.toFixed(4)}`;
}

function formatPriceChange(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function priceChangeClass(pct: number): string {
  if (pct > 0) return 'price-up';
  if (pct < 0) return 'price-down';
  return 'price-flat';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.prediction-group-card {
  display: flex;
  flex-direction: column;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.prediction-group-card:hover {
  border-color: var(--ion-color-secondary, #15803d);
  box-shadow: 0 4px 12px rgba(21, 128, 61, 0.15);
  transform: translateY(-2px);
}

.prediction-group-card.selected {
  border-color: var(--ion-color-secondary, #15803d);
  background: var(--selected-bg, rgba(21, 128, 61, 0.06));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.target-symbol {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.target-name {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}

.test-badge {
  font-size: 0.5rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  background-color: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
}

.meta-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.125rem;
}

.inline-price {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.price-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.price-change {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.0625rem 0.1875rem;
  border-radius: 3px;
}

.price-up {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}

.price-down {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
}

.price-flat {
  color: var(--text-secondary, #6b7280);
}

.timeframe {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ion-color-secondary, #15803d);
}

.date {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
}

.analyst-indicators {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0;
  flex: 1;
}

.analyst-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.analyst-indicator:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.analyst-name {
  font-weight: 600;
  flex: 1;
}

.direction-arrow {
  font-size: 1.125rem;
  font-weight: 700;
}

/* Direction colors */
.analyst-indicator.direction-up {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.analyst-indicator.direction-down {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.analyst-indicator.direction-neutral {
  background: rgba(107, 114, 128, 0.15);
  color: #6b7280;
}

/* Analyst-specific accent colors (border) */
.analyst-indicator.analyst-fred {
  border: 2px solid rgba(21, 128, 61, 0.5);
}

.analyst-indicator.analyst-tina {
  border: 2px solid rgba(236, 72, 153, 0.5);
}

.analyst-indicator.analyst-sally {
  border: 2px solid rgba(34, 197, 94, 0.5);
}

.analyst-indicator.analyst-alex {
  border: 2px solid rgba(249, 115, 22, 0.5);
}

.analyst-indicator.analyst-carl {
  border: 2px solid rgba(107, 114, 128, 0.5);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.prediction-count {
  font-size: 0.625rem;
  color: var(--text-secondary, #6b7280);
}

.click-hint {
  font-size: 0.625rem;
  color: var(--text-tertiary, #9ca3af);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.prediction-group-card:hover .click-hint {
  opacity: 1;
}

.trade-buttons {
  display: flex;
  gap: 0.375rem;
}

.trade-button {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  letter-spacing: 0.025em;
}

.trade-button:hover {
  transform: scale(1.05);
}

.trade-buy {
  background: rgba(22, 163, 74, 0.15);
  color: #16a34a;
  border: 1px solid rgba(22, 163, 74, 0.3);
}

.trade-buy:hover {
  background: rgba(22, 163, 74, 0.25);
}

.trade-sell {
  background: rgba(220, 38, 38, 0.15);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
}

.trade-sell:hover {
  background: rgba(220, 38, 38, 0.25);
}

/* Dark mode */
html.ion-palette-dark .prediction-group-card,
html[data-theme="dark"] .prediction-group-card {
  --card-bg: #1f2937;
  --border-color: #374151;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-tertiary: #6b7280;
  --selected-bg: rgba(21, 128, 61, 0.15);
}
</style>
