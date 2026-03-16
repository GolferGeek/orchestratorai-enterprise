<template>
  <div v-if="analysis" class="compliance-analysis">
    <div class="analysis-header">
      <h3><i class="fas fa-shield-alt"></i> Compliance Analysis</h3>
      <div class="confidence-badge" :class="confidenceClass">
        {{ Math.round(analysis.confidence * 100) }}% confidence
      </div>
    </div>

    <div class="summary-section">
      <p class="summary-text">{{ analysis.summary }}</p>
    </div>

    <!-- Policy Checks -->
    <div v-if="analysis.policyChecks" class="policy-checks-section">
      <h4>Policy Compliance Checks</h4>

      <!-- Term Limit -->
      <div v-if="analysis.policyChecks.termLimit" class="policy-check">
        <div class="check-header">
          <span class="check-label">Term Limit</span>
          <span
            class="compliance-status"
            :class="analysis.policyChecks.termLimit.compliant ? 'compliant' : 'non-compliant'"
          >
            <i
              :class="
                analysis.policyChecks.termLimit.compliant ? 'fas fa-check-circle' : 'fas fa-times-circle'
              "
            ></i>
            {{ analysis.policyChecks.termLimit.compliant ? 'Compliant' : 'Non-Compliant' }}
          </span>
        </div>
        <div class="check-details">
          <div class="detail-row">
            <span class="label">Contract Term:</span>
            <span class="value">{{ analysis.policyChecks.termLimit.contractTerm }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Policy Limit:</span>
            <span class="value">{{ analysis.policyChecks.termLimit.maxAllowedTerm }}</span>
          </div>
          <p class="details-text">{{ analysis.policyChecks.termLimit.details }}</p>
        </div>
      </div>

      <!-- Jurisdiction -->
      <div v-if="analysis.policyChecks.jurisdiction" class="policy-check">
        <div class="check-header">
          <span class="check-label">Jurisdiction</span>
          <span
            class="compliance-status"
            :class="analysis.policyChecks.jurisdiction.compliant ? 'compliant' : 'non-compliant'"
          >
            <i
              :class="
                analysis.policyChecks.jurisdiction.compliant ? 'fas fa-check-circle' : 'fas fa-times-circle'
              "
            ></i>
            {{ analysis.policyChecks.jurisdiction.compliant ? 'Compliant' : 'Non-Compliant' }}
          </span>
        </div>
        <div class="check-details">
          <div class="detail-row">
            <span class="label">Contract Jurisdiction:</span>
            <span class="value">{{ analysis.policyChecks.jurisdiction.contractJurisdiction }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Allowed Jurisdictions:</span>
            <span class="value">{{
              analysis.policyChecks.jurisdiction.allowedJurisdictions.join(', ')
            }}</span>
          </div>
          <p class="details-text">{{ analysis.policyChecks.jurisdiction.details }}</p>
        </div>
      </div>

      <!-- Approval Authority -->
      <div v-if="analysis.policyChecks.approvalAuthority" class="policy-check">
        <div class="check-header">
          <span class="check-label">Approval Authority</span>
        </div>
        <div class="check-details">
          <div v-if="analysis.policyChecks.approvalAuthority.contractValue" class="detail-row">
            <span class="label">Contract Value:</span>
            <span class="value">{{ analysis.policyChecks.approvalAuthority.contractValue }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Required Approver:</span>
            <span class="value">{{ analysis.policyChecks.approvalAuthority.requiredApprover }}</span>
          </div>
          <p class="details-text">{{ analysis.policyChecks.approvalAuthority.details }}</p>
        </div>
      </div>
    </div>

    <!-- Regulatory Compliance -->
    <div v-if="analysis.regulatoryCompliance" class="regulatory-section">
      <h4>Regulatory Compliance</h4>
      <div class="regulatory-status" :class="getStatusClass(analysis.regulatoryCompliance.status)">
        <i :class="getStatusIcon(analysis.regulatoryCompliance.status)"></i>
        {{ formatStatus(analysis.regulatoryCompliance.status) }}
      </div>
      <div v-if="analysis.regulatoryCompliance.regulations.length > 0" class="regulations-list">
        <span class="label">Applicable Regulations:</span>
        <ul>
          <li v-for="reg in analysis.regulatoryCompliance.regulations" :key="reg">{{ reg }}</li>
        </ul>
      </div>
      <p class="details-text">{{ analysis.regulatoryCompliance.details }}</p>
    </div>

    <!-- Risk Flags -->
    <div v-if="analysis.riskFlags && analysis.riskFlags.length > 0" class="risk-flags-section">
      <h4>Risk Flags ({{ analysis.riskFlags.length }})</h4>
      <div v-for="(flag, index) in analysis.riskFlags" :key="index" class="risk-flag" :class="flag.severity">
        <div class="flag-header">
          <span class="flag-icon">
            <i
              :class="{
                'fas fa-exclamation-triangle': flag.severity === 'medium' || flag.severity === 'high',
                'fas fa-exclamation-circle': flag.severity === 'critical',
                'fas fa-info-circle': flag.severity === 'low',
              }"
            ></i>
          </span>
          <span class="flag-name">{{ flag.flag }}</span>
          <span class="severity-badge" :class="flag.severity">{{ flag.severity }}</span>
        </div>
        <p class="flag-description">{{ flag.description }}</p>
        <p v-if="flag.recommendation" class="flag-recommendation">
          <i class="fas fa-lightbulb"></i> <strong>Recommendation:</strong> {{ flag.recommendation }}
        </p>
      </div>
    </div>

    <div v-else class="no-risks">
      <i class="fas fa-check-circle"></i> No compliance risks identified
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ComplianceAnalysisOutput } from '../legalDepartmentTypes';

const props = defineProps<{
  analysis: ComplianceAnalysisOutput | null;
}>();

const confidenceClass = computed(() => {
  if (!props.analysis) return '';
  const confidence = props.analysis.confidence;
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
});

function getStatusClass(status: string): string {
  switch (status) {
    case 'compliant':
      return 'status-compliant';
    case 'non-compliant':
      return 'status-non-compliant';
    case 'review-required':
      return 'status-review';
    default:
      return 'status-na';
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'compliant':
      return 'fas fa-check-circle';
    case 'non-compliant':
      return 'fas fa-times-circle';
    case 'review-required':
      return 'fas fa-exclamation-triangle';
    default:
      return 'fas fa-minus-circle';
  }
}

function formatStatus(status: string): string {
  return status
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
</script>

<style scoped>
.compliance-analysis {
  padding: 1.5rem;
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid var(--ion-color-light-shade);
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.analysis-header h3 {
  margin: 0;
  color: var(--ion-text-color);
  font-size: 1.25rem;
}

.analysis-header h3 i {
  color: var(--ion-color-primary);
  margin-right: 0.5rem;
}

.confidence-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
}

.confidence-badge.high {
  background: rgba(var(--ion-color-success-rgb), 0.2);
  color: var(--ion-color-success);
}

.confidence-badge.medium {
  background: rgba(var(--ion-color-warning-rgb), 0.2);
  color: var(--ion-color-warning);
}

.confidence-badge.low {
  background: rgba(var(--ion-color-danger-rgb), 0.2);
  color: var(--ion-color-danger);
}

.summary-section {
  margin-bottom: 1.5rem;
}

.summary-text {
  font-size: 1rem;
  color: var(--ion-color-medium);
  line-height: 1.6;
  margin: 0;
}

.policy-checks-section,
.regulatory-section {
  margin-bottom: 1.5rem;
}

h4 {
  font-size: 1.1rem;
  color: var(--ion-text-color);
  margin-bottom: 1rem;
  font-weight: 600;
}

.policy-check {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.check-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.check-label {
  font-weight: 600;
  color: var(--ion-text-color);
}

.compliance-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
}

.compliance-status.compliant {
  background: rgba(var(--ion-color-success-rgb), 0.2);
  color: var(--ion-color-success);
}

.compliance-status.non-compliant {
  background: rgba(var(--ion-color-danger-rgb), 0.2);
  color: var(--ion-color-danger);
}

.check-details {
  margin-top: 0.75rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.detail-row .label {
  font-weight: 500;
  color: var(--ion-color-medium);
}

.detail-row .value {
  color: var(--ion-text-color);
}

.details-text {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  line-height: 1.5;
}

.regulatory-section {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 6px;
  padding: 1rem;
}

.regulatory-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  margin-bottom: 1rem;
}

.status-compliant {
  background: rgba(var(--ion-color-success-rgb), 0.2);
  color: var(--ion-color-success);
}

.status-non-compliant {
  background: rgba(var(--ion-color-danger-rgb), 0.2);
  color: var(--ion-color-danger);
}

.status-review {
  background: rgba(var(--ion-color-warning-rgb), 0.2);
  color: var(--ion-color-warning);
}

.status-na {
  background: rgba(var(--ion-color-medium-rgb), 0.2);
  color: var(--ion-color-medium);
}

.regulations-list {
  margin-bottom: 1rem;
}

.regulations-list .label {
  font-weight: 500;
  color: var(--ion-color-medium);
  display: block;
  margin-bottom: 0.5rem;
}

.regulations-list ul {
  margin: 0;
  padding-left: 1.5rem;
}

.regulations-list li {
  color: var(--ion-text-color);
  margin-bottom: 0.25rem;
}

.risk-flags-section h4 {
  margin-bottom: 1rem;
}

.risk-flag {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-left: 4px solid;
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 4px;
}

.risk-flag.low {
  border-left-color: var(--ion-color-tertiary);
  background: rgba(var(--ion-color-tertiary-rgb), 0.10);
}

.risk-flag.medium {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.risk-flag.high {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.risk-flag.critical {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
}

.flag-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.flag-icon {
  font-size: 1.25rem;
}

.flag-name {
  font-weight: 600;
  flex: 1;
  color: var(--ion-text-color);
}

.severity-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-badge.low {
  background: rgba(var(--ion-color-tertiary-rgb), 0.3);
  color: var(--ion-color-tertiary);
}

.severity-badge.medium {
  background: rgba(var(--ion-color-warning-rgb), 0.3);
  color: var(--ion-color-warning);
}

.severity-badge.high {
  background: rgba(var(--ion-color-warning-rgb), 0.3);
  color: var(--ion-color-warning);
}

.severity-badge.critical {
  background: rgba(var(--ion-color-danger-rgb), 0.3);
  color: var(--ion-color-danger);
}

.flag-description {
  margin: 0.5rem 0;
  color: var(--ion-text-color);
  line-height: 1.5;
}

.flag-recommendation {
  margin: 0.75rem 0 0 0;
  padding: 0.75rem;
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  line-height: 1.5;
}

.flag-recommendation i {
  color: var(--ion-color-warning);
  margin-right: 0.5rem;
}

.no-risks {
  padding: 2rem;
  text-align: center;
  color: var(--ion-color-success);
  font-size: 1rem;
}

.no-risks i {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
  color: var(--ion-color-success);
}
</style>
