<template>
  <div v-if="hasAnyFinancialContent" class="financial-findings-panel">
    <h3 class="panel-title">Financial Findings</h3>
    <p class="panel-subtitle">
      Direct tabular views of the financial specialists' structured output.
      Empty where a specialist ran but did not produce a table.
    </p>

    <!-- Cap Table -->
    <section v-if="capTableTables.length > 0" class="fin-section">
      <h4>Cap Table Snapshot</h4>
      <div
        v-for="item in capTableTables"
        :key="`cap-${item.documentId}`"
        class="fin-block"
      >
        <div class="fin-source">
          Source:
          <span class="fin-doc-name">{{ item.documentName }}</span>
        </div>
        <table
          v-if="
            item.table &&
            Array.isArray(item.table.columns) &&
            item.table.columns.length > 0 &&
            Array.isArray(item.table.rows)
          "
        >
          <thead>
            <tr>
              <th v-for="col in item.table.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in item.table.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <ul v-else class="fin-fallback-list">
          <li v-for="(f, i) in item.findings" :key="i">
            <span class="severity" :class="'sev-' + f.severity">
              [{{ f.severity }}]
            </span>
            {{ f.finding }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Working Capital / AR-AP Aging -->
    <section v-if="workingCapitalTables.length > 0" class="fin-section">
      <h4>Working Capital &amp; Aging</h4>
      <div
        v-for="item in workingCapitalTables"
        :key="`wc-${item.documentId}`"
        class="fin-block"
      >
        <div class="fin-source">
          Source:
          <span class="fin-doc-name">{{ item.documentName }}</span>
        </div>
        <table
          v-if="
            item.table &&
            Array.isArray(item.table.columns) &&
            item.table.columns.length > 0 &&
            Array.isArray(item.table.rows)
          "
        >
          <thead>
            <tr>
              <th v-for="col in item.table.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in item.table.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <ul v-else class="fin-fallback-list">
          <li v-for="(f, i) in item.findings" :key="i">
            <span class="severity" :class="'sev-' + f.severity">
              [{{ f.severity }}]
            </span>
            {{ f.finding }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Debt Schedule -->
    <section v-if="debtScheduleTables.length > 0" class="fin-section">
      <h4>Debt Schedule Highlights</h4>
      <div
        v-for="item in debtScheduleTables"
        :key="`debt-${item.documentId}`"
        class="fin-block"
      >
        <div class="fin-source">
          Source:
          <span class="fin-doc-name">{{ item.documentName }}</span>
        </div>
        <table
          v-if="
            item.table &&
            Array.isArray(item.table.columns) &&
            item.table.columns.length > 0 &&
            Array.isArray(item.table.rows)
          "
        >
          <thead>
            <tr>
              <th v-for="col in item.table.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in item.table.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <ul v-else class="fin-fallback-list">
          <li v-for="(f, i) in item.findings" :key="i">
            <span class="severity" :class="'sev-' + f.severity">
              [{{ f.severity }}]
            </span>
            {{ f.finding }}
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface RunningFinding {
  documentId: string;
  documentName: string;
  finding: string;
  severity: string;
  category: string;
}

interface SpecialistSummary {
  specialistKey: string;
  documentCount: number;
  keyFindings: RunningFinding[];
}

interface TabularOutput {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface SpecialistOutput {
  tabular?: TabularOutput;
  keyFindings?: Array<{ finding?: string; severity?: string }>;
}

interface PerDocumentOutput {
  specialistOutputs?: Record<string, SpecialistOutput>;
}

interface DocumentIndexEntry {
  documentId: string;
  name: string;
}

interface SectionItem {
  documentId: string;
  documentName: string;
  table: TabularOutput | null;
  findings: Array<{ finding: string; severity: string }>;
}

/**
 * Props accept loosely-typed `Record<string, unknown>` maps from the
 * risk-matrix endpoint (the backend serializes LangGraph state as plain
 * JSON). We narrow at the access site via the typed interfaces above.
 */
const props = defineProps<{
  runningFindings: Record<string, unknown>;
  perDocumentOutputs: Record<string, unknown>;
  documentIndex: DocumentIndexEntry[];
}>();

function asRunningFindings(): Record<string, SpecialistSummary> {
  return props.runningFindings as Record<string, SpecialistSummary>;
}

function asPerDocOutputs(): Record<string, PerDocumentOutput> {
  return props.perDocumentOutputs as Record<string, PerDocumentOutput>;
}

const FINANCIAL_KEYS = new Set([
  'financial-statements',
  'revenue-concentration',
  'working-capital',
  'cap-table',
  'debt-schedule',
]);

function hasAnyFinancialFindings(): boolean {
  for (const specialistKey of Object.keys(asRunningFindings())) {
    if (FINANCIAL_KEYS.has(specialistKey)) return true;
  }
  return false;
}

function buildSectionItems(specialistKey: string): SectionItem[] {
  const items: SectionItem[] = [];
  const seen = new Set<string>();
  const perDocOutputs = asPerDocOutputs();
  const runningFindings = asRunningFindings();

  // Prefer per-document outputs (one row per document that ran this specialist)
  for (const [docId, output] of Object.entries(perDocOutputs)) {
    const specialistOutput = output.specialistOutputs?.[specialistKey];
    if (!specialistOutput) continue;
    seen.add(docId);
    const docName =
      props.documentIndex.find((d) => d.documentId === docId)?.name ?? docId;

    const findings = Array.isArray(specialistOutput.keyFindings)
      ? specialistOutput.keyFindings
          .filter(
            (f): f is { finding: string; severity: string } =>
              typeof f.finding === 'string',
          )
          .map((f) => ({
            finding: f.finding,
            severity: (f.severity ?? 'medium').toLowerCase(),
          }))
      : [];

    // Normalize the tabular payload — the LLM sometimes emits a partial
    // structure (columns without rows, rows without columns, or scalar
    // values). Treat any malformed table as absent rather than rendering
    // broken rows or throwing on .length access.
    const rawTable = specialistOutput.tabular;
    const normalizedTable: TabularOutput | null =
      rawTable &&
      Array.isArray(rawTable.columns) &&
      rawTable.columns.length > 0 &&
      Array.isArray(rawTable.rows)
        ? { columns: rawTable.columns, rows: rawTable.rows }
        : null;

    items.push({
      documentId: docId,
      documentName: docName,
      table: normalizedTable,
      findings,
    });
  }

  // Fallback: if a specialist appears in runningFindings but no per-document
  // output carried it, synthesize a list item from runningFindings so the
  // panel still shows SOMETHING rather than silently dropping findings.
  const summary = runningFindings[specialistKey];
  if (summary && items.length === 0 && summary.keyFindings.length > 0) {
    const byDoc = new Map<string, RunningFinding[]>();
    for (const f of summary.keyFindings) {
      if (!byDoc.has(f.documentId)) byDoc.set(f.documentId, []);
      byDoc.get(f.documentId)!.push(f);
    }
    for (const [docId, findings] of byDoc) {
      if (seen.has(docId)) continue;
      items.push({
        documentId: docId,
        documentName: findings[0]!.documentName,
        table: null,
        findings: findings.map((f) => ({
          finding: f.finding,
          severity: f.severity,
        })),
      });
    }
  }

  return items;
}

const capTableTables = computed(() => buildSectionItems('cap-table'));
const workingCapitalTables = computed(() =>
  buildSectionItems('working-capital'),
);
const debtScheduleTables = computed(() => buildSectionItems('debt-schedule'));

const hasAnyFinancialContent = computed(() => {
  if (!hasAnyFinancialFindings()) return false;
  return (
    capTableTables.value.length > 0 ||
    workingCapitalTables.value.length > 0 ||
    debtScheduleTables.value.length > 0
  );
});
</script>

<style scoped>
.financial-findings-panel {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--ion-color-step-150, #e5e7eb);
  border-radius: 8px;
  background: var(--ion-background-color, #fff);
}

.panel-title {
  margin: 0 0 4px 0;
  font-size: 1.1rem;
  color: var(--ion-color-success, #2dd36f);
}

.panel-subtitle {
  margin: 0 0 16px 0;
  font-size: 0.85rem;
  color: var(--ion-color-medium, #92949c);
}

.fin-section {
  margin: 16px 0;
}
.fin-section h4 {
  margin: 12px 0 6px 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.fin-block {
  margin-bottom: 16px;
  padding: 8px 12px;
  border-left: 3px solid var(--ion-color-success, #2dd36f);
  background: rgba(45, 211, 111, 0.05);
  border-radius: 4px;
}

.fin-source {
  font-size: 0.8rem;
  color: var(--ion-color-medium, #92949c);
  margin-bottom: 6px;
}
.fin-doc-name {
  color: var(--ion-color-primary, #3880ff);
  font-weight: 500;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-top: 4px;
}
thead th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 2px solid var(--ion-color-step-150, #e5e7eb);
  font-weight: 600;
}
tbody td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--ion-color-step-50, #f3f4f6);
}

.fin-fallback-list {
  margin: 4px 0;
  padding-left: 20px;
  font-size: 0.85rem;
}
.fin-fallback-list li {
  margin-bottom: 4px;
}

.severity {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-right: 6px;
}
.sev-critical {
  background: rgba(235, 68, 90, 0.15);
  color: var(--ion-color-danger, #eb445a);
}
.sev-high {
  background: rgba(230, 126, 34, 0.15);
  color: #e67e22;
}
.sev-medium {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
}
.sev-low {
  background: rgba(45, 211, 111, 0.15);
  color: var(--ion-color-success, #2dd36f);
}
</style>
