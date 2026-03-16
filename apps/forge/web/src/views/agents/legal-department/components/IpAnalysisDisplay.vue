<template>
  <div class="ip-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="bulbOutline" />
      <h3>IP Analysis</h3>
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

    <!-- IP Ownership -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="keyOutline" />
        <h4>IP Ownership</h4>
      </div>
      <div class="info-card">
        <div class="info-grid">
          <div class="info-item">
            <strong>Owner:</strong>
            <span>{{ analysis.ownership.owner }}</span>
          </div>
          <div class="info-item">
            <strong>Ownership Type:</strong>
            <ion-badge :color="analysis.ownership.clear ? 'success' : 'warning'">
              {{ formatOwnershipType(analysis.ownership.ownershipType) }}
            </ion-badge>
          </div>
          <div v-if="analysis.ownership.workForHire" class="info-item">
            <strong>Work for Hire:</strong>
            <ion-badge :color="analysis.ownership.workForHire.isWorkForHire ? 'success' : 'medium'">
              {{ analysis.ownership.workForHire.isWorkForHire ? 'Yes' : 'No' }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.ownership.details" class="details-text">
          {{ analysis.ownership.details }}
        </div>
        <div v-if="analysis.ownership.assignments?.length" class="info-item">
          <strong>Assignments:</strong>
          <ul class="assignments-list">
            <li v-for="(assignment, i) in analysis.ownership.assignments" :key="i">
              {{ assignment }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- IP Types -->
    <div v-if="analysis.ipTypes.length > 0" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="layersOutline" />
        <h4>IP Types Covered</h4>
      </div>
      <div class="ip-types-grid">
        <div v-for="(ipType, index) in analysis.ipTypes" :key="index" class="ip-type-card">
          <div class="ip-type-header">
            <ion-icon :icon="getIpTypeIcon(ipType.type)" />
            <ion-badge color="secondary">{{ formatIpType(ipType.type) }}</ion-badge>
          </div>
          <p>{{ ipType.description }}</p>
        </div>
      </div>
    </div>

    <!-- Licensing Terms -->
    <div v-if="analysis.licensing" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentTextOutline" />
        <h4>Licensing Terms</h4>
      </div>
      <div class="info-card">
        <div class="info-grid">
          <div class="info-item">
            <strong>License Type:</strong>
            <ion-badge color="tertiary">{{ formatLicenseType(analysis.licensing.licenseType) }}</ion-badge>
          </div>
          <div class="info-item">
            <strong>Exclusive:</strong>
            <ion-badge :color="analysis.licensing.exclusive ? 'warning' : 'success'">
              {{ analysis.licensing.exclusive ? 'Yes' : 'No' }}
            </ion-badge>
          </div>
          <div v-if="analysis.licensing.territory" class="info-item">
            <strong>Territory:</strong>
            <span>{{ analysis.licensing.territory }}</span>
          </div>
          <div v-if="analysis.licensing.term" class="info-item">
            <strong>Term:</strong>
            <span>{{ analysis.licensing.term }}</span>
          </div>
          <div v-if="analysis.licensing.sublicensing" class="info-item">
            <strong>Sublicensing:</strong>
            <span>{{ analysis.licensing.sublicensing }}</span>
          </div>
        </div>
        <div class="info-item full-width">
          <strong>Scope:</strong>
          <p>{{ analysis.licensing.scope }}</p>
        </div>
        <div v-if="analysis.licensing.details" class="details-text">
          {{ analysis.licensing.details }}
        </div>
      </div>
    </div>

    <!-- Warranties -->
    <div v-if="analysis.warranties" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="shieldCheckmarkOutline" />
        <h4>Warranties</h4>
      </div>
      <div class="info-card">
        <div class="warranty-badges">
          <div class="warranty-item">
            <span>Non-Infringement:</span>
            <ion-badge :color="analysis.warranties.nonInfringement ? 'success' : 'danger'">
              {{ analysis.warranties.nonInfringement ? 'Included' : 'Missing' }}
            </ion-badge>
          </div>
          <div class="warranty-item">
            <span>Authority:</span>
            <ion-badge :color="analysis.warranties.authority ? 'success' : 'danger'">
              {{ analysis.warranties.authority ? 'Confirmed' : 'Missing' }}
            </ion-badge>
          </div>
        </div>
        <div v-if="analysis.warranties.details" class="details-text">
          {{ analysis.warranties.details }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, IonBadge } from '@ionic/vue';
import {
  bulbOutline,
  informationCircleOutline,
  warningOutline,
  keyOutline,
  layersOutline,
  documentTextOutline,
  shieldCheckmarkOutline,
  ribbonOutline,
  bookOutline,
  lockClosedOutline,
  helpCircleOutline,
} from 'ionicons/icons';
import type { IpAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: IpAnalysisOutput;
}>();

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatOwnershipType(type: string): string {
  const typeMap: Record<string, string> = {
    exclusive: 'Exclusive',
    joint: 'Joint',
    shared: 'Shared',
    unclear: 'Unclear',
  };
  return typeMap[type] || type;
}

function formatIpType(type: string): string {
  const typeMap: Record<string, string> = {
    patent: 'Patent',
    trademark: 'Trademark',
    copyright: 'Copyright',
    'trade-secret': 'Trade Secret',
    other: 'Other',
  };
  return typeMap[type] || type;
}

function formatLicenseType(type: string): string {
  const typeMap: Record<string, string> = {
    perpetual: 'Perpetual',
    'term-limited': 'Term-Limited',
    subscription: 'Subscription',
    other: 'Other',
  };
  return typeMap[type] || type;
}

function getIpTypeIcon(type: string) {
  const iconMap: Record<string, typeof ribbonOutline> = {
    patent: ribbonOutline,
    trademark: ribbonOutline,
    copyright: bookOutline,
    'trade-secret': lockClosedOutline,
    other: helpCircleOutline,
  };
  return iconMap[type] || helpCircleOutline;
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
.ip-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-tertiary);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-tertiary);
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
  color: var(--ion-color-tertiary);
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
  border-left: 4px solid var(--ion-color-tertiary);
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-tertiary);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.info-item span {
  font-size: 14px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-item p {
  margin: 4px 0 0 0;
  line-height: 1.5;
}

.details-text {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ion-color-light-shade);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ion-color-medium-shade);
}

.assignments-list {
  margin: 4px 0 0 0;
  padding-left: 20px;
  font-size: 14px;
}

/* IP Types Grid */
.ip-types-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.ip-type-card {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
}

.ip-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ip-type-header ion-icon {
  font-size: 18px;
  color: var(--ion-color-tertiary);
}

.ip-type-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ion-color-medium-shade);
}

/* Warranty badges */
.warranty-badges {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.warranty-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.warranty-item span {
  font-size: 14px;
  font-weight: 500;
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
