<template>
  <div class="data-room-viewer">
    <!-- Stats bar -->
    <div class="stats-bar">
      <span class="stat total">{{ entries.length }} documents</span>
      <span class="stat complete">{{ completeCount }} complete</span>
      <span v-if="failedCount > 0" class="stat failed">{{ failedCount }} failed</span>
      <span class="stat pending">{{ pendingCount }} pending</span>
    </div>

    <!-- Filters -->
    <div class="filters">
      <ion-searchbar
        v-model="search"
        placeholder="Search documents..."
        :debounce="200"
        class="search"
      />
      <ion-select
        v-model="statusFilter"
        placeholder="Status"
        interface="popover"
        class="filter-select"
      >
        <ion-select-option value="">All</ion-select-option>
        <ion-select-option value="complete">Complete</ion-select-option>
        <ion-select-option value="analyzing">Analyzing</ion-select-option>
        <ion-select-option value="classified">Classified</ion-select-option>
        <ion-select-option value="failed">Failed</ion-select-option>
        <ion-select-option value="pending">Pending</ion-select-option>
      </ion-select>
    </div>

    <!-- Table -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="col-status">Status</th>
            <th class="col-name" @click="toggleSort('name')">
              Name {{ sortIcon('name') }}
            </th>
            <th class="col-type" @click="toggleSort('documentType')">
              Type {{ sortIcon('documentType') }}
            </th>
            <th class="col-parties">Parties</th>
            <th class="col-date" @click="toggleSort('date')">
              Date {{ sortIcon('date') }}
            </th>
            <th class="col-risk" @click="toggleSort('riskScore')">
              Risk {{ sortIcon('riskScore') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in filteredEntries" :key="entry.documentId">
            <tr
              :class="['doc-row', entry.status, { expanded: expanded === entry.documentId }]"
              @click="toggleExpand(entry.documentId)"
            >
              <td class="col-status">
                <span :class="['status-icon', entry.status]" :title="entry.status">
                  {{ statusIcon(entry.status) }}
                </span>
              </td>
              <td class="col-name">{{ entry.name }}</td>
              <td class="col-type">{{ entry.documentType }}</td>
              <td class="col-parties">{{ entry.parties?.join(', ') || '—' }}</td>
              <td class="col-date">{{ entry.date || '—' }}</td>
              <td class="col-risk">
                <span v-if="entry.riskScore != null" :class="riskClass(entry.riskScore)">
                  {{ entry.riskScore }}
                </span>
                <span v-else class="risk-na">—</span>
              </td>
            </tr>
            <tr v-if="expanded === entry.documentId" class="detail-row">
              <td colspan="6">
                <div class="detail-content">
                  <p><strong>Summary:</strong> {{ entry.summary }}</p>
                  <p v-if="entry.error" class="error-text">
                    <strong>Error:</strong> {{ entry.error }}
                  </p>
                  <p v-if="entry.specialistsAssigned?.length">
                    <strong>Specialists:</strong>
                    {{ entry.specialistsAssigned.join(', ') }}
                    ({{ entry.specialistsCompleted?.length || 0 }} completed)
                  </p>
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
import { ref, computed } from 'vue';
import { IonSearchbar, IonSelect, IonSelectOption } from '@ionic/vue';

export interface DocIndexEntry {
  documentId: string;
  name: string;
  documentType: string;
  parties: string[];
  date: string | null;
  summary: string;
  riskScore: number | null;
  status: string;
  error?: string;
  specialistsAssigned: string[];
  specialistsCompleted: string[];
}

const props = defineProps<{
  entries: DocIndexEntry[];
}>();

const search = ref('');
const statusFilter = ref('');
const sortKey = ref<string>('name');
const sortAsc = ref(true);
const expanded = ref<string | null>(null);

const completeCount = computed(
  () => props.entries.filter((e) => e.status === 'complete').length,
);
const failedCount = computed(
  () => props.entries.filter((e) => e.status === 'failed').length,
);
const pendingCount = computed(
  () =>
    props.entries.filter(
      (e) => e.status === 'pending' || e.status === 'classifying' || e.status === 'classified',
    ).length,
);

const filteredEntries = computed(() => {
  let result = [...props.entries];

  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.documentType.toLowerCase().includes(q) ||
        e.parties?.some((p) => p.toLowerCase().includes(q)),
    );
  }

  if (statusFilter.value) {
    result = result.filter((e) => e.status === statusFilter.value);
  }

  result.sort((a, b) => {
    const key = sortKey.value as keyof DocIndexEntry;
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortAsc.value ? cmp : -cmp;
  });

  return result;
});

function toggleSort(key: string): void {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function sortIcon(key: string): string {
  if (sortKey.value !== key) return '';
  return sortAsc.value ? '\u25B2' : '\u25BC';
}

function toggleExpand(id: string): void {
  expanded.value = expanded.value === id ? null : id;
}

function statusIcon(status: string): string {
  if (status === 'complete') return '\u2705';
  if (status === 'failed') return '\u274C';
  if (status === 'analyzing' || status === 'classifying') return '\u23F3';
  if (status === 'classified') return '\u2611\uFE0F';
  return '\u25CB'; // pending
}

function riskClass(score: number): string {
  if (score >= 75) return 'risk-critical';
  if (score >= 50) return 'risk-high';
  if (score >= 25) return 'risk-medium';
  return 'risk-low';
}
</script>

<style scoped>
.data-room-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--ion-color-step-100);
}
.stat.complete { color: var(--ion-color-success); }
.stat.failed { color: var(--ion-color-danger); }
.stat.pending { color: var(--ion-color-medium); }

.filters {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
}
.search { flex: 1; --border-radius: 8px; }
.filter-select { max-width: 150px; }

.table-wrapper {
  flex: 1;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

thead th {
  position: sticky;
  top: 0;
  background: var(--ion-background-color, #fff);
  border-bottom: 2px solid var(--ion-color-step-150);
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}

tbody td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--ion-color-step-50);
}

.doc-row {
  cursor: pointer;
  transition: background 0.15s;
}
.doc-row:hover { background: var(--ion-color-step-25); }
.doc-row.expanded { background: var(--ion-color-step-50); }

.col-status { width: 40px; text-align: center; }
.col-name { min-width: 200px; }
.col-type { width: 120px; }
.col-parties { width: 180px; }
.col-date { width: 100px; }
.col-risk { width: 60px; text-align: center; }

.status-icon { font-size: 1rem; }

.risk-critical { color: var(--ion-color-danger); font-weight: 700; }
.risk-high { color: #e67e22; font-weight: 600; }
.risk-medium { color: #f39c12; }
.risk-low { color: var(--ion-color-success); }
.risk-na { color: var(--ion-color-medium); }

.detail-row td {
  padding: 12px 16px;
  background: var(--ion-color-step-25);
}
.detail-content {
  font-size: 0.85rem;
  line-height: 1.5;
}
.error-text { color: var(--ion-color-danger); }
</style>
