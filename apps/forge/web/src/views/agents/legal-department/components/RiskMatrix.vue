<template>
  <div class="risk-matrix-view">
    <!-- Deal-breaker flags -->
    <div v-if="dealBreakerFlags.length > 0" class="deal-breakers">
      <h3>Deal Breakers</h3>
      <div
        v-for="(flag, i) in dealBreakerFlags"
        :key="i"
        class="deal-breaker-card"
      >
        <div class="db-header">
          <span class="db-severity">CRITICAL</span>
          <span class="db-category">{{ flag.category }}</span>
        </div>
        <p class="db-finding">{{ flag.finding }}</p>
        <p class="db-reasoning">{{ flag.reasoning }}</p>
        <p class="db-recommendation">
          <strong>Recommendation:</strong> {{ flag.recommendation }}
        </p>
        <div class="db-docs">
          <span
            v-for="ref in flag.documentRefs"
            :key="ref.documentId"
            class="doc-ref"
          >
            {{ ref.documentName }}
          </span>
        </div>
      </div>
    </div>

    <!-- Risk Matrix Grid -->
    <div class="matrix-grid">
      <h3>Risk Matrix</h3>
      <table class="matrix-table">
        <thead>
          <tr>
            <th></th>
            <th
              v-for="cat in categories"
              :key="cat"
              class="cat-header"
            >
              {{ formatCategory(cat) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sev in severities" :key="sev">
            <td class="sev-label" :class="sev">{{ sev.toUpperCase() }}</td>
            <td
              v-for="cat in categories"
              :key="`${cat}-${sev}`"
              class="matrix-cell"
              :class="cellClass(cat, sev)"
              @click="expandCell(cat, sev)"
            >
              {{ getCellCount(cat, sev) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Expanded cell details -->
    <div v-if="expandedCell" class="cell-detail">
      <h4>
        {{ formatCategory(expandedCell.category) }} /
        {{ expandedCell.severity.toUpperCase() }}
      </h4>
      <ul>
        <li
          v-for="(ref, i) in expandedCell.refs"
          :key="i"
        >
          <strong>{{ ref.documentName }}:</strong> {{ ref.finding }}
        </li>
      </ul>
      <ion-button size="small" fill="clear" @click="expandedCell = null">
        Close
      </ion-button>
    </div>

    <!-- Missing Documents -->
    <div v-if="missingDocuments.length > 0" class="missing-docs">
      <h3>Missing Documents</h3>
      <ul>
        <li
          v-for="(md, i) in missingDocuments"
          :key="i"
          :class="md.importance"
        >
          <strong>[{{ md.importance.toUpperCase() }}]</strong>
          {{ md.description }}
          <span class="ref-source">
            (referenced in {{ md.referencedIn.documentName }})
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonButton } from '@ionic/vue';

interface DocumentRef {
  documentId: string;
  documentName: string;
  finding?: string;
}

interface RiskMatrixCell {
  category: string;
  severity: string;
  count: number;
  documentRefs: DocumentRef[];
}

interface DealBreakerFlagType {
  finding: string;
  category: string;
  severity: string;
  documentRefs: DocumentRef[];
  reasoning: string;
  recommendation: string;
}

interface MissingDocumentType {
  referencedIn: { documentId: string; documentName: string };
  description: string;
  importance: string;
}

const props = defineProps<{
  riskMatrix: { cells: RiskMatrixCell[] };
  dealBreakerFlags: DealBreakerFlagType[];
  missingDocuments: MissingDocumentType[];
}>();

const categories = [
  'contractual',
  'ip',
  'employment',
  'regulatory',
  'financial',
  'corporate',
  'environmental',
];
const severities = ['critical', 'high', 'medium', 'low'];

const cellMap = computed(() => {
  const map = new Map<string, RiskMatrixCell>();
  for (const cell of props.riskMatrix.cells) {
    map.set(`${cell.category}-${cell.severity}`, cell);
  }
  return map;
});

function getCellCount(cat: string, sev: string): number {
  return cellMap.value.get(`${cat}-${sev}`)?.count ?? 0;
}

function cellClass(cat: string, sev: string): string {
  const count = getCellCount(cat, sev);
  if (count === 0) return 'empty';
  return `has-findings ${sev}`;
}

const expandedCell = ref<{
  category: string;
  severity: string;
  refs: DocumentRef[];
} | null>(null);

function expandCell(cat: string, sev: string): void {
  const cell = cellMap.value.get(`${cat}-${sev}`);
  if (!cell || cell.count === 0) {
    expandedCell.value = null;
    return;
  }
  expandedCell.value = {
    category: cat,
    severity: sev,
    refs: cell.documentRefs,
  };
}

function formatCategory(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}
</script>

<style scoped>
.risk-matrix-view {
  padding: 16px;
  overflow: auto;
}

.deal-breakers {
  margin-bottom: 24px;
}
.deal-breakers h3 {
  color: var(--ion-color-danger);
  font-size: 1rem;
  margin: 0 0 8px;
}
.deal-breaker-card {
  border: 2px solid var(--ion-color-danger);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(var(--ion-color-danger-rgb), 0.05);
}
.db-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.db-severity {
  color: var(--ion-color-danger);
  font-weight: 700;
  font-size: 0.8rem;
}
.db-category {
  color: var(--ion-color-medium);
  font-size: 0.8rem;
  text-transform: capitalize;
}
.db-finding { font-weight: 600; margin: 4px 0; }
.db-reasoning { font-size: 0.85rem; color: var(--ion-color-step-600); }
.db-recommendation { font-size: 0.85rem; }
.db-docs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.doc-ref {
  font-size: 0.75rem;
  background: var(--ion-color-step-100);
  padding: 2px 6px;
  border-radius: 4px;
}

.matrix-grid h3 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.matrix-table th,
.matrix-table td {
  border: 1px solid var(--ion-color-step-150);
  padding: 8px;
  text-align: center;
}
.cat-header {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: capitalize;
}
.sev-label {
  font-weight: 700;
  font-size: 0.75rem;
  text-align: right;
  padding-right: 12px;
}
.sev-label.critical { color: var(--ion-color-danger); }
.sev-label.high { color: #e67e22; }
.sev-label.medium { color: #f39c12; }
.sev-label.low { color: var(--ion-color-success); }

.matrix-cell {
  cursor: pointer;
  transition: background 0.15s;
  min-width: 40px;
}
.matrix-cell.empty { color: var(--ion-color-step-200); }
.matrix-cell.has-findings.critical { background: rgba(var(--ion-color-danger-rgb), 0.2); font-weight: 700; }
.matrix-cell.has-findings.high { background: rgba(230, 126, 34, 0.2); font-weight: 600; }
.matrix-cell.has-findings.medium { background: rgba(243, 156, 18, 0.15); }
.matrix-cell.has-findings.low { background: rgba(var(--ion-color-success-rgb), 0.1); }
.matrix-cell:hover { background: var(--ion-color-step-100); }

.cell-detail {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  background: var(--ion-color-step-25);
}
.cell-detail h4 {
  margin: 0 0 8px;
  font-size: 0.9rem;
}
.cell-detail ul {
  margin: 0;
  padding-left: 20px;
  font-size: 0.85rem;
}
.cell-detail li { margin-bottom: 4px; }

.missing-docs {
  margin-top: 24px;
}
.missing-docs h3 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.missing-docs ul {
  list-style: none;
  padding: 0;
  font-size: 0.85rem;
}
.missing-docs li {
  margin-bottom: 6px;
  padding: 4px 0;
}
.missing-docs li.critical { color: var(--ion-color-danger); }
.missing-docs li.high { color: #e67e22; }
.ref-source { color: var(--ion-color-medium); font-size: 0.8rem; }
</style>
