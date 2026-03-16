<template>
  <div class="employment-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="briefcaseOutline" />
      <h3>Employment Analysis</h3>
      <ion-badge :color="getConfidenceColor(analysis.confidence)">
        {{ (analysis.confidence * 100).toFixed(0) }}% Confidence
      </ion-badge>
    </div>

    <!-- Summary -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="informationCircleOutline" />
        <h4>Overview</h4>
      </div>
      <div class="summary-card">
        <p>{{ analysis.summary }}</p>
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

    <!-- Employment Terms -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentTextOutline" />
        <h4>Employment Terms</h4>
      </div>
      <div class="info-card">
        <div class="terms-grid">
          <div class="terms-item">
            <strong>Employment Type:</strong>
            <ion-badge :color="getEmploymentTypeColor(analysis.employmentTerms.type)">
              {{ formatEmploymentType(analysis.employmentTerms.type) }}
            </ion-badge>
          </div>
          <div v-if="analysis.employmentTerms.position" class="terms-item">
            <strong>Position:</strong>
            <span>{{ analysis.employmentTerms.position }}</span>
          </div>
          <div v-if="analysis.employmentTerms.startDate" class="terms-item">
            <strong>Start Date:</strong>
            <span>{{ analysis.employmentTerms.startDate }}</span>
          </div>
          <div v-if="analysis.employmentTerms.duration" class="terms-item">
            <strong>Duration:</strong>
            <span>{{ analysis.employmentTerms.duration }}</span>
          </div>
        </div>

        <!-- Compensation -->
        <div v-if="analysis.employmentTerms.compensation" class="compensation-section">
          <strong class="section-label">Compensation:</strong>
          <div class="compensation-grid">
            <div v-if="analysis.employmentTerms.compensation.salary" class="comp-item">
              <ion-icon :icon="cashOutline" />
              <div>
                <span class="comp-label">Salary</span>
                <span class="comp-value">{{ analysis.employmentTerms.compensation.salary }}</span>
              </div>
            </div>
            <div v-if="analysis.employmentTerms.compensation.bonus" class="comp-item">
              <ion-icon :icon="trophyOutline" />
              <div>
                <span class="comp-label">Bonus</span>
                <span class="comp-value">{{ analysis.employmentTerms.compensation.bonus }}</span>
              </div>
            </div>
            <div v-if="analysis.employmentTerms.compensation.equity" class="comp-item">
              <ion-icon :icon="trendingUpOutline" />
              <div>
                <span class="comp-label">Equity</span>
                <span class="comp-value">{{ analysis.employmentTerms.compensation.equity }}</span>
              </div>
            </div>
          </div>
          <div v-if="analysis.employmentTerms.compensation.benefits?.length" class="benefits-section">
            <span class="comp-label">Benefits:</span>
            <div class="badge-list">
              <ion-badge v-for="(benefit, i) in analysis.employmentTerms.compensation.benefits" :key="i" color="success">
                {{ benefit }}
              </ion-badge>
            </div>
          </div>
        </div>

        <div v-if="analysis.employmentTerms.details" class="details-text">
          {{ analysis.employmentTerms.details }}
        </div>
      </div>
    </div>

    <!-- Restrictive Covenants -->
    <div v-if="analysis.restrictiveCovenants" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="lockClosedOutline" />
        <h4>Restrictive Covenants</h4>
      </div>
      <div class="covenants-grid">
        <!-- Non-Compete -->
        <div v-if="analysis.restrictiveCovenants.nonCompete" class="covenant-card">
          <div class="covenant-header">
            <ion-icon :icon="banOutline" />
            <span>Non-Compete</span>
            <ion-badge :color="analysis.restrictiveCovenants.nonCompete.exists ? 'warning' : 'success'">
              {{ analysis.restrictiveCovenants.nonCompete.exists ? 'Exists' : 'None' }}
            </ion-badge>
          </div>
          <div v-if="analysis.restrictiveCovenants.nonCompete.exists" class="covenant-content">
            <div v-if="analysis.restrictiveCovenants.nonCompete.duration" class="covenant-field">
              <strong>Duration:</strong> {{ analysis.restrictiveCovenants.nonCompete.duration }}
            </div>
            <div v-if="analysis.restrictiveCovenants.nonCompete.territory" class="covenant-field">
              <strong>Territory:</strong> {{ analysis.restrictiveCovenants.nonCompete.territory }}
            </div>
            <div class="covenant-field">
              <strong>Enforceable:</strong>
              <ion-badge :color="analysis.restrictiveCovenants.nonCompete.enforceable ? 'success' : 'danger'" size="small">
                {{ analysis.restrictiveCovenants.nonCompete.enforceable ? 'Likely' : 'Questionable' }}
              </ion-badge>
            </div>
            <p v-if="analysis.restrictiveCovenants.nonCompete.details" class="covenant-details">
              {{ analysis.restrictiveCovenants.nonCompete.details }}
            </p>
          </div>
        </div>

        <!-- Non-Solicitation -->
        <div v-if="analysis.restrictiveCovenants.nonSolicitation" class="covenant-card">
          <div class="covenant-header">
            <ion-icon :icon="peopleOutline" />
            <span>Non-Solicitation</span>
            <ion-badge :color="analysis.restrictiveCovenants.nonSolicitation.exists ? 'warning' : 'success'">
              {{ analysis.restrictiveCovenants.nonSolicitation.exists ? 'Exists' : 'None' }}
            </ion-badge>
          </div>
          <div v-if="analysis.restrictiveCovenants.nonSolicitation.exists" class="covenant-content">
            <div v-if="analysis.restrictiveCovenants.nonSolicitation.scope" class="covenant-field">
              <strong>Scope:</strong> {{ analysis.restrictiveCovenants.nonSolicitation.scope }}
            </div>
            <div v-if="analysis.restrictiveCovenants.nonSolicitation.duration" class="covenant-field">
              <strong>Duration:</strong> {{ analysis.restrictiveCovenants.nonSolicitation.duration }}
            </div>
            <p v-if="analysis.restrictiveCovenants.nonSolicitation.details" class="covenant-details">
              {{ analysis.restrictiveCovenants.nonSolicitation.details }}
            </p>
          </div>
        </div>

        <!-- Confidentiality -->
        <div v-if="analysis.restrictiveCovenants.confidentiality" class="covenant-card">
          <div class="covenant-header">
            <ion-icon :icon="eyeOffOutline" />
            <span>Confidentiality</span>
            <ion-badge :color="analysis.restrictiveCovenants.confidentiality.exists ? 'success' : 'warning'">
              {{ analysis.restrictiveCovenants.confidentiality.exists ? 'Exists' : 'None' }}
            </ion-badge>
          </div>
          <div v-if="analysis.restrictiveCovenants.confidentiality.exists" class="covenant-content">
            <div v-if="analysis.restrictiveCovenants.confidentiality.duration" class="covenant-field">
              <strong>Duration:</strong> {{ analysis.restrictiveCovenants.confidentiality.duration }}
            </div>
            <p v-if="analysis.restrictiveCovenants.confidentiality.details" class="covenant-details">
              {{ analysis.restrictiveCovenants.confidentiality.details }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Termination -->
    <div v-if="analysis.termination" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="exitOutline" />
        <h4>Termination Provisions</h4>
      </div>
      <div class="info-card">
        <div class="termination-grid">
          <div v-if="analysis.termination.forCause" class="termination-item">
            <strong>For Cause:</strong>
            <p>{{ analysis.termination.forCause }}</p>
          </div>
          <div v-if="analysis.termination.noticePeriod" class="termination-item">
            <strong>Notice Period:</strong>
            <span>{{ analysis.termination.noticePeriod }}</span>
          </div>
          <div v-if="analysis.termination.severance" class="termination-item">
            <strong>Severance:</strong>
            <span>{{ analysis.termination.severance }}</span>
          </div>
        </div>
        <div v-if="analysis.termination.details" class="details-text">
          {{ analysis.termination.details }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  briefcaseOutline,
  informationCircleOutline,
  warningOutline,
  documentTextOutline,
  lockClosedOutline,
  banOutline,
  peopleOutline,
  eyeOffOutline,
  exitOutline,
  cashOutline,
  trophyOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import type { EmploymentAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: EmploymentAnalysisOutput;
}>();

function formatFlagName(flag: string | undefined): string {
  if (!flag) return 'Unknown Flag';
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatEmploymentType(type: string): string {
  const typeMap: Record<string, string> = {
    'at-will': 'At-Will',
    'fixed-term': 'Fixed Term',
    contractor: 'Contractor',
    other: 'Other',
  };
  return typeMap[type] || type;
}

function getEmploymentTypeColor(type: string): string {
  switch (type) {
    case 'at-will':
      return 'primary';
    case 'fixed-term':
      return 'secondary';
    case 'contractor':
      return 'tertiary';
    default:
      return 'medium';
  }
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
.employment-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-success);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-success);
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
  color: var(--ion-color-success);
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.summary-card,
.info-card {
  background: var(--ion-background-color);
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid var(--ion-color-success);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

.terms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.terms-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.terms-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.terms-item span {
  font-size: 14px;
}

/* Compensation Section */
.compensation-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.section-label {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 12px;
}

.compensation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.comp-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
}

.comp-item ion-icon {
  font-size: 20px;
  color: var(--ion-color-success);
}

.comp-item > div {
  display: flex;
  flex-direction: column;
}

.comp-label {
  font-size: 11px;
  color: var(--ion-color-medium);
}

.comp-value {
  font-size: 14px;
  font-weight: 500;
}

.benefits-section {
  margin-top: 12px;
}

.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

/* Covenants Grid */
.covenants-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.covenant-card {
  background: var(--ion-background-color);
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  overflow: hidden;
}

.covenant-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.covenant-header ion-icon {
  font-size: 18px;
  color: var(--ion-color-success);
}

.covenant-header span {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
}

.covenant-content {
  padding: 12px 16px;
}

.covenant-field {
  margin-bottom: 8px;
  font-size: 14px;
}

.covenant-field strong {
  color: var(--ion-color-medium);
  font-size: 12px;
  display: block;
  margin-bottom: 2px;
}

.covenant-details {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: var(--ion-color-medium-shade);
  line-height: 1.4;
}

/* Termination Grid */
.termination-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.termination-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.termination-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.termination-item span,
.termination-item p {
  font-size: 14px;
  margin: 0;
}

.details-text {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ion-color-light-shade);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ion-color-medium-shade);
}

/* Risk Flags */
.risk-flags-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.risk-flag-item {
  background: var(--ion-background-color);
  padding: 16px;
  border-radius: 6px;
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
</style>
