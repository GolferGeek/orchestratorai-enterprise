<template>
  <div class="litigation-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="hammerOutline" />
      <h3>Litigation Analysis</h3>
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

    <!-- Risk Assessment -->
    <div v-if="analysis.riskAssessment" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="alertCircleOutline" />
        <h4>Risk Assessment</h4>
        <ion-badge :color="getRiskColor(analysis.riskAssessment.overallRisk)">
          {{ analysis.riskAssessment.overallRisk }} Risk
        </ion-badge>
      </div>
      <div class="risk-card" :class="`risk-${analysis.riskAssessment.overallRisk}`">
        <p>{{ analysis.riskAssessment.details }}</p>
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

    <!-- Case Information -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentTextOutline" />
        <h4>Case Information</h4>
      </div>
      <div class="info-card">
        <div class="case-grid">
          <div v-if="analysis.caseInfo.caption" class="case-item full-width">
            <strong>Caption:</strong>
            <span class="case-caption">{{ analysis.caseInfo.caption }}</span>
          </div>
          <div v-if="analysis.caseInfo.court" class="case-item">
            <strong>Court:</strong>
            <span>{{ analysis.caseInfo.court }}</span>
          </div>
          <div v-if="analysis.caseInfo.caseNumber" class="case-item">
            <strong>Case Number:</strong>
            <span>{{ analysis.caseInfo.caseNumber }}</span>
          </div>
          <div v-if="analysis.caseInfo.filingDate" class="case-item">
            <strong>Filing Date:</strong>
            <span>{{ analysis.caseInfo.filingDate }}</span>
          </div>
        </div>
        <div v-if="analysis.caseInfo.details" class="details-text">
          {{ analysis.caseInfo.details }}
        </div>
      </div>
    </div>

    <!-- Parties -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="peopleOutline" />
        <h4>Parties</h4>
      </div>
      <div class="parties-grid">
        <!-- Plaintiffs -->
        <div v-if="analysis.parties.plaintiffs.length > 0" class="party-card plaintiff">
          <div class="party-header">
            <ion-icon :icon="personAddOutline" />
            <span>Plaintiffs</span>
          </div>
          <ul class="party-list">
            <li v-for="(plaintiff, i) in analysis.parties.plaintiffs" :key="i">
              {{ plaintiff }}
            </li>
          </ul>
        </div>

        <!-- Defendants -->
        <div v-if="analysis.parties.defendants.length > 0" class="party-card defendant">
          <div class="party-header">
            <ion-icon :icon="personRemoveOutline" />
            <span>Defendants</span>
          </div>
          <ul class="party-list">
            <li v-for="(defendant, i) in analysis.parties.defendants" :key="i">
              {{ defendant }}
            </li>
          </ul>
        </div>

        <!-- Other Parties -->
        <div v-if="analysis.parties.otherParties?.length" class="party-card other">
          <div class="party-header">
            <ion-icon :icon="peopleOutline" />
            <span>Other Parties</span>
          </div>
          <ul class="party-list">
            <li v-for="(party, i) in analysis.parties.otherParties" :key="i">
              {{ party }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Claims -->
    <div v-if="analysis.claims.length > 0" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="listOutline" />
        <h4>Claims & Causes of Action</h4>
      </div>
      <div class="claims-list">
        <div v-for="(claim, index) in analysis.claims" :key="index" class="claim-item">
          <div class="claim-header">
            <ion-badge color="secondary">{{ index + 1 }}</ion-badge>
            <span class="claim-name">{{ claim.claim }}</span>
          </div>
          <p class="claim-description">{{ claim.description }}</p>
        </div>
      </div>
    </div>

    <!-- Relief Sought -->
    <div v-if="analysis.reliefSought" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="cashOutline" />
        <h4>Relief Sought</h4>
      </div>
      <div class="info-card">
        <div class="relief-grid">
          <div v-if="analysis.reliefSought.monetary" class="relief-item">
            <ion-icon :icon="cashOutline" />
            <div>
              <strong>Monetary:</strong>
              <span>{{ analysis.reliefSought.monetary }}</span>
            </div>
          </div>
          <div v-if="analysis.reliefSought.injunctive" class="relief-item">
            <ion-icon :icon="handLeftOutline" />
            <div>
              <strong>Injunctive:</strong>
              <span>{{ analysis.reliefSought.injunctive }}</span>
            </div>
          </div>
        </div>
        <div v-if="analysis.reliefSought.other?.length" class="other-relief">
          <strong>Other Relief:</strong>
          <ul>
            <li v-for="(relief, i) in analysis.reliefSought.other" :key="i">{{ relief }}</li>
          </ul>
        </div>
        <div v-if="analysis.reliefSought.details" class="details-text">
          {{ analysis.reliefSought.details }}
        </div>
      </div>
    </div>

    <!-- Deadlines -->
    <div v-if="analysis.deadlines.length > 0" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="calendarOutline" />
        <h4>Deadlines</h4>
      </div>
      <div class="deadlines-list">
        <div
          v-for="(deadline, index) in analysis.deadlines"
          :key="index"
          class="deadline-item"
          :class="{ urgent: deadline.daysRemaining !== undefined && deadline.daysRemaining < 7 }"
        >
          <div class="deadline-header">
            <span class="deadline-name">{{ deadline.deadline }}</span>
            <div v-if="deadline.daysRemaining !== undefined" class="days-badge">
              <ion-badge :color="getDaysColor(deadline.daysRemaining)">
                {{ deadline.daysRemaining }} days
              </ion-badge>
            </div>
          </div>
          <p class="deadline-description">{{ deadline.description }}</p>
          <div class="deadline-meta">
            <span v-if="deadline.calculatedDate" class="deadline-date">
              <ion-icon :icon="calendarOutline" />
              {{ deadline.calculatedDate }}
            </span>
            <span v-if="deadline.rule" class="deadline-rule">
              <ion-icon :icon="bookOutline" />
              {{ deadline.rule }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  hammerOutline,
  informationCircleOutline,
  alertCircleOutline,
  warningOutline,
  documentTextOutline,
  peopleOutline,
  personAddOutline,
  personRemoveOutline,
  listOutline,
  cashOutline,
  handLeftOutline,
  calendarOutline,
  bookOutline,
} from 'ionicons/icons';
import type { LitigationAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: LitigationAnalysisOutput;
}>();

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getRiskColor(risk: string): string {
  switch (risk) {
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

function getDaysColor(days: number): string {
  if (days <= 3) return 'danger';
  if (days <= 7) return 'warning';
  if (days <= 14) return 'tertiary';
  return 'success';
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
.litigation-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-danger);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-danger);
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
  color: var(--ion-color-danger);
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.summary-card,
.info-card {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-danger);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

/* Risk Card */
.risk-card {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.risk-card.risk-critical {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
}

.risk-card.risk-high {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.risk-card.risk-medium {
  border-left-color: var(--ion-color-tertiary);
  background: rgba(var(--ion-color-tertiary-rgb), 0.10);
}

.risk-card.risk-low {
  border-left-color: var(--ion-color-success);
  background: rgba(var(--ion-color-success-rgb), 0.10);
}

.risk-card p {
  margin: 0;
  line-height: 1.6;
}

/* Case Grid */
.case-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.case-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.case-item.full-width {
  grid-column: 1 / -1;
}

.case-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.case-item span {
  font-size: 14px;
}

.case-caption {
  font-weight: 600;
  font-size: 16px !important;
}

/* Parties Grid */
.parties-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.party-card {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  overflow: hidden;
}

.party-card.plaintiff .party-header {
  background: rgba(var(--ion-color-primary-rgb), 0.15);
}

.party-card.plaintiff .party-header ion-icon {
  color: var(--ion-color-primary);
}

.party-card.defendant .party-header {
  background: rgba(var(--ion-color-danger-rgb), 0.08);
}

.party-card.defendant .party-header ion-icon {
  color: var(--ion-color-danger);
}

.party-card.other .party-header {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
}

.party-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.party-header ion-icon {
  font-size: 18px;
}

.party-header span {
  font-weight: 600;
  font-size: 14px;
}

.party-list {
  margin: 0;
  padding: 12px 16px 12px 32px;
  font-size: 14px;
}

.party-list li {
  margin-bottom: 4px;
}

/* Claims List */
.claims-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.claim-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-primary);
}

.claim-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.claim-name {
  font-weight: 600;
  font-size: 15px;
}

.claim-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ion-color-medium-shade);
}

/* Relief Grid */
.relief-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 12px;
}

.relief-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.relief-item ion-icon {
  font-size: 20px;
  color: var(--ion-color-danger);
}

.relief-item > div {
  display: flex;
  flex-direction: column;
}

.relief-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.relief-item span {
  font-size: 14px;
}

.other-relief strong {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.other-relief ul {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
}

/* Deadlines List */
.deadlines-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deadline-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.deadline-item.urgent {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.05);
}

.deadline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.deadline-name {
  font-weight: 600;
  font-size: 15px;
}

.deadline-description {
  margin: 0 0 8px 0;
  font-size: 14px;
  line-height: 1.5;
}

.deadline-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--ion-color-medium);
}

.deadline-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.deadline-meta ion-icon {
  font-size: 14px;
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
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 16px;
  border-radius: 6px;
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
