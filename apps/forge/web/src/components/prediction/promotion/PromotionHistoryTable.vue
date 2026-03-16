<template>
  <div class="promotion-history-table">
    <div v-if="history.length === 0" class="empty-state">
      <span class="empty-icon">📋</span>
      <p>No promotion history yet</p>
    </div>

    <div v-else class="table-container">
      <table class="history-table">
        <thead>
          <tr>
            <th class="col-expand"></th>
            <th class="col-test-learning">Test Learning</th>
            <th class="col-prod-learning">Production Learning</th>
            <th class="col-promoter">Promoted By</th>
            <th class="col-date">Date</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in history" :key="entry.id">
            <tr
              class="history-row"
              :class="{ expanded: expandedRows.has(entry.id) }"
              @click="toggleRow(entry.id)"
            >
              <td class="col-expand">
                <span class="expand-icon">{{ expandedRows.has(entry.id) ? '▼' : '▶' }}</span>
              </td>
              <td class="col-test-learning">
                <span class="learning-title">{{ entry.testLearningTitle }}</span>
              </td>
              <td class="col-prod-learning">
                <span class="learning-title">{{ entry.productionLearningTitle }}</span>
              </td>
              <td class="col-promoter">
                <div class="promoter-info">
                  <span class="promoter-name">{{ entry.promotedByName || entry.promotedByEmail || 'Unknown' }}</span>
                </div>
              </td>
              <td class="col-date">
                <span class="date">{{ formatDate(entry.promotedAt) }}</span>
              </td>
              <td class="col-actions" @click.stop>
                <button
                  class="btn btn-sm btn-secondary"
                  @click="$emit('view-test', entry.testLearningId)"
                  title="View test learning"
                >
                  View Test
                </button>
                <button
                  class="btn btn-sm btn-primary"
                  @click="$emit('view-prod', entry.productionLearningId)"
                  title="View production learning"
                >
                  View Prod
                </button>
              </td>
            </tr>
            <tr v-if="expandedRows.has(entry.id)" class="expanded-content">
              <td colspan="6">
                <div class="details-panel">
                  <div v-if="entry.reviewerNotes" class="notes-section">
                    <h4>Reviewer Notes</h4>
                    <p>{{ entry.reviewerNotes }}</p>
                  </div>

                  <div v-if="entry.validationMetrics" class="validation-section">
                    <h4>Validation Metrics</h4>
                    <pre class="metrics-json">{{ formatJSON(entry.validationMetrics) }}</pre>
                  </div>

                  <div v-if="entry.backtestResult" class="backtest-section">
                    <h4>Backtest Result</h4>
                    <pre class="metrics-json">{{ formatJSON(entry.backtestResult) }}</pre>
                  </div>

                  <div v-if="entry.scenarioRuns && entry.scenarioRuns.length > 0" class="scenarios-section">
                    <h4>Scenario Runs</h4>
                    <div class="scenario-list">
                      <span
                        v-for="scenarioId in entry.scenarioRuns"
                        :key="scenarioId"
                        class="scenario-badge"
                      >
                        {{ scenarioId }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { PromotionHistory } from '@/services/learningPromotionService';

interface Props {
  history: PromotionHistory[];
}

defineProps<Props>();

defineEmits<{
  'view-test': [id: string];
  'view-prod': [id: string];
}>();

const expandedRows = ref(new Set<string>());

function toggleRow(id: string) {
  if (expandedRows.value.has(id)) {
    expandedRows.value.delete(id);
  } else {
    expandedRows.value.add(id);
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatJSON(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2);
}
</script>

<style scoped>
.promotion-history-table {
  width: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: var(--ion-color-medium, #6b7280);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.table-container {
  overflow-x: auto;
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 8px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--ion-card-background, #ffffff);
}

.history-table thead {
  background: var(--ion-color-light, #f3f4f6);
}

.history-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ion-color-medium, #6b7280);
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
}

.history-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ion-border-color, #e5e7eb);
  font-size: 0.875rem;
  color: var(--ion-text-color, #111827);
}

.col-expand {
  width: 40px;
  text-align: center;
}

.col-test-learning,
.col-prod-learning {
  min-width: 200px;
}

.col-promoter {
  min-width: 150px;
}

.col-date {
  min-width: 150px;
}

.col-actions {
  min-width: 180px;
}

.history-row {
  cursor: pointer;
  transition: background 0.2s;
}

.history-row:hover {
  background: var(--ion-color-light, #f9fafb);
}

.history-row.expanded {
  background: rgba(21, 128, 61, 0.06);
}

.expand-icon {
  display: inline-block;
  font-size: 0.75rem;
  color: var(--ion-color-medium, #6b7280);
  transition: transform 0.2s;
}

.learning-title {
  font-weight: 500;
}

.promoter-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.promoter-name {
  font-weight: 500;
}

.date {
  color: var(--ion-color-medium, #6b7280);
}

.col-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.75rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: var(--ion-color-secondary, #15803d);
  color: white;
}

.btn-primary:hover {
  background: var(--ion-color-secondary-shade, #166534);
}

.btn-secondary {
  background: var(--ion-color-light, #f3f4f6);
  color: var(--ion-text-color, #111827);
}

.btn-secondary:hover {
  background: var(--ion-color-medium-tint, #e5e7eb);
}

.expanded-content {
  background: var(--ion-color-primary-tint, #f0f9ff);
}

.expanded-content td {
  padding: 0;
}

.details-panel {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.notes-section h4,
.validation-section h4,
.backtest-section h4,
.scenarios-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ion-text-color, #111827);
}

.notes-section p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ion-color-medium, #6b7280);
}

.metrics-json {
  margin: 0;
  padding: 0.75rem;
  background: var(--ion-background-color, #ffffff);
  border: 1px solid var(--ion-border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  overflow-x: auto;
  color: var(--ion-text-color, #111827);
}

.scenario-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.scenario-badge {
  padding: 0.25rem 0.5rem;
  background: var(--ion-color-secondary-tint, rgba(139, 92, 246, 0.1));
  color: var(--ion-color-secondary, #7c3aed);
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: monospace;
}
</style>
