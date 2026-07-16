<template>
  <div class="financials">
    <div v-if="!hasAnyFinancialData" class="empty-state">
      No financial analysis available for the compared rooms.
    </div>

    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="metric-col">Specialist / Metric</th>
            <th v-for="room in rooms" :key="room.jobId" class="room-col">
              {{ room.targetCompany }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="spec in allSpecialists" :key="spec">
            <tr class="specialist-header-row">
              <td :colspan="rooms.length + 1" class="specialist-name">
                {{ specialistLabels[spec] || spec }}
              </td>
            </tr>
            <tr v-for="metric in metricsForSpecialist(spec)" :key="`${spec}-${metric}`">
              <td class="metric-col metric-label">{{ metric }}</td>
              <td
                v-for="room in rooms"
                :key="room.jobId"
                class="room-col"
                :style="{ background: riskColor(room.financialSummary[spec]?.overallRisk) }"
              >
                {{ getMetricValue(room, spec, metric) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ComparisonRoomSummary, Severity } from '../legalJobsService';

const props = defineProps<{
  rooms: ComparisonRoomSummary[];
}>();

const specialistLabels: Record<string, string> = {
  'cap-table': 'Cap Table',
  'working-capital': 'Working Capital',
  'debt-schedule': 'Debt Schedule',
  'revenue-concentration': 'Revenue Concentration',
  'financial-statements': 'Financial Statements',
};

const allSpecialists = computed(() => {
  const specSet = new Set<string>();
  for (const room of props.rooms) {
    for (const key of Object.keys(room.financialSummary)) {
      specSet.add(key);
    }
  }
  return Array.from(specSet);
});

const hasAnyFinancialData = computed(() => allSpecialists.value.length > 0);

function metricsForSpecialist(spec: string): string[] {
  const labels = new Set<string>();
  for (const room of props.rooms) {
    const summary = room.financialSummary[spec];
    if (summary?.keyMetrics) {
      for (const m of summary.keyMetrics) {
        labels.add(m.label);
      }
    }
  }
  return Array.from(labels);
}

function getMetricValue(
  room: ComparisonRoomSummary,
  spec: string,
  metricLabel: string,
): string {
  const summary = room.financialSummary[spec];
  if (!summary) return 'N/A';
  const metric = summary.keyMetrics.find((m) => m.label === metricLabel);
  if (!metric) return 'N/A';
  return typeof metric.value === 'number'
    ? metric.value.toLocaleString()
    : metric.value;
}

function riskColor(risk?: Severity): string {
  switch (risk) {
    case 'critical':
      return 'rgba(239, 68, 68, 0.15)';
    case 'high':
      return 'rgba(249, 115, 22, 0.15)';
    case 'medium':
      return 'rgba(234, 179, 8, 0.12)';
    case 'low':
      return 'rgba(34, 197, 94, 0.10)';
    default:
      return 'transparent';
  }
}
</script>

<style scoped>
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

th,
td {
  padding: 8px 14px;
  border: 1px solid var(--ion-color-light-shade, #333);
  text-align: center;
}

.metric-col {
  text-align: left;
  position: sticky;
  left: 0;
  background: var(--ion-background-color, #1a1a2e);
  z-index: 1;
  min-width: 160px;
}

.metric-label {
  padding-left: 24px;
  font-size: 0.9em;
}

.room-col {
  min-width: 120px;
}

.specialist-header-row td {
  background: var(--ion-color-light, #222) !important;
  border: none;
}

.specialist-name {
  font-weight: 600;
  text-align: left;
  padding: 8px 14px;
}
</style>
