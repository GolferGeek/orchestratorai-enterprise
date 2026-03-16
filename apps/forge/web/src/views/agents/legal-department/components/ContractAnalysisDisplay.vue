<template>
  <div class="contract-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="documentTextOutline" />
      <h3>Contract Analysis</h3>
      <ion-badge :color="getConfidenceColor(analysis.confidence)">
        {{ (analysis.confidence * 100).toFixed(0) }}% Confidence
      </ion-badge>
    </div>

    <!-- Contract Type & Summary -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="informationCircleOutline" />
        <h4>Contract Overview</h4>
      </div>
      <div class="contract-type-card">
        <div class="type-header">
          <ion-badge color="secondary">{{ formatContractType(analysis.contractType.type) }}</ion-badge>
          <ion-badge v-if="analysis.contractType.subtype" color="medium">
            {{ analysis.contractType.subtype }}
          </ion-badge>
          <ion-badge :color="analysis.contractType.isMutual ? 'success' : 'warning'">
            {{ analysis.contractType.isMutual ? 'Mutual' : 'One-Sided' }}
          </ion-badge>
        </div>
        <p class="contract-summary">{{ analysis.summary }}</p>
      </div>
    </div>

    <!-- Risk Flags -->
    <div v-if="analysis.riskFlags.length > 0" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="warningOutline" />
        <h4>Risk Flags</h4>
        <ion-badge color="danger">{{ analysis.riskFlags.length }}</ion-badge>
      </div>
      <div class="risk-flags-list">
        <div
          v-for="(flag, index) in analysis.riskFlags"
          :key="index"
          class="risk-flag-item"
          :class="`severity-${flag.severity}`"
        >
          <div class="flag-header">
            <ion-badge :color="getSeverityColor(flag.severity)">
              {{ flag.severity }}
            </ion-badge>
            <span class="flag-name">{{ formatFlagName(flag.flag) }}</span>
          </div>
          <p class="flag-description">{{ flag.description }}</p>
          <div v-if="flag.recommendation" class="flag-recommendation">
            <strong>Recommendation:</strong>
            <p>{{ flag.recommendation }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Key Clauses -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="listOutline" />
        <h4>Key Clauses</h4>
      </div>
      <div class="clauses-grid">
        <!-- Term -->
        <div v-if="analysis.clauses.term" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="timeOutline" />
            <span>Term / Duration</span>
          </div>
          <div class="clause-content">
            <div class="clause-field">
              <strong>Duration:</strong>
              <span>{{ analysis.clauses.term.duration }}</span>
            </div>
            <div v-if="analysis.clauses.term.startDate" class="clause-field">
              <strong>Start Date:</strong>
              <span>{{ analysis.clauses.term.startDate }}</span>
            </div>
            <div v-if="analysis.clauses.term.endDate" class="clause-field">
              <strong>End Date:</strong>
              <span>{{ analysis.clauses.term.endDate }}</span>
            </div>
            <div v-if="analysis.clauses.term.renewalTerms" class="clause-field">
              <strong>Renewal:</strong>
              <span>{{ analysis.clauses.term.renewalTerms }}</span>
            </div>
          </div>
        </div>

        <!-- Confidentiality -->
        <div v-if="analysis.clauses.confidentiality" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="lockClosedOutline" />
            <span>Confidentiality</span>
          </div>
          <div class="clause-content">
            <div class="clause-field">
              <strong>Period:</strong>
              <span>{{ analysis.clauses.confidentiality.period }}</span>
            </div>
            <div class="clause-field">
              <strong>Scope:</strong>
              <span>{{ analysis.clauses.confidentiality.scope }}</span>
            </div>
            <div v-if="analysis.clauses.confidentiality.exceptions?.length" class="clause-field">
              <strong>Exceptions:</strong>
              <ul class="exceptions-list">
                <li v-for="(exception, i) in analysis.clauses.confidentiality.exceptions" :key="i">
                  {{ exception }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Governing Law -->
        <div v-if="analysis.clauses.governingLaw" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="globeOutline" />
            <span>Governing Law</span>
          </div>
          <div class="clause-content">
            <div class="clause-field">
              <strong>Jurisdiction:</strong>
              <span>{{ analysis.clauses.governingLaw.jurisdiction }}</span>
            </div>
            <div v-if="analysis.clauses.governingLaw.disputeResolution" class="clause-field">
              <strong>Dispute Resolution:</strong>
              <span>{{ analysis.clauses.governingLaw.disputeResolution }}</span>
            </div>
          </div>
        </div>

        <!-- Termination -->
        <div v-if="analysis.clauses.termination" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="closeCircleOutline" />
            <span>Termination</span>
          </div>
          <div class="clause-content">
            <div class="clause-field">
              <strong>For Cause:</strong>
              <span>{{ analysis.clauses.termination.forCause }}</span>
            </div>
            <div v-if="analysis.clauses.termination.forConvenience" class="clause-field">
              <strong>For Convenience:</strong>
              <span>{{ analysis.clauses.termination.forConvenience }}</span>
            </div>
            <div v-if="analysis.clauses.termination.noticePeriod" class="clause-field">
              <strong>Notice Period:</strong>
              <span>{{ analysis.clauses.termination.noticePeriod }}</span>
            </div>
          </div>
        </div>

        <!-- Indemnification -->
        <div v-if="analysis.clauses.indemnification" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="shieldCheckmarkOutline" />
            <span>Indemnification</span>
          </div>
          <div class="clause-content">
            <div class="clause-field">
              <strong>Scope:</strong>
              <span>{{ analysis.clauses.indemnification.scope }}</span>
            </div>
            <div v-if="analysis.clauses.indemnification.limitations" class="clause-field">
              <strong>Limitations:</strong>
              <span>{{ analysis.clauses.indemnification.limitations }}</span>
            </div>
          </div>
        </div>

        <!-- Liability Limitation -->
        <div v-if="analysis.clauses.liabilityLimitation" class="clause-card">
          <div class="clause-header">
            <ion-icon :icon="alertCircleOutline" />
            <span>Liability Limitation</span>
          </div>
          <div class="clause-content">
            <div v-if="analysis.clauses.liabilityLimitation.cap" class="clause-field">
              <strong>Cap:</strong>
              <span>{{ analysis.clauses.liabilityLimitation.cap }}</span>
            </div>
            <div v-if="analysis.clauses.liabilityLimitation.exclusions?.length" class="clause-field">
              <strong>Exclusions:</strong>
              <ul class="exclusions-list">
                <li v-for="(exclusion, i) in analysis.clauses.liabilityLimitation.exclusions" :key="i">
                  {{ exclusion }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- No Clauses Found -->
      <div v-if="!hasAnyClauses" class="empty-state">
        <p>No key clauses extracted from the document.</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  documentTextOutline,
  informationCircleOutline,
  warningOutline,
  listOutline,
  timeOutline,
  lockClosedOutline,
  globeOutline,
  closeCircleOutline,
  shieldCheckmarkOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import type { ContractAnalysisOutput } from '../legalDepartmentTypes';

const props = defineProps<{
  analysis: ContractAnalysisOutput;
}>();

const hasAnyClauses = computed(() => {
  const clauses = props.analysis.clauses;
  return (
    clauses.term ||
    clauses.confidentiality ||
    clauses.governingLaw ||
    clauses.termination ||
    clauses.indemnification ||
    clauses.liabilityLimitation
  );
});

function formatContractType(type: string): string {
  const typeMap: Record<string, string> = {
    nda: 'NDA',
    msa: 'Master Service Agreement',
    sla: 'Service Level Agreement',
    employment: 'Employment Agreement',
    license: 'License Agreement',
    other: 'Other Contract',
  };
  return typeMap[type] || type.toUpperCase();
}

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.6) return 'warning';
  return 'danger';
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'tertiary';
    case 'low':
      return 'success';
    default:
      return 'medium';
  }
}
</script>

<style scoped>
.contract-analysis-display {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  border: 1px solid var(--ion-color-light-shade);
}

.analysis-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--ion-color-primary);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-primary);
}

.analysis-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  flex: 1;
}

.analysis-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-title ion-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

/* Contract Type Card */
.contract-type-card {
  background: var(--ion-background-color);
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid var(--ion-color-primary);
}

.type-header {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.contract-summary {
  margin: 0;
  line-height: 1.6;
  color: var(--ion-color-dark);
}

/* Risk Flags */
.risk-flags-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.risk-flag-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid var(--ion-color-medium);
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.risk-flag-item.severity-critical {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
}

.risk-flag-item.severity-high {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.risk-flag-item.severity-medium {
  border-left-color: var(--ion-color-tertiary);
  background: rgba(var(--ion-color-tertiary-rgb), 0.10);
}

.risk-flag-item.severity-low {
  border-left-color: var(--ion-color-success);
  background: rgba(var(--ion-color-success-rgb), 0.10);
}

.flag-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.flag-name {
  font-weight: 600;
  font-size: 15px;
}

.flag-description {
  margin: 0 0 12px 0;
  line-height: 1.5;
  color: var(--ion-color-dark);
}

.flag-recommendation {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  padding: 12px;
  border-radius: 6px;
}

.flag-recommendation strong {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
}

.flag-recommendation p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

/* Clauses Grid */
.clauses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.clause-card {
  background: var(--ion-background-color);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--ion-color-light-shade);
}

.clause-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--ion-color-primary);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.clause-header ion-icon {
  font-size: 18px;
  color: white;
}

.clause-header span {
  font-weight: 600;
  font-size: 14px;
  color: white;
}

.clause-content {
  padding: 12px 16px;
}

.clause-field {
  margin-bottom: 8px;
}

.clause-field:last-child {
  margin-bottom: 0;
}

.clause-field strong {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 2px;
}

.clause-field span {
  font-size: 14px;
  color: var(--ion-color-dark);
}

.exceptions-list,
.exclusions-list {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
}

.exceptions-list li,
.exclusions-list li {
  margin-bottom: 4px;
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--ion-color-medium);
  font-style: italic;
}
</style>
