<template>
  <div class="price-ticker-strip" v-if="prices.length > 0">
    <div class="ticker-scroll">
      <button
        v-for="price in prices"
        :key="price.id"
        class="ticker-item"
        @click="$emit('select', price)"
      >
        <span class="ticker-symbol">{{ price.symbol }}</span>
        <span class="ticker-price" :class="{ stale: isStale(price) }">
          {{ formatPrice(price) }}
        </span>
        <span
          v-if="price.change24hPercent != null"
          class="ticker-change"
          :class="changeClass(price.change24hPercent)"
        >
          {{ formatChange(price.change24hPercent) }}
        </span>
        <span v-if="isStale(price)" class="stale-dot" title="Price may be stale (>30min old)"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InstrumentPrice } from '@/services/predictionDashboardService';

defineProps<{
  prices: InstrumentPrice[];
}>();

defineEmits<{
  select: [price: InstrumentPrice];
}>();

function formatPrice(price: InstrumentPrice): string {
  if (price.currentPrice == null) return '--';
  if (price.targetType === 'polymarket' || price.targetType === 'election') {
    return `${(price.currentPrice * 100).toFixed(1)}%`;
  }
  return price.currentPrice >= 1
    ? `$${price.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.currentPrice.toFixed(4)}`;
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function changeClass(pct: number): string {
  if (pct > 0) return 'change-up';
  if (pct < 0) return 'change-down';
  return 'change-flat';
}

function isStale(price: InstrumentPrice): boolean {
  if (!price.priceUpdatedAt) return true;
  const age = Date.now() - new Date(price.priceUpdatedAt).getTime();
  return age > 30 * 60 * 1000; // 30 minutes
}
</script>

<style scoped>
.price-ticker-strip {
  margin-bottom: 1rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--card-bg, #ffffff);
  overflow: hidden;
}

.ticker-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.ticker-scroll::-webkit-scrollbar {
  height: 4px;
}

.ticker-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color, #d1d5db);
  border-radius: 2px;
}

.ticker-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: none;
  border-right: 1px solid var(--border-color, #e5e7eb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s;
  font-family: inherit;
  flex-shrink: 0;
}

.ticker-item:last-child {
  border-right: none;
}

/* Remove bottom border from items in the last row */
@media (min-width: 1px) {
  .ticker-scroll {
    /* When wrapping, remove excess borders */
    margin-bottom: -1px;
  }

  .ticker-item:last-child {
    border-bottom: none;
  }
}

.ticker-item:hover {
  background: var(--hover-bg, #f9fafb);
}

.ticker-symbol {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}

.ticker-price {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary, #111827);
}

.ticker-price.stale {
  opacity: 0.6;
}

.ticker-change {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.0625rem 0.25rem;
  border-radius: 3px;
}

.change-up {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}

.change-down {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.1);
}

.change-flat {
  color: var(--text-secondary, #6b7280);
  background: rgba(107, 114, 128, 0.1);
}

.stale-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #eab308;
  flex-shrink: 0;
}

/* Dark mode only: when app theme is dark */
html.ion-palette-dark .price-ticker-strip,
html[data-theme="dark"] .price-ticker-strip {
  --border-color: #374151;
  --card-bg: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --hover-bg: #374151;
}
</style>
<style>
/* Light mode overrides - unscoped for html selector */
html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip,
html[data-theme="light"] .price-ticker-strip {
  background: #ffffff !important;
  border-color: #e5e7eb !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip .ticker-item,
html[data-theme="light"] .price-ticker-strip .ticker-item {
  border-color: #e5e7eb !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip .ticker-item:hover,
html[data-theme="light"] .price-ticker-strip .ticker-item:hover {
  background: #f9fafb !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip .ticker-symbol,
html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip .ticker-price,
html[data-theme="light"] .price-ticker-strip .ticker-symbol,
html[data-theme="light"] .price-ticker-strip .ticker-price {
  color: #111827 !important;
}

html:not(.ion-palette-dark):not([data-theme="dark"]) .price-ticker-strip .ticker-change.change-flat,
html[data-theme="light"] .price-ticker-strip .ticker-change.change-flat {
  color: #6b7280 !important;
}
</style>
