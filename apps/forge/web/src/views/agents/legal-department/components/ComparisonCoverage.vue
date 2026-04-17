<template>
  <div class="coverage">
    <!-- Coverage summary cards -->
    <div class="coverage-grid">
      <div v-for="room in rooms" :key="room.jobId" class="coverage-card">
        <div class="card-header">
          <strong>{{ room.targetCompany }}</strong>
          <ion-badge :color="statusColor(room.status)">{{ room.status }}</ion-badge>
        </div>

        <div class="stats-row">
          <div class="stat">
            <span class="stat-value">{{ room.documentCount }}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat">
            <span class="stat-value analyzed">{{ room.analyzedCount }}</span>
            <span class="stat-label">Analyzed</span>
          </div>
          <div class="stat">
            <span class="stat-value pending">{{ room.documentCount - room.analyzedCount }}</span>
            <span class="stat-label">Pending/Failed</span>
          </div>
          <div class="stat">
            <span class="stat-value" :class="{ missing: room.missingDocumentCount > 0 }">
              {{ room.missingDocumentCount }}
            </span>
            <span class="stat-label">Missing</span>
          </div>
        </div>

        <div class="progress-bar">
          <div
            class="bar-segment analyzed-bar"
            :style="{ width: pct(room.analyzedCount, room.documentCount) }"
          />
          <div
            class="bar-segment pending-bar"
            :style="{ width: pct(room.documentCount - room.analyzedCount, room.documentCount) }"
          />
        </div>

        <div class="card-footer">
          <span>Progress: {{ room.progress }}%</span>
          <span v-if="room.completedAt">
            Completed: {{ formatDate(room.completedAt) }}
          </span>
          <span v-else class="in-progress">In progress</span>
        </div>
      </div>
    </div>

    <!-- Chart placeholder using simple CSS bars instead of Chart.js for now -->
    <div v-if="rooms.length > 1" class="chart-section">
      <h3>Document Status Distribution</h3>
      <div class="bar-chart">
        <div v-for="room in rooms" :key="room.jobId" class="chart-row">
          <span class="chart-label">{{ room.targetCompany }}</span>
          <div class="chart-bar-container">
            <div
              class="chart-bar analyzed-bar"
              :style="{ width: pct(room.analyzedCount, maxDocs) }"
              :title="`${room.analyzedCount} analyzed`"
            />
            <div
              class="chart-bar pending-bar"
              :style="{ width: pct(room.documentCount - room.analyzedCount, maxDocs) }"
              :title="`${room.documentCount - room.analyzedCount} pending/failed`"
            />
            <div
              class="chart-bar missing-bar"
              :style="{ width: pct(room.missingDocumentCount, maxDocs) }"
              :title="`${room.missingDocumentCount} missing`"
            />
          </div>
          <span class="chart-total">{{ room.documentCount + room.missingDocumentCount }}</span>
        </div>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-dot analyzed-bar" /> Analyzed</span>
        <span class="legend-item"><span class="legend-dot pending-bar" /> Pending/Failed</span>
        <span class="legend-item"><span class="legend-dot missing-bar" /> Missing</span>
      </div>
    </div>

    <!-- Missing documents -->
    <div v-if="missingDocuments.length > 0" class="missing-section">
      <h3>Missing Documents</h3>
      <div v-for="(group, idx) in groupedMissing" :key="idx" class="missing-group">
        <h4>{{ group.targetCompany }}</h4>
        <div
          v-for="(doc, di) in group.items"
          :key="di"
          class="missing-item"
        >
          <ion-badge :color="importanceColor(doc.importance)">{{ doc.importance }}</ion-badge>
          <span>{{ doc.description }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonBadge } from '@ionic/vue';
import type {
  ComparisonRoomSummary,
  ComparisonMissingDocument,
  Severity,
} from '../legalJobsService';

const props = defineProps<{
  rooms: ComparisonRoomSummary[];
  missingDocuments: ComparisonMissingDocument[];
}>();

const maxDocs = computed(() =>
  Math.max(...props.rooms.map((r) => r.documentCount + r.missingDocumentCount), 1),
);

const groupedMissing = computed(() => {
  const byRoom = new Map<string, ComparisonMissingDocument[]>();
  for (const doc of props.missingDocuments) {
    if (!byRoom.has(doc.targetCompany)) byRoom.set(doc.targetCompany, []);
    byRoom.get(doc.targetCompany)!.push(doc);
  }
  return Array.from(byRoom.entries()).map(([targetCompany, items]) => ({
    targetCompany,
    items,
  }));
});

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'success';
    case 'processing':
      return 'primary';
    case 'failed':
      return 'danger';
    case 'awaiting_review':
      return 'warning';
    default:
      return 'medium';
  }
}

function importanceColor(importance: Severity): string {
  switch (importance) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'tertiary';
    default:
      return 'medium';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
</script>

<style scoped>
.coverage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.coverage-card {
  border: 1px solid var(--ion-color-light-shade, #333);
  border-radius: 8px;
  padding: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.3em;
  font-weight: 700;
}

.stat-value.analyzed {
  color: #22c55e;
}

.stat-value.pending {
  color: #eab308;
}

.stat-value.missing {
  color: #ef4444;
}

.stat-label {
  font-size: 0.7em;
  color: var(--ion-color-medium);
}

.progress-bar {
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--ion-color-light-shade, #333);
  margin-bottom: 8px;
}

.bar-segment {
  height: 100%;
}

.analyzed-bar {
  background: #22c55e;
}

.pending-bar {
  background: #eab308;
}

.missing-bar {
  background: #ef4444;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.in-progress {
  color: var(--ion-color-primary);
}

.chart-section {
  margin-bottom: 24px;
}

.chart-section h3 {
  margin: 0 0 12px;
  font-size: 1em;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-label {
  min-width: 150px;
  font-size: 0.85em;
  text-align: right;
}

.chart-bar-container {
  flex: 1;
  display: flex;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--ion-color-light-shade, #333);
}

.chart-bar {
  height: 100%;
}

.chart-total {
  min-width: 30px;
  font-size: 0.85em;
  font-weight: 600;
}

.chart-legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 0.8em;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.missing-section h3 {
  margin: 0 0 8px;
  font-size: 1em;
}

.missing-group {
  margin-bottom: 12px;
}

.missing-group h4 {
  margin: 0 0 6px;
  font-size: 0.9em;
}

.missing-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 0.9em;
}
</style>
