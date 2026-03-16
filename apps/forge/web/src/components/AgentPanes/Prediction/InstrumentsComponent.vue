<template>
  <div class="instruments-component">
    <div class="instruments-header">
      <h3>Tracked Targets</h3>
      <div class="instruments-count">{{ targets.length }} targets</div>
    </div>

    <!-- Universe Filter -->
    <div v-if="universes.length > 0" class="filter-section">
      <label for="universe-filter">Filter by Universe:</label>
      <select id="universe-filter" v-model="selectedUniverseId" class="filter-select">
        <option :value="null">All Universes</option>
        <option v-for="universe in universes" :key="universe.id" :value="universe.id">
          {{ universe.name }}
        </option>
      </select>
    </div>

    <!-- Targets List -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <span>Loading targets...</span>
    </div>

    <div v-else-if="filteredTargets.length === 0" class="empty-state">
      No targets tracked yet. Configure universes and targets to get started.
    </div>

    <div v-else class="targets-list">
      <div
        v-for="target in filteredTargets"
        :key="target.id"
        class="target-card"
        :class="{ inactive: !target.active }"
      >
        <div class="target-info">
          <div class="target-symbol">{{ target.symbol }}</div>
          <div class="target-name">{{ target.name }}</div>
          <div class="target-meta">
            <span class="target-type">{{ target.targetType }}</span>
            <span v-if="!target.active" class="inactive-badge">Inactive</span>
          </div>
        </div>
        <div class="target-stats">
          <div class="stat">
            <span class="stat-value">{{ getPredictionCount(target.id) }}</span>
            <span class="stat-label">Predictions</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ getActivePredictionCount(target.id) }}</span>
            <span class="stat-label">Active</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Universe Grouping -->
    <div v-if="!selectedUniverseId && Object.keys(targetsByUniverse).length > 1" class="universe-breakdown">
      <h4>By Universe</h4>
      <div class="universe-cards">
        <div
          v-for="(universTargets, universeId) in targetsByUniverse"
          :key="universeId"
          class="universe-card"
          @click="selectedUniverseId = universeId"
        >
          <div class="universe-name">{{ getUniverseName(universeId) }}</div>
          <div class="universe-count">{{ universTargets.length }} targets</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePredictionStore } from '@/stores/predictionStore';

const store = usePredictionStore();

const selectedUniverseId = ref<string | null>(null);

const targets = computed(() => store.targets);
const universes = computed(() => store.universes);
const predictions = computed(() => store.predictions);
const targetsByUniverse = computed(() => store.targetsByUniverse);
const isLoading = computed(() => store.isLoading);

const filteredTargets = computed(() => {
  if (!selectedUniverseId.value) {
    return targets.value;
  }
  return targets.value.filter(t => t.universeId === selectedUniverseId.value);
});

function getUniverseName(universeId: string): string {
  const universe = universes.value.find(u => u.id === universeId);
  return universe?.name || 'Unknown';
}

function getPredictionCount(targetId: string): number {
  return predictions.value.filter(p => p.targetId === targetId).length;
}

function getActivePredictionCount(targetId: string): number {
  return predictions.value.filter(p => p.targetId === targetId && p.status === 'active').length;
}
</script>

<style scoped>
.instruments-component {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.instruments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.instruments-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.instruments-count {
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 600;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-section label {
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
}

.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: white;
}

.filter-select:focus {
  outline: none;
  border-color: #15803d;
  box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.1);
}

.loading-state,
.empty-state {
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

.targets-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.target-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  transition: box-shadow 0.2s;
}

.target-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.target-card.inactive {
  opacity: 0.6;
  background-color: #f9fafb;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.target-symbol {
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
}

.target-name {
  font-size: 0.875rem;
  color: #6b7280;
}

.target-meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.target-type {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background-color: #e5e7eb;
  border-radius: 0.25rem;
  color: #374151;
}

.inactive-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background-color: #fef3c7;
  border-radius: 0.25rem;
  color: #92400e;
}

.target-stats {
  display: flex;
  gap: 1rem;
}

.stat {
  text-align: center;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

.stat-label {
  font-size: 0.625rem;
  color: #6b7280;
  text-transform: uppercase;
}

.universe-breakdown {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.universe-breakdown h4 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
}

.universe-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.universe-card {
  padding: 0.75rem 1rem;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.universe-card:hover {
  background-color: #e5e7eb;
}

.universe-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
}

.universe-count {
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
