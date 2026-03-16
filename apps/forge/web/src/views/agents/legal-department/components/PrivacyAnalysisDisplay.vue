<template>
  <div class="privacy-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="shieldOutline" />
      <h3>Privacy Analysis</h3>
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

    <!-- Data Handling -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="serverOutline" />
        <h4>Data Handling</h4>
      </div>
      <div class="info-card">
        <div class="data-section">
          <div v-if="analysis.dataHandling.dataTypes.length > 0" class="data-item">
            <strong>Data Types Collected:</strong>
            <div class="badge-list">
              <ion-badge v-for="(type, i) in analysis.dataHandling.dataTypes" :key="i" color="medium">
                {{ type }}
              </ion-badge>
            </div>
          </div>
          <div v-if="analysis.dataHandling.purposes.length > 0" class="data-item">
            <strong>Processing Purposes:</strong>
            <ul class="purposes-list">
              <li v-for="(purpose, i) in analysis.dataHandling.purposes" :key="i">{{ purpose }}</li>
            </ul>
          </div>
          <div class="data-grid">
            <div v-if="analysis.dataHandling.retentionPeriod" class="data-item">
              <strong>Retention Period:</strong>
              <span>{{ analysis.dataHandling.retentionPeriod }}</span>
            </div>
            <div v-if="analysis.dataHandling.dataLocation" class="data-item">
              <strong>Data Location:</strong>
              <span>{{ analysis.dataHandling.dataLocation }}</span>
            </div>
          </div>
        </div>
        <div v-if="analysis.dataHandling.details" class="details-text">
          {{ analysis.dataHandling.details }}
        </div>
      </div>
    </div>

    <!-- GDPR Compliance -->
    <div v-if="analysis.gdprCompliance" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="globeOutline" />
        <h4>GDPR Compliance</h4>
        <ion-badge :color="analysis.gdprCompliance.compliant ? 'success' : 'danger'">
          {{ analysis.gdprCompliance.compliant ? 'Compliant' : 'Non-Compliant' }}
        </ion-badge>
      </div>
      <div class="info-card" :class="{ 'non-compliant': !analysis.gdprCompliance.compliant }">
        <div class="compliance-grid">
          <div class="compliance-item">
            <strong>Applicable:</strong>
            <ion-badge :color="analysis.gdprCompliance.applicable ? 'primary' : 'medium'">
              {{ analysis.gdprCompliance.applicable ? 'Yes' : 'No' }}
            </ion-badge>
          </div>
          <div v-if="analysis.gdprCompliance.legalBasis" class="compliance-item">
            <strong>Legal Basis:</strong>
            <span>{{ formatLegalBasis(analysis.gdprCompliance.legalBasis) }}</span>
          </div>
        </div>
        <div v-if="analysis.gdprCompliance.dataSubjectRights?.length" class="data-item">
          <strong>Data Subject Rights Addressed:</strong>
          <div class="badge-list">
            <ion-badge v-for="(right, i) in analysis.gdprCompliance.dataSubjectRights" :key="i" color="success">
              {{ right }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.gdprCompliance.crossBorderTransfers" class="cross-border-section">
          <strong>Cross-Border Transfers:</strong>
          <div class="transfer-info">
            <ion-badge :color="analysis.gdprCompliance.crossBorderTransfers.applicable ? 'warning' : 'success'">
              {{ analysis.gdprCompliance.crossBorderTransfers.applicable ? 'Yes' : 'No' }}
            </ion-badge>
            <span v-if="analysis.gdprCompliance.crossBorderTransfers.mechanism">
              Mechanism: {{ analysis.gdprCompliance.crossBorderTransfers.mechanism }}
            </span>
          </div>
          <p v-if="analysis.gdprCompliance.crossBorderTransfers.details" class="transfer-details">
            {{ analysis.gdprCompliance.crossBorderTransfers.details }}
          </p>
        </div>
        <div v-if="analysis.gdprCompliance.details" class="details-text">
          {{ analysis.gdprCompliance.details }}
        </div>
      </div>
    </div>

    <!-- CCPA Compliance -->
    <div v-if="analysis.ccpaCompliance" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="flagOutline" />
        <h4>CCPA Compliance</h4>
        <ion-badge :color="analysis.ccpaCompliance.compliant ? 'success' : 'danger'">
          {{ analysis.ccpaCompliance.compliant ? 'Compliant' : 'Non-Compliant' }}
        </ion-badge>
      </div>
      <div class="info-card" :class="{ 'non-compliant': !analysis.ccpaCompliance.compliant }">
        <div class="compliance-grid">
          <div class="compliance-item">
            <strong>Applicable:</strong>
            <ion-badge :color="analysis.ccpaCompliance.applicable ? 'primary' : 'medium'">
              {{ analysis.ccpaCompliance.applicable ? 'Yes' : 'No' }}
            </ion-badge>
          </div>
          <div class="compliance-item">
            <strong>Do Not Sell:</strong>
            <ion-badge :color="analysis.ccpaCompliance.doNotSell ? 'success' : 'warning'">
              {{ analysis.ccpaCompliance.doNotSell ? 'Included' : 'Missing' }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.ccpaCompliance.consumerRights?.length" class="data-item">
          <strong>Consumer Rights Addressed:</strong>
          <div class="badge-list">
            <ion-badge v-for="(right, i) in analysis.ccpaCompliance.consumerRights" :key="i" color="success">
              {{ right }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.ccpaCompliance.details" class="details-text">
          {{ analysis.ccpaCompliance.details }}
        </div>
      </div>
    </div>

    <!-- Security Measures -->
    <div v-if="analysis.security" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="lockClosedOutline" />
        <h4>Security Measures</h4>
        <ion-badge :color="analysis.security.adequate ? 'success' : 'warning'">
          {{ analysis.security.adequate ? 'Adequate' : 'Needs Review' }}
        </ion-badge>
      </div>
      <div class="info-card">
        <div v-if="analysis.security.measures.length > 0" class="data-item">
          <strong>Security Measures:</strong>
          <div class="badge-list">
            <ion-badge v-for="(measure, i) in analysis.security.measures" :key="i" color="tertiary">
              {{ measure }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.security.details" class="details-text">
          {{ analysis.security.details }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  shieldOutline,
  informationCircleOutline,
  warningOutline,
  serverOutline,
  globeOutline,
  flagOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import type { PrivacyAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: PrivacyAnalysisOutput;
}>();

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLegalBasis(basis: string): string {
  const basisMap: Record<string, string> = {
    consent: 'Consent',
    contract: 'Contractual Necessity',
    'legitimate-interest': 'Legitimate Interest',
    'legal-obligation': 'Legal Obligation',
    'vital-interests': 'Vital Interests',
    'public-task': 'Public Task',
  };
  return basisMap[basis] || basis;
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
.privacy-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-secondary);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-secondary);
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
  color: var(--ion-color-secondary);
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
  border-left: 4px solid var(--ion-color-secondary);
}

.info-card.non-compliant {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.05);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

.data-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.data-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.data-item span {
  font-size: 14px;
}

.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.purposes-list {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
}

.purposes-list li {
  margin-bottom: 4px;
}

.compliance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.compliance-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compliance-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.cross-border-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.cross-border-section strong {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}

.transfer-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.transfer-details {
  margin: 8px 0 0 0;
  font-size: 14px;
  color: var(--ion-color-medium-shade);
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
