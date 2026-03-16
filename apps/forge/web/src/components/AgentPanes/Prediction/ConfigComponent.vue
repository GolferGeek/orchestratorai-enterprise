<template>
  <div class="config-component">
    <div class="config-header">
      <h3>Configuration</h3>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading configuration...</span>
    </div>

    <div v-else class="config-content">
      <!-- Strategies Section -->
      <div class="config-section">
        <h4>Available Strategies</h4>
        <div v-if="strategies.length === 0" class="empty-message">
          No strategies configured.
        </div>
        <div v-else class="strategies-list">
          <div
            v-for="strategy in strategies"
            :key="strategy.id"
            class="strategy-card"
            :class="{ 'is-system': strategy.isSystem }"
          >
            <div class="strategy-header">
              <div class="strategy-name">{{ strategy.name }}</div>
              <div class="strategy-badges">
                <span class="risk-badge" :class="`risk-${strategy.riskLevel}`">
                  {{ strategy.riskLevel }}
                </span>
                <span v-if="strategy.isSystem" class="system-badge">System</span>
              </div>
            </div>
            <div class="strategy-description">{{ strategy.description }}</div>
            <div class="strategy-params">
              <div v-if="strategy.parameters.minPredictors" class="param">
                <span class="param-label">Min Predictors:</span>
                <span class="param-value">{{ strategy.parameters.minPredictors }}</span>
              </div>
              <div v-if="strategy.parameters.minCombinedStrength" class="param">
                <span class="param-label">Min Strength:</span>
                <span class="param-value">{{ strategy.parameters.minCombinedStrength }}</span>
              </div>
              <div v-if="strategy.parameters.minDirectionConsensus" class="param">
                <span class="param-label">Min Consensus:</span>
                <span class="param-value">{{ (strategy.parameters.minDirectionConsensus * 100).toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Universes Configuration Summary -->
      <div class="config-section">
        <h4>Universes Summary</h4>
        <div v-if="universes.length === 0" class="empty-message">
          No universes configured.
        </div>
        <div v-else class="universes-summary">
          <div
            v-for="universe in universes"
            :key="universe.id"
            class="universe-item"
          >
            <div class="universe-name">{{ universe.name }}</div>
            <div class="universe-meta">
              <span class="universe-domain">{{ universe.domain }}</span>
              <span class="universe-targets">{{ getTargetCount(universe.id) }} targets</span>
            </div>
            <div v-if="universe.llmConfig?.tiers" class="universe-tiers">
              <span v-if="universe.llmConfig.tiers.gold" class="tier gold">
                Gold: {{ universe.llmConfig.tiers.gold.model }}
              </span>
              <span v-if="universe.llmConfig.tiers.silver" class="tier silver">
                Silver: {{ universe.llmConfig.tiers.silver.model }}
              </span>
              <span v-if="universe.llmConfig.tiers.bronze" class="tier bronze">
                Bronze: {{ universe.llmConfig.tiers.bronze.model }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Section -->
      <div class="config-section info-section">
        <h4>Pipeline Configuration</h4>
        <p class="help-text">
          The prediction pipeline uses A2A (Agent-to-Agent) protocol for all operations.
          Configuration is managed through universes, strategies, and sources.
        </p>
        <div class="config-links">
          <div class="link-item">
            <span class="link-label">Universes:</span>
            <span class="link-desc">Define prediction domains and LLM tiers</span>
          </div>
          <div class="link-item">
            <span class="link-label">Targets:</span>
            <span class="link-desc">Configure symbols/markets to track</span>
          </div>
          <div class="link-item">
            <span class="link-label">Sources:</span>
            <span class="link-desc">Data sources for signal collection</span>
          </div>
          <div class="link-item">
            <span class="link-label">Analysts:</span>
            <span class="link-desc">AI analysts with different perspectives</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { usePredictionStore } from '@/stores/predictionStore';
import { predictionDashboardService, type PredictionStrategy } from '@/services/predictionDashboardService';

const store = usePredictionStore();

const strategies = ref<PredictionStrategy[]>([]);
const isLoading = computed(() => store.isLoading);
const universes = computed(() => store.universes);
const targets = computed(() => store.targets);

onMounted(async () => {
  await loadStrategies();
});

async function loadStrategies() {
  store.setLoading(true);
  try {
    const response = await predictionDashboardService.listStrategies();
    if (response.content) {
      strategies.value = response.content;
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to load strategies');
  } finally {
    store.setLoading(false);
  }
}

function getTargetCount(universeId: string): number {
  return targets.value.filter(t => t.universeId === universeId).length;
}
</script>

<style scoped>
.config-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.config-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #6b7280;
}

.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 3px solid #e5e7eb;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.config-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.config-section {
  padding: 1.5rem;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.config-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
}

.empty-message {
  padding: 1rem;
  text-align: center;
  color: #6b7280;
  background-color: #f9fafb;
  border-radius: 0.375rem;
}

.strategies-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.strategy-card {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background-color: #f9fafb;
}

.strategy-card.is-system {
  border-color: #15803d;
  background-color: rgba(21, 128, 61, 0.06);
}

.strategy-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.strategy-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.strategy-badges {
  display: flex;
  gap: 0.5rem;
}

.risk-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
}

.risk-low {
  background-color: #d1fae5;
  color: #065f46;
}

.risk-medium {
  background-color: #fef3c7;
  color: #92400e;
}

.risk-high {
  background-color: #fee2e2;
  color: #991b1b;
}

.system-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  background-color: #dcfce7;
  color: #166534;
}

.strategy-description {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.75rem;
}

.strategy-params {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.param {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
}

.param-label {
  color: #6b7280;
}

.param-value {
  font-weight: 600;
  color: #111827;
}

.universes-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.universe-item {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  background-color: #f9fafb;
}

.universe-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
}

.universe-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.universe-domain {
  text-transform: capitalize;
}

.universe-tiers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.tier {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-family: monospace;
}

.tier.gold {
  background-color: #fef3c7;
  color: #92400e;
}

.tier.silver {
  background-color: #e5e7eb;
  color: #374151;
}

.tier.bronze {
  background-color: #fce7f3;
  color: #9d174d;
}

.info-section {
  background-color: #f0f9ff;
  border-color: #bae6fd;
}

.help-text {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: #0369a1;
}

.config-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.link-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.link-label {
  font-weight: 600;
  color: #0369a1;
  min-width: 80px;
}

.link-desc {
  color: #6b7280;
}
</style>
