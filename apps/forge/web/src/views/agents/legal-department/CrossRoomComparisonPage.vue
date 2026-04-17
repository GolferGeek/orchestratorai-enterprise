<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="router.push({ name: 'LegalDueDiligence' })">
            <ion-icon :icon="arrowBackOutline" slot="start" />
            Back to Rooms
          </ion-button>
        </ion-buttons>
        <ion-title>Compare DD Rooms</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="comparison-page">
        <!-- Room Selector (shown when no comparison result yet) -->
        <div v-if="!comparisonResult" class="selector-section">
          <div class="selector-header">
            <h2>Select Rooms to Compare</h2>
            <p>Choose 2–10 DD rooms to compare side by side.</p>
          </div>

          <div v-if="loading" class="loading-center">
            <ion-spinner name="crescent" />
            <p>{{ comparing ? 'Comparing rooms...' : 'Loading rooms...' }}</p>
          </div>

          <div v-else-if="ddRooms.length === 0" class="empty-state">
            No DD rooms available. Create rooms in the Due Diligence section first.
          </div>

          <div v-else class="room-list">
            <div
              v-for="room in ddRooms"
              :key="room.id"
              class="room-card"
              :class="{ selected: selectedIds.has(room.id) }"
              @click="toggleRoom(room.id)"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(room.id)"
                @click.prevent
                class="room-checkbox"
              />
              <div class="room-info">
                <strong>{{ getRoomTarget(room) }}</strong>
                <div class="room-meta">
                  <ion-badge :color="statusColor(room.status)">{{ room.status }}</ion-badge>
                  <span>{{ room.document_count }} docs</span>
                  <span>{{ formatDate(room.queued_at) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="selector-actions">
            <ion-button
              color="primary"
              :disabled="selectedIds.size < 2 || comparing"
              @click="runComparison"
            >
              <ion-spinner v-if="comparing" name="crescent" slot="start" />
              Compare {{ selectedIds.size }} Room{{ selectedIds.size !== 1 ? 's' : '' }}
            </ion-button>
            <span v-if="selectedIds.size > 10" class="limit-warning">
              Maximum 10 rooms
            </span>
          </div>
        </div>

        <!-- Comparison Dashboard (shown after comparison) -->
        <div v-else class="dashboard-section">
          <div class="dashboard-header">
            <ion-button fill="clear" @click="comparisonResult = null">
              <ion-icon :icon="arrowBackOutline" slot="start" />
              Back to Selection
            </ion-button>
            <h2>
              Comparing {{ comparisonResult.rooms.length }} Rooms
            </h2>
          </div>

          <div class="dashboard-actions">
            <ion-button fill="outline" size="small" @click="exportComparison">
              <ion-icon :icon="downloadOutline" slot="start" />
              Export Comparison
            </ion-button>
          </div>

          <ion-segment v-model="activePanel" mode="md">
            <ion-segment-button value="risk">Risk Heat Map</ion-segment-button>
            <ion-segment-button value="dealbreakers">Deal Breakers</ion-segment-button>
            <ion-segment-button value="financials">Financials</ion-segment-button>
            <ion-segment-button value="coverage">Coverage</ion-segment-button>
          </ion-segment>

          <div class="panel-content">
            <ComparisonRiskHeatMap
              v-if="activePanel === 'risk'"
              :rooms="comparisonResult.rooms"
            />
            <ComparisonDealBreakers
              v-else-if="activePanel === 'dealbreakers'"
              :deal-breakers="comparisonResult.dealBreakers"
              :rooms="comparisonResult.rooms"
            />
            <ComparisonFinancials
              v-else-if="activePanel === 'financials'"
              :rooms="comparisonResult.rooms"
            />
            <ComparisonCoverage
              v-else-if="activePanel === 'coverage'"
              :rooms="comparisonResult.rooms"
              :missing-documents="comparisonResult.missingDocuments"
            />
          </div>
        </div>

        <div v-if="error" class="error-banner">
          {{ error }}
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue';
import { arrowBackOutline, downloadOutline } from 'ionicons/icons';
import { useRbacStore } from '../../../stores/rbacStore';
import {
  legalJobsService,
  type AgentJobRow,
  type ComparisonResult,
} from './legalJobsService';
import ComparisonRiskHeatMap from './components/ComparisonRiskHeatMap.vue';
import ComparisonDealBreakers from './components/ComparisonDealBreakers.vue';
import ComparisonFinancials from './components/ComparisonFinancials.vue';
import ComparisonCoverage from './components/ComparisonCoverage.vue';

const router = useRouter();
const rbac = useRbacStore();

const orgSlug = computed(() => {
  const active = rbac.currentOrganization;
  if (active && active !== '*') return active;
  return null;
});

const context = computed(() => {
  if (!orgSlug.value || !rbac.user?.id) return null;
  return {
    orgSlug: orgSlug.value,
    userId: rbac.user.id,
    conversationId: '',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'local',
    model: 'default',
  };
});

const ddRooms = ref<AgentJobRow[]>([]);
const selectedIds = ref(new Set<string>());
const loading = ref(true);
const comparing = ref(false);
const error = ref<string | null>(null);
const comparisonResult = ref<ComparisonResult | null>(null);
const activePanel = ref('risk');

onMounted(async () => {
  if (!orgSlug.value || !rbac.user?.id) {
    error.value = !orgSlug.value
      ? 'No organization selected.'
      : 'Not authenticated.';
    loading.value = false;
    return;
  }
  try {
    ddRooms.value = await legalJobsService.listJobs(orgSlug.value, {
      jobType: 'due-diligence',
      callerUserId: rbac.user?.id,
    });
  } catch (e) {
    error.value = `Failed to load DD rooms: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    loading.value = false;
  }
});

function toggleRoom(id: string) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) {
    s.delete(id);
  } else if (s.size < 10) {
    s.add(id);
  }
  selectedIds.value = s;
}

async function runComparison() {
  if (selectedIds.value.size < 2 || selectedIds.value.size > 10 || !context.value) return;
  comparing.value = true;
  error.value = null;
  try {
    comparisonResult.value = await legalJobsService.compareRooms(
      context.value,
      Array.from(selectedIds.value),
    );
  } catch (e) {
    error.value = `Comparison failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    comparing.value = false;
  }
}

function exportComparison() {
  if (!comparisonResult.value) return;
  const cr = comparisonResult.value;
  const date = new Date().toLocaleDateString();
  const roomNames = cr.rooms.map((r) => r.targetCompany).join(', ');

  const categories = [
    'contractual', 'ip', 'employment', 'regulatory',
    'financial', 'corporate', 'environmental',
  ] as const;
  const catLabels: Record<string, string> = {
    contractual: 'Contractual', ip: 'IP', employment: 'Employment',
    regulatory: 'Regulatory', financial: 'Financial',
    corporate: 'Corporate', environmental: 'Environmental',
  };

  // Risk Heat Map table
  const riskHeader = `| Category | ${cr.rooms.map((r) => r.targetCompany).join(' | ')} |`;
  const riskSep = `| --- | ${cr.rooms.map(() => '---').join(' | ')} |`;
  const riskRows = categories.map((cat) => {
    const cells = cr.rooms.map((r) => {
      const c = r.riskSummary.byCategory[cat];
      const total = c.critical + c.high + c.medium + c.low;
      return total > 0 ? `${total} (${c.critical}C/${c.high}H/${c.medium}M/${c.low}L)` : '0';
    });
    return `| ${catLabels[cat]} | ${cells.join(' | ')} |`;
  });

  // Deal-breaker list
  const dbLines = cr.dealBreakers.length > 0
    ? cr.dealBreakers.map(
        (db) => `- **${db.targetCompany}** [${db.category}]: ${db.finding}\n  - Recommendation: ${db.recommendation}`,
      )
    : ['No deal-breakers found.'];

  // Financial table
  const specKeys = new Set<string>();
  for (const room of cr.rooms) {
    for (const key of Object.keys(room.financialSummary)) specKeys.add(key);
  }
  let financialSection = '';
  if (specKeys.size > 0) {
    const fHeader = `| Metric | ${cr.rooms.map((r) => r.targetCompany).join(' | ')} |`;
    const fSep = `| --- | ${cr.rooms.map(() => '---').join(' | ')} |`;
    const fRows: string[] = [];
    for (const spec of specKeys) {
      fRows.push(`| **${spec}** | ${cr.rooms.map(() => '').join(' | ')} |`);
      const allLabels = new Set<string>();
      for (const room of cr.rooms) {
        for (const m of room.financialSummary[spec]?.keyMetrics ?? []) {
          allLabels.add(m.label);
        }
      }
      for (const label of allLabels) {
        const cells = cr.rooms.map((r) => {
          const m = r.financialSummary[spec]?.keyMetrics.find((x) => x.label === label);
          return m ? String(m.value) : 'N/A';
        });
        fRows.push(`| ${label} | ${cells.join(' | ')} |`);
      }
    }
    financialSection = `${fHeader}\n${fSep}\n${fRows.join('\n')}`;
  } else {
    financialSection = 'No financial analysis available.';
  }

  // Coverage table
  const covHeader = `| Room | Total | Analyzed | Missing | Status | Progress |`;
  const covSep = `| --- | --- | --- | --- | --- | --- |`;
  const covRows = cr.rooms.map(
    (r) => `| ${r.targetCompany} | ${r.documentCount} | ${r.analyzedCount} | ${r.missingDocumentCount} | ${r.status} | ${r.progress}% |`,
  );

  // Missing documents
  const missingLines = cr.missingDocuments.length > 0
    ? cr.missingDocuments.map(
        (d) => `- **${d.targetCompany}** [${d.importance}]: ${d.description}`,
      )
    : ['No missing documents.'];

  const markdown = `# DD Room Comparison Report

**Date:** ${date}
**Rooms Compared:** ${roomNames}

## Risk Heat Map

${riskHeader}
${riskSep}
${riskRows.join('\n')}

## Deal Breakers

${dbLines.join('\n')}

## Financial Comparison

${financialSection}

## Document Coverage

${covHeader}
${covSep}
${covRows.join('\n')}

### Missing Documents

${missingLines.join('\n')}
`;

  // Download as file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dd-comparison-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function getRoomTarget(room: AgentJobRow): string {
  const data = room.input?.data as Record<string, unknown> | undefined;
  const dc = data?.dealContext as Record<string, unknown> | undefined;
  return (dc?.targetCompany as string) ?? `Room ${room.id.slice(0, 8)}`;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
</script>

<style scoped>
.comparison-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}

.selector-header {
  margin-bottom: 16px;
}

.selector-header h2 {
  margin: 0 0 4px;
}

.selector-header p {
  margin: 0;
  color: var(--ion-color-medium);
}

.loading-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--ion-color-medium);
}

.room-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.room-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.room-card:hover {
  border-color: var(--ion-color-primary);
}

.room-card.selected {
  border-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.room-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--ion-color-primary);
}

.room-info {
  flex: 1;
}

.room-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 4px;
  font-size: 0.85em;
  color: var(--ion-color-medium);
}

.selector-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.limit-warning {
  color: var(--ion-color-danger);
  font-size: 0.85em;
}

.dashboard-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.dashboard-header h2 {
  margin: 0;
}

.dashboard-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.panel-content {
  margin-top: 16px;
}

.error-banner {
  margin-top: 16px;
  padding: 12px;
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
  border-radius: 8px;
}
</style>
