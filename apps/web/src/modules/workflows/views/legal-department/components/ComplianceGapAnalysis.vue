<template>
  <div class="gap-analysis">
    <div v-if="loading" class="state">Loading findings...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else>
      <!-- Filter bar -->
      <div class="filters">
        <ion-select
          v-model="filterStatus"
          label="Status"
          label-placement="stacked"
          interface="popover"
          placeholder="All"
          class="filter-select"
        >
          <ion-select-option value="">All</ion-select-option>
          <ion-select-option value="non-compliant"
            >Non-Compliant</ion-select-option
          >
          <ion-select-option value="partially-compliant"
            >Partially Compliant</ion-select-option
          >
          <ion-select-option value="not-addressed"
            >Not Addressed</ion-select-option
          >
          <ion-select-option value="compliant">Compliant</ion-select-option>
          <ion-select-option value="unable-to-evaluate"
            >Unable to Evaluate</ion-select-option
          >
        </ion-select>

        <ion-select
          v-model="filterSeverity"
          label="Severity"
          label-placement="stacked"
          interface="popover"
          placeholder="All"
          class="filter-select"
        >
          <ion-select-option value="">All</ion-select-option>
          <ion-select-option value="critical">Critical</ion-select-option>
          <ion-select-option value="high">High</ion-select-option>
          <ion-select-option value="medium">Medium</ion-select-option>
          <ion-select-option value="low">Low</ion-select-option>
        </ion-select>

        <span class="count">{{ total }} finding{{ total !== 1 ? 's' : '' }}</span>
      </div>

      <!-- Findings table -->
      <div v-if="findings.length === 0" class="state">
        No findings match the selected filters.
      </div>
      <div v-else class="findings-list">
        <div
          v-for="finding in findings"
          :key="finding.id as string"
          class="finding-row"
          @click="toggleFinding(finding.id as string)"
        >
          <div class="finding-summary">
            <span
              class="status-chip"
              :class="finding.status as string"
            >
              {{ finding.status }}
            </span>
            <span
              class="severity-chip"
              :class="finding.severity as string"
            >
              {{ finding.severity }}
            </span>
            <span class="req-ref">{{ finding.requirementRef }}</span>
            <span class="gap-desc">{{ finding.gapDescription }}</span>
          </div>

          <!-- Expanded detail -->
          <div
            v-if="expandedFinding === (finding.id as string)"
            class="finding-detail"
          >
            <div class="detail-section">
              <strong>Requirement:</strong>
              <p>{{ finding.requirementText }}</p>
            </div>
            <div class="detail-section" v-if="finding.themeName">
              <strong>Theme:</strong> {{ finding.themeName }}
            </div>
            <div class="detail-section">
              <strong>Gap Description:</strong>
              <p>{{ finding.gapDescription }}</p>
            </div>
            <div class="detail-section">
              <strong>Remediation Recommendation:</strong>
              <p>{{ finding.remediationRecommendation }}</p>
            </div>
            <div
              class="detail-section"
              v-if="(finding.policyCitations as Array<Record<string, unknown>>)?.length"
            >
              <strong>Policy Citations:</strong>
              <ul>
                <li
                  v-for="(cite, i) in (finding.policyCitations as Array<Record<string, unknown>>)"
                  :key="i"
                >
                  <em>{{ cite.documentName }}</em> — {{ cite.sectionTitle }}:
                  "{{ cite.excerpt }}"
                </li>
              </ul>
            </div>
            <div
              class="detail-section reasoning"
              v-if="finding.specialistReasoning"
            >
              <strong>Specialist Reasoning:</strong>
              <pre>{{ finding.specialistReasoning }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { IonSelect, IonSelectOption } from '@ionic/vue';
import { legalJobsService } from '../legalJobsService';

const props = defineProps<{
  jobId: string;
  orgSlug: string;
}>();

const findings = ref<Array<Record<string, unknown>>>([]);
const total = ref(0);
const loading = ref(true);
const error = ref<string | null>(null);
const expandedFinding = ref<string | null>(null);

const filterStatus = ref('');
const filterSeverity = ref('');

function toggleFinding(id: string): void {
  expandedFinding.value = expandedFinding.value === id ? null : id;
}

async function loadFindings(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const result = await legalJobsService.fetchFindings(
      props.jobId,
      props.orgSlug,
      {
        status: filterStatus.value || undefined,
        severity: filterSeverity.value || undefined,
        limit: 200,
      },
    );
    findings.value = result.findings;
    total.value = result.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

watch([filterStatus, filterSeverity], () => {
  void loadFindings();
});

onMounted(() => {
  void loadFindings();
});
</script>

<style scoped>
.gap-analysis {
  max-width: 900px;
}

.filters {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-select {
  max-width: 180px;
}
.count {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-left: auto;
}

.findings-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.finding-row {
  border: 1px solid var(--ion-color-step-150);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.finding-row:hover {
  background: var(--ion-color-step-50);
}

.finding-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  flex-wrap: wrap;
}

.status-chip,
.severity-chip {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-chip.compliant {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}
.status-chip.partially-compliant {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}
.status-chip.non-compliant {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
}
.status-chip.not-addressed {
  background: var(--ion-color-step-150);
  color: var(--ion-color-step-650);
}
.status-chip.unable-to-evaluate {
  background: var(--ion-color-step-100);
  color: var(--ion-color-medium);
}

.severity-chip.critical {
  background: var(--ion-color-danger);
  color: #fff;
}
.severity-chip.high {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
}
.severity-chip.medium {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}
.severity-chip.low {
  background: var(--ion-color-step-100);
  color: var(--ion-color-medium);
}

.req-ref {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
.gap-desc {
  font-size: 0.85rem;
  color: var(--ion-color-step-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.finding-detail {
  padding: 12px 16px;
  border-top: 1px solid var(--ion-color-step-150);
  background: var(--ion-color-step-50);
}

.detail-section {
  margin-bottom: 12px;
}
.detail-section p {
  margin: 4px 0 0;
}
.detail-section ul {
  margin: 4px 0 0;
  padding-left: 20px;
}

.reasoning pre {
  font-size: 0.8rem;
  white-space: pre-wrap;
  background: var(--ion-color-step-100);
  padding: 8px;
  border-radius: 4px;
  margin: 4px 0 0;
  max-height: 200px;
  overflow-y: auto;
}

.state {
  padding: 24px;
  text-align: center;
  color: var(--ion-color-medium);
}
.state.error {
  color: var(--ion-color-danger);
}
</style>
