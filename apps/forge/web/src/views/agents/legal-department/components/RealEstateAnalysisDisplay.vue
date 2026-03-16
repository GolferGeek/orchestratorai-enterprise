<template>
  <div class="real-estate-analysis-display">
    <div class="analysis-header">
      <ion-icon :icon="homeOutline" />
      <h3>Real Estate Analysis</h3>
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

    <!-- Property Information -->
    <div class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="locationOutline" />
        <h4>Property Information</h4>
      </div>
      <div class="info-card">
        <div class="property-grid">
          <div v-if="analysis.propertyInfo.address" class="property-item full-width">
            <strong>Address:</strong>
            <span class="property-address">{{ analysis.propertyInfo.address }}</span>
          </div>
          <div v-if="analysis.propertyInfo.propertyType" class="property-item">
            <strong>Property Type:</strong>
            <ion-badge :color="getPropertyTypeColor(analysis.propertyInfo.propertyType)">
              {{ formatPropertyType(analysis.propertyInfo.propertyType) }}
            </ion-badge>
          </div>
          <div v-if="analysis.propertyInfo.description" class="property-item">
            <strong>Description:</strong>
            <span>{{ analysis.propertyInfo.description }}</span>
          </div>
          <div v-if="analysis.propertyInfo.legalDescription" class="property-item full-width">
            <strong>Legal Description:</strong>
            <span class="legal-description">{{ analysis.propertyInfo.legalDescription }}</span>
          </div>
        </div>
        <div v-if="analysis.propertyInfo.details" class="details-text">
          {{ analysis.propertyInfo.details }}
        </div>
      </div>
    </div>

    <!-- Lease Terms -->
    <div v-if="analysis.leaseTerms" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentTextOutline" />
        <h4>Lease Terms</h4>
      </div>
      <div class="info-card">
        <div class="lease-grid">
          <div v-if="analysis.leaseTerms.landlord" class="lease-item">
            <strong>Landlord:</strong>
            <span>{{ analysis.leaseTerms.landlord }}</span>
          </div>
          <div v-if="analysis.leaseTerms.tenant" class="lease-item">
            <strong>Tenant:</strong>
            <span>{{ analysis.leaseTerms.tenant }}</span>
          </div>
          <div v-if="analysis.leaseTerms.term" class="lease-item">
            <strong>Term:</strong>
            <span>{{ analysis.leaseTerms.term }}</span>
          </div>
          <div v-if="analysis.leaseTerms.permittedUse" class="lease-item">
            <strong>Permitted Use:</strong>
            <span>{{ analysis.leaseTerms.permittedUse }}</span>
          </div>
          <div v-if="analysis.leaseTerms.securityDeposit" class="lease-item">
            <strong>Security Deposit:</strong>
            <span>{{ analysis.leaseTerms.securityDeposit }}</span>
          </div>
          <div v-if="analysis.leaseTerms.renewalOptions" class="lease-item">
            <strong>Renewal Options:</strong>
            <span>{{ analysis.leaseTerms.renewalOptions }}</span>
          </div>
        </div>

        <!-- Rent -->
        <div v-if="analysis.leaseTerms.rent" class="rent-section">
          <strong class="section-label">Rent:</strong>
          <div class="rent-grid">
            <div v-if="analysis.leaseTerms.rent.baseRent" class="rent-item">
              <ion-icon :icon="cashOutline" />
              <div>
                <span class="rent-label">Base Rent</span>
                <span class="rent-value">{{ analysis.leaseTerms.rent.baseRent }}</span>
              </div>
            </div>
            <div v-if="analysis.leaseTerms.rent.escalations" class="rent-item">
              <ion-icon :icon="trendingUpOutline" />
              <div>
                <span class="rent-label">Escalations</span>
                <span class="rent-value">{{ analysis.leaseTerms.rent.escalations }}</span>
              </div>
            </div>
          </div>
          <div v-if="analysis.leaseTerms.rent.additionalCharges?.length" class="additional-charges">
            <strong>Additional Charges:</strong>
            <div class="badge-list">
              <ion-badge v-for="(charge, i) in analysis.leaseTerms.rent.additionalCharges" :key="i" color="medium">
                {{ charge }}
              </ion-badge>
            </div>
          </div>
        </div>

        <div v-if="analysis.leaseTerms.details" class="details-text">
          {{ analysis.leaseTerms.details }}
        </div>
      </div>
    </div>

    <!-- Title Issues -->
    <div v-if="analysis.titleIssues" class="analysis-section">
      <div class="section-title">
        <ion-icon :icon="documentLockOutline" />
        <h4>Title Analysis</h4>
        <ion-badge :color="analysis.titleIssues.clearTitle ? 'success' : 'danger'">
          {{ analysis.titleIssues.clearTitle ? 'Clear Title' : 'Title Issues' }}
        </ion-badge>
      </div>
      <div class="info-card" :class="{ 'title-issues': !analysis.titleIssues.clearTitle }">
        <!-- Exceptions -->
        <div v-if="analysis.titleIssues.exceptions?.length" class="title-section">
          <strong class="section-label">Exceptions:</strong>
          <div class="exceptions-list">
            <div
              v-for="(exception, index) in analysis.titleIssues.exceptions"
              :key="index"
              class="exception-item"
              :class="{ 'requires-action': exception.requiresAction }"
            >
              <div class="exception-header">
                <ion-badge :color="exception.requiresAction ? 'warning' : 'medium'">
                  {{ exception.type }}
                </ion-badge>
                <ion-badge v-if="exception.requiresAction" color="danger" size="small">
                  Action Required
                </ion-badge>
              </div>
              <p>{{ exception.description }}</p>
            </div>
          </div>
        </div>

        <!-- Encumbrances -->
        <div v-if="analysis.titleIssues.encumbrances?.length" class="title-section">
          <strong class="section-label">Encumbrances:</strong>
          <div class="encumbrances-list">
            <div v-for="(encumbrance, index) in analysis.titleIssues.encumbrances" :key="index" class="encumbrance-item">
              <div class="encumbrance-header">
                <ion-badge color="tertiary">{{ encumbrance.type }}</ion-badge>
                <span v-if="encumbrance.amount" class="encumbrance-amount">{{ encumbrance.amount }}</span>
              </div>
              <p>{{ encumbrance.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="analysis.titleIssues.details" class="details-text">
          {{ analysis.titleIssues.details }}
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
        <div class="warranties-grid">
          <div v-if="analysis.warranties.propertyCondition" class="warranty-item">
            <strong>Property Condition:</strong>
            <p>{{ analysis.warranties.propertyCondition }}</p>
          </div>
          <div v-if="analysis.warranties.environmentalCompliance" class="warranty-item">
            <strong>Environmental:</strong>
            <p>{{ analysis.warranties.environmentalCompliance }}</p>
          </div>
          <div v-if="analysis.warranties.zoningCompliance" class="warranty-item">
            <strong>Zoning:</strong>
            <p>{{ analysis.warranties.zoningCompliance }}</p>
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
  homeOutline,
  informationCircleOutline,
  warningOutline,
  locationOutline,
  documentTextOutline,
  documentLockOutline,
  shieldCheckmarkOutline,
  cashOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import type { RealEstateAnalysisOutput } from '../legalDepartmentTypes';

defineProps<{
  analysis: RealEstateAnalysisOutput;
}>();

function formatFlagName(flag: string): string {
  return flag
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatPropertyType(type: string): string {
  const typeMap: Record<string, string> = {
    commercial: 'Commercial',
    residential: 'Residential',
    industrial: 'Industrial',
    land: 'Land',
    'mixed-use': 'Mixed Use',
    other: 'Other',
  };
  return typeMap[type] || type;
}

function getPropertyTypeColor(type: string): string {
  switch (type) {
    case 'commercial':
      return 'primary';
    case 'residential':
      return 'success';
    case 'industrial':
      return 'tertiary';
    case 'land':
      return 'warning';
    case 'mixed-use':
      return 'secondary';
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
.real-estate-analysis-display {
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
  border-bottom: 2px solid var(--ion-color-warning);
}

.analysis-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-warning);
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
  color: var(--ion-color-warning);
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
  border-left: 4px solid var(--ion-color-warning);
}

.info-card.title-issues {
  border-left-color: var(--ion-color-danger);
}

.summary-card p {
  margin: 0;
  line-height: 1.6;
}

/* Property Grid */
.property-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.property-item.full-width {
  grid-column: 1 / -1;
}

.property-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.property-item span {
  font-size: 14px;
}

.property-address {
  font-weight: 600;
  font-size: 16px !important;
}

.legal-description {
  font-family: monospace;
  font-size: 13px !important;
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  padding: 8px;
  border-radius: 4px;
}

/* Lease Grid */
.lease-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.lease-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lease-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.lease-item span {
  font-size: 14px;
}

/* Rent Section */
.rent-section {
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

.rent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.rent-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
}

.rent-item ion-icon {
  font-size: 20px;
  color: var(--ion-color-warning);
}

.rent-item > div {
  display: flex;
  flex-direction: column;
}

.rent-label {
  font-size: 11px;
  color: var(--ion-color-medium);
}

.rent-value {
  font-size: 14px;
  font-weight: 500;
}

.additional-charges {
  margin-top: 12px;
}

.additional-charges strong {
  display: block;
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-bottom: 6px;
}

.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Title Sections */
.title-section {
  margin-bottom: 16px;
}

.title-section:last-child {
  margin-bottom: 0;
}

.exceptions-list,
.encumbrances-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exception-item,
.encumbrance-item {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 3px solid var(--ion-color-medium);
}

.exception-item.requires-action {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.exception-header,
.encumbrance-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.encumbrance-amount {
  font-weight: 600;
  font-size: 14px;
}

.exception-item p,
.encumbrance-item p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

/* Warranties Grid */
.warranties-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.warranty-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.warranty-item strong {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.warranty-item p {
  margin: 0;
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
