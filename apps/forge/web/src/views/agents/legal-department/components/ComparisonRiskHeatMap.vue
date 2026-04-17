<template>
  <div class="risk-heat-map">
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="category-col">Category</th>
            <th v-for="room in rooms" :key="room.jobId" class="room-col">
              <div class="room-header">
                <span class="room-name">{{ room.targetCompany }}</span>
                <span
                  v-if="room.dealBreakerCount > 0"
                  class="deal-breaker-badge"
                >{{ room.dealBreakerCount }} DB</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cat in categories" :key="cat">
            <td class="category-col category-label">{{ categoryLabels[cat] }}</td>
            <td
              v-for="room in rooms"
              :key="room.jobId"
              class="room-col"
              :style="{ background: cellColor(room.riskSummary.byCategory[cat]) }"
            >
              <span class="cell-count">{{ cellTotal(room.riskSummary.byCategory[cat]) }}</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td class="category-col"><strong>Total</strong></td>
            <td v-for="room in rooms" :key="room.jobId" class="room-col">
              <div class="severity-counts">
                <span class="sev critical" v-if="room.riskSummary.totalBySeverity.critical">
                  {{ room.riskSummary.totalBySeverity.critical }}C
                </span>
                <span class="sev high" v-if="room.riskSummary.totalBySeverity.high">
                  {{ room.riskSummary.totalBySeverity.high }}H
                </span>
                <span class="sev medium" v-if="room.riskSummary.totalBySeverity.medium">
                  {{ room.riskSummary.totalBySeverity.medium }}M
                </span>
                <span class="sev low" v-if="room.riskSummary.totalBySeverity.low">
                  {{ room.riskSummary.totalBySeverity.low }}L
                </span>
                <span v-if="cellTotal(room.riskSummary.totalBySeverity) === 0" class="zero">0</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComparisonRoomSummary, RiskCategory, SeverityCounts } from '../legalJobsService';

defineProps<{
  rooms: ComparisonRoomSummary[];
}>();

const categories: RiskCategory[] = [
  'contractual',
  'ip',
  'employment',
  'regulatory',
  'financial',
  'corporate',
  'environmental',
];

const categoryLabels: Record<RiskCategory, string> = {
  contractual: 'Contractual',
  ip: 'Intellectual Property',
  employment: 'Employment',
  regulatory: 'Regulatory',
  financial: 'Financial',
  corporate: 'Corporate',
  environmental: 'Environmental',
};

function cellTotal(counts: SeverityCounts): number {
  return counts.critical + counts.high + counts.medium + counts.low;
}

function highestSeverity(counts: SeverityCounts): string {
  if (counts.critical > 0) return 'critical';
  if (counts.high > 0) return 'high';
  if (counts.medium > 0) return 'medium';
  if (counts.low > 0) return 'low';
  return 'none';
}

function cellColor(counts: SeverityCounts): string {
  const sev = highestSeverity(counts);
  switch (sev) {
    case 'critical':
      return 'rgba(239, 68, 68, 0.25)';
    case 'high':
      return 'rgba(249, 115, 22, 0.25)';
    case 'medium':
      return 'rgba(234, 179, 8, 0.20)';
    case 'low':
      return 'rgba(34, 197, 94, 0.15)';
    default:
      return 'transparent';
  }
}
</script>

<style scoped>
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
  padding: 10px 14px;
  border: 1px solid var(--ion-color-light-shade, #333);
  text-align: center;
}

.category-col {
  text-align: left;
  white-space: nowrap;
  position: sticky;
  left: 0;
  background: var(--ion-background-color, #1a1a2e);
  z-index: 1;
  min-width: 140px;
}

.category-label {
  font-weight: 500;
}

.room-col {
  min-width: 120px;
}

.room-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.room-name {
  font-weight: 600;
  font-size: 0.85em;
}

.deal-breaker-badge {
  background: #ef4444;
  color: white;
  font-size: 0.7em;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 700;
}

.cell-count {
  font-weight: 600;
  font-size: 1.1em;
}

.total-row td {
  border-top: 2px solid var(--ion-color-medium);
}

.severity-counts {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}

.sev {
  font-size: 0.8em;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
}

.sev.critical {
  color: #ef4444;
}

.sev.high {
  color: #f97316;
}

.sev.medium {
  color: #eab308;
}

.sev.low {
  color: #22c55e;
}

.zero {
  color: var(--ion-color-medium);
}
</style>
