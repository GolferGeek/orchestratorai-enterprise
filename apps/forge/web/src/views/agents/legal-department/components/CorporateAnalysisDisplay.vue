<template>
  <div class="corporate-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="businessOutline" />
      <h3>Corporate Analysis</h3>
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

    <!-- Document Type -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentTextOutline" />
        <h4>Document Type</h4>
      </div>
      <div class="info-card">
        <div class="doc-type-header">
          <ion-badge color="secondary">{{ formatDocumentType(analysis.documentType.type) }}</ion-badge>
        </div>
        <div v-if="analysis.documentType.purpose" class="info-item">
          <strong>Purpose:</strong>
          <p>{{ analysis.documentType.purpose }}</p>
        </div>
        <div v-if="analysis.documentType.details" class="details-text">
          {{ analysis.documentType.details }}
        </div>
      </div>
    </div>

    <!-- Entity Information -->
    <div v-if="analysis.entityInfo" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="storefrontOutline" />
        <h4>Entity Information</h4>
      </div>
      <div class="info-card">
        <div class="entity-grid">
          <div v-if="analysis.entityInfo.entityName" class="entity-item">
            <strong>Entity Name:</strong>
            <span>{{ analysis.entityInfo.entityName }}</span>
          </div>
          <div v-if="analysis.entityInfo.entityType" class="entity-item">
            <strong>Entity Type:</strong>
            <ion-badge color="tertiary">{{ analysis.entityInfo.entityType }}</ion-badge>
          </div>
          <div v-if="analysis.entityInfo.jurisdiction" class="entity-item">
            <strong>Jurisdiction:</strong>
            <span>{{ analysis.entityInfo.jurisdiction }}</span>
          </div>
        </div>
        <div v-if="analysis.entityInfo.details" class="details-text">
          {{ analysis.entityInfo.details }}
        </div>
      </div>
    </div>

    <!-- Governance -->
    <div v-if="analysis.governance" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="peopleCircleOutline" />
        <h4>Governance</h4>
      </div>
      <div class="info-card">
        <div v-if="analysis.governance.action" class="info-item">
          <strong>Action:</strong>
          <p>{{ analysis.governance.action }}</p>
        </div>

        <!-- Quorum -->
        <div v-if="analysis.governance.quorum" class="governance-section">
          <div class="governance-header">
            <strong>Quorum</strong>
            <ion-badge :color="analysis.governance.quorum.met ? 'success' : 'danger'">
              {{ analysis.governance.quorum.met ? 'Met' : 'Not Met' }}
            </ion-badge>
          </div>
          <div class="governance-details">
            <span><strong>Required:</strong> {{ analysis.governance.quorum.required }}</span>
            <p v-if="analysis.governance.quorum.details">{{ analysis.governance.quorum.details }}</p>
          </div>
        </div>

        <!-- Voting Results -->
        <div v-if="analysis.governance.votingResults" class="governance-section">
          <div class="governance-header">
            <strong>Voting Results</strong>
            <ion-badge :color="analysis.governance.votingResults.passed ? 'success' : 'danger'">
              {{ analysis.governance.votingResults.passed ? 'Passed' : 'Failed' }}
            </ion-badge>
          </div>
          <div class="voting-grid">
            <div class="voting-item">
              <span class="voting-label">Required:</span>
              <span>{{ analysis.governance.votingResults.required }}</span>
            </div>
            <div class="voting-item">
              <span class="voting-label">Actual:</span>
              <span>{{ analysis.governance.votingResults.actual }}</span>
            </div>
          </div>
        </div>

        <!-- Authority -->
        <div v-if="analysis.governance.authority?.length" class="info-item">
          <strong>Authority Granted:</strong>
          <div class="badge-list">
            <ion-badge v-for="(auth, i) in analysis.governance.authority" :key="i" color="success">
              {{ auth }}
            </ion-badge>
          </div>
        </div>
      </div>
    </div>

    <!-- Compliance -->
    <div v-if="analysis.compliance" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="checkmarkCircleOutline" />
        <h4>Compliance</h4>
      </div>
      <div class="info-card">
        <!-- Filing Deadlines -->
        <div v-if="analysis.compliance.filingDeadlines?.length" class="compliance-section">
          <strong class="section-label">Filing Deadlines:</strong>
          <div class="deadlines-list">
            <div
              v-for="(deadline, i) in analysis.compliance.filingDeadlines"
              :key="i"
              class="deadline-item"
              :class="`status-${deadline.status}`"
            >
              <div class="deadline-header">
                <ion-badge :color="getDeadlineColor(deadline.status)">
                  {{ deadline.status }}
                </ion-badge>
                <span class="deadline-date">{{ deadline.deadline }}</span>
              </div>
              <p>{{ deadline.requirement }}</p>
            </div>
          </div>
        </div>

        <!-- Required Approvals -->
        <div v-if="analysis.compliance.requiredApprovals?.length" class="info-item">
          <strong>Required Approvals:</strong>
          <div class="badge-list">
            <ion-badge v-for="(approval, i) in analysis.compliance.requiredApprovals" :key="i" color="warning">
              {{ approval }}
            </ion-badge>
          </div>
        </div>

        <!-- Regulatory Requirements -->
        <div v-if="analysis.compliance.regulatoryRequirements?.length" class="info-item">
          <strong>Regulatory Requirements:</strong>
          <ul class="requirements-list">
            <li v-for="(req, i) in analysis.compliance.regulatoryRequirements" :key="i">{{ req }}</li>
          </ul>
        </div>

        <div v-if="analysis.compliance.details" class="details-text">
          {{ analysis.compliance.details }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  businessOutline,
  informationCircleOutline,
  warningOutline,
  documentTextOutline,
  storefrontOutline,
  peopleCircleOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import type { CorporateAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: CorporateAnalysisOutput;
}>();

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDocumentType(type: string): string {
  const typeMap: Record<string, string> = {
    resolution: 'Board Resolution',
    bylaws: 'Bylaws',
    articles: 'Articles of Incorporation',
    minutes: 'Meeting Minutes',
    filing: 'Corporate Filing',
    other: 'Other',
  };
  return typeMap[type] || type;
}

function getDeadlineColor(status: string): string {
  switch (status) {
    case 'overdue':
      return 'danger';
    case 'current':
      return 'warning';
    case 'upcoming':
      return 'primary';
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
.corporate-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-dark);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-dark);
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
  color: var(--ion-color-dark);
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
  border-left: 4px solid var(--ion-color-primary);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

.doc-type-header {
  margin-bottom: 12px;
}

.entity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.entity-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entity-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.entity-item span {
  font-size: 14px;
}

.info-item {
  margin-bottom: 16px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item strong {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.info-item p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

/* Governance Sections */
.governance-section {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-light-shade);
}

.governance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.governance-header strong {
  font-size: 14px;
}

.governance-details span {
  font-size: 14px;
}

.governance-details p {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: var(--ion-color-medium-shade);
}

.voting-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.voting-item {
  display: flex;
  flex-direction: column;
}

.voting-label {
  font-size: 11px;
  color: var(--ion-color-medium);
}

/* Compliance Sections */
.compliance-section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}

.deadlines-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.deadline-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-medium);
}

.deadline-item.status-overdue {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.05);
}

.deadline-item.status-current {
  border-left-color: var(--ion-color-warning);
}

.deadline-item.status-upcoming {
  border-left-color: var(--ion-color-primary);
}

.deadline-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.deadline-date {
  font-weight: 600;
  font-size: 14px;
}

.deadline-item p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.requirements-list {
  margin: 4px 0 0 0;
  padding-left: 20px;
  font-size: 14px;
}

.requirements-list li {
  margin-bottom: 4px;
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
