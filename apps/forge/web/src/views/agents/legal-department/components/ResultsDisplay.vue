<template>
  <div class="results-display">
    <div class="results-header">
      <div class="header-content">
        <h2>Analysis Results</h2>
        <p>{{ results.documentName }}</p>
      </div>
      <div class="header-actions">
        <ion-button fill="outline" @click="emit('restart')">
          <ion-icon :icon="arrowBackOutline" slot="start" />
          New Analysis
        </ion-button>
        <ion-button @click="handleExport">
          <ion-icon :icon="downloadOutline" slot="start" />
          Export Report
        </ion-button>
      </div>
    </div>

    <!-- Summary Card -->
    <div class="summary-card">
      <div class="summary-header">
        <ion-icon :icon="documentTextOutline" />
        <h3>Summary</h3>
      </div>
      <p>{{ results.summary }}</p>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-value">{{ results.findings.length }}</span>
          <span class="stat-label">Findings</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ results.risks.length }}</span>
          <span class="stat-label">Risks</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ results.recommendations.length }}</span>
          <span class="stat-label">Recommendations</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ (results.metadata.confidence * 100).toFixed(0) }}%</span>
          <span class="stat-label">Confidence</span>
        </div>
      </div>
    </div>

    <!-- Legal Metadata Section (if available) -->
    <div v-if="results.legalMetadata" class="metadata-section">
      <DocumentMetadataDisplay :metadata="results.legalMetadata" />
    </div>

    <!-- Contract Analysis Section (M2 Specialist Output) -->
    <div v-if="results.specialistOutputs?.contract" class="specialist-section">
      <ContractAnalysisDisplay :analysis="results.specialistOutputs.contract" />
    </div>

    <!-- Compliance Analysis Section (M4 Specialist Output) -->
    <div v-if="results.specialistOutputs?.compliance" class="specialist-section">
      <ComplianceAnalysisDisplay :analysis="adaptComplianceAnalysis(results.specialistOutputs.compliance) as any" />
    </div>

    <!-- IP Analysis Section (M5 Specialist Output) -->
    <div v-if="results.specialistOutputs?.ip" class="specialist-section">
      <IpAnalysisDisplay :analysis="results.specialistOutputs.ip" />
    </div>

    <!-- Privacy Analysis Section (M6 Specialist Output) -->
    <div v-if="results.specialistOutputs?.privacy" class="specialist-section">
      <PrivacyAnalysisDisplay :analysis="results.specialistOutputs.privacy" />
    </div>

    <!-- Employment Analysis Section (M7 Specialist Output) -->
    <div v-if="results.specialistOutputs?.employment" class="specialist-section">
      <EmploymentAnalysisDisplay :analysis="results.specialistOutputs.employment" />
    </div>

    <!-- Corporate Analysis Section (M8 Specialist Output) -->
    <div v-if="results.specialistOutputs?.corporate" class="specialist-section">
      <CorporateAnalysisDisplay :analysis="results.specialistOutputs.corporate" />
    </div>

    <!-- Litigation Analysis Section (M9 Specialist Output) -->
    <div v-if="results.specialistOutputs?.litigation" class="specialist-section">
      <LitigationAnalysisDisplay :analysis="results.specialistOutputs.litigation" />
    </div>

    <!-- Real Estate Analysis Section (M10 Specialist Output) -->
    <div v-if="results.specialistOutputs?.realEstate" class="specialist-section">
      <RealEstateAnalysisDisplay :analysis="results.specialistOutputs.realEstate" />
    </div>

    <!-- Tabs for different sections -->
    <div class="results-tabs">
      <ion-segment v-model="activeTab">
        <ion-segment-button value="findings">
          <ion-label>Findings ({{ results.findings.length }})</ion-label>
        </ion-segment-button>
        <ion-segment-button value="risks">
          <ion-label>Risks ({{ results.risks.length }})</ion-label>
        </ion-segment-button>
        <ion-segment-button value="recommendations">
          <ion-label>Recommendations ({{ results.recommendations.length }})</ion-label>
        </ion-segment-button>
      </ion-segment>
    </div>

    <!-- Findings Tab -->
    <div v-if="activeTab === 'findings'" class="tab-content">
      <div class="section-header">
        <h3>Legal Findings</h3>
        <ion-searchbar
          v-model="findingsSearch"
          placeholder="Search findings..."
          @ionInput="handleFindingsSearch"
        />
      </div>

      <div v-if="filteredFindings.length === 0" class="empty-state">
        <ion-icon :icon="searchOutline" />
        <p>No findings found</p>
      </div>

      <div v-else class="findings-list">
        <div
          v-for="finding in filteredFindings"
          :key="finding.id"
          class="finding-card"
          :class="`severity-${finding.severity}`"
        >
          <div class="finding-header">
            <ion-badge :color="getSeverityColor(finding.severity)">
              {{ finding.type }}
            </ion-badge>
            <span class="finding-category">{{ finding.category }}</span>
          </div>
          <h4>{{ finding.summary }}</h4>
          <p>{{ finding.details }}</p>
          <div class="finding-meta">
            <div v-if="finding.location.page" class="meta-item">
              <ion-icon :icon="documentOutline" />
              <span>Page {{ finding.location.page }}</span>
            </div>
            <div v-if="finding.location.section" class="meta-item">
              <ion-icon :icon="listOutline" />
              <span>{{ finding.location.section }}</span>
            </div>
            <div class="meta-item">
              <ion-icon :icon="analyticsOutline" />
              <span>{{ (finding.confidence * 100).toFixed(0) }}% confidence</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Risks Tab -->
    <div v-if="activeTab === 'risks'" class="tab-content">
      <div class="section-header">
        <h3>Legal Risks</h3>
        <ion-select
          v-model="riskFilter"
          placeholder="Filter by severity"
          @ionChange="handleRiskFilter"
        >
          <ion-select-option value="all">All Risks</ion-select-option>
          <ion-select-option value="critical">Critical</ion-select-option>
          <ion-select-option value="high">High</ion-select-option>
          <ion-select-option value="medium">Medium</ion-select-option>
          <ion-select-option value="low">Low</ion-select-option>
        </ion-select>
      </div>

      <div v-if="filteredRisks.length === 0" class="empty-state">
        <ion-icon :icon="shieldCheckmarkOutline" />
        <p>No risks found</p>
      </div>

      <div v-else class="risks-list">
        <div
          v-for="risk in filteredRisks"
          :key="risk.id"
          class="risk-card"
          :class="`severity-${risk.severity}`"
        >
          <div class="risk-header">
            <ion-badge :color="getSeverityColor(risk.severity)">
              {{ risk.severity }}
            </ion-badge>
            <span class="risk-category">{{ risk.category }}</span>
          </div>
          <h4>{{ risk.title }}</h4>
          <p class="risk-description">{{ risk.description }}</p>

          <div class="risk-details">
            <div class="detail-item">
              <strong>Likelihood:</strong>
              <ion-badge :color="getLikelihoodColor(risk.likelihood)">
                {{ risk.likelihood }}
              </ion-badge>
            </div>
            <div class="detail-item">
              <strong>Impact:</strong>
              <span>{{ risk.impact }}</span>
            </div>
          </div>

          <div class="risk-mitigation">
            <strong>Mitigation:</strong>
            <p>{{ risk.mitigation }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Recommendations Tab -->
    <div v-if="activeTab === 'recommendations'" class="tab-content">
      <div class="section-header">
        <h3>Recommendations</h3>
        <ion-select
          v-model="recommendationFilter"
          placeholder="Filter by priority"
          @ionChange="handleRecommendationFilter"
        >
          <ion-select-option value="all">All Recommendations</ion-select-option>
          <ion-select-option value="critical">Critical</ion-select-option>
          <ion-select-option value="high">High</ion-select-option>
          <ion-select-option value="medium">Medium</ion-select-option>
          <ion-select-option value="low">Low</ion-select-option>
        </ion-select>
      </div>

      <div v-if="filteredRecommendations.length === 0" class="empty-state">
        <ion-icon :icon="checkmarkDoneOutline" />
        <p>No recommendations found</p>
      </div>

      <div v-else class="recommendations-list">
        <div
          v-for="recommendation in filteredRecommendations"
          :key="recommendation.id"
          class="recommendation-card"
          :class="`priority-${recommendation.priority}`"
        >
          <div class="recommendation-header">
            <ion-badge :color="getPriorityColor(recommendation.priority)">
              {{ recommendation.priority }}
            </ion-badge>
            <span class="recommendation-category">{{ recommendation.category }}</span>
          </div>
          <h4>{{ recommendation.title }}</h4>
          <p class="recommendation-description">{{ recommendation.description }}</p>

          <div class="recommendation-details">
            <div class="detail-section">
              <strong>Rationale:</strong>
              <p>{{ recommendation.rationale }}</p>
            </div>
            <div class="detail-section">
              <strong>Suggested Action:</strong>
              <p>{{ recommendation.suggestedAction }}</p>
            </div>
            <div v-if="recommendation.estimatedEffort" class="detail-section">
              <strong>Estimated Effort:</strong>
              <p>{{ recommendation.estimatedEffort }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import {
  IonButton,
  IonIcon,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue';
import {
  arrowBackOutline,
  downloadOutline,
  documentTextOutline,
  searchOutline,
  shieldCheckmarkOutline,
  checkmarkDoneOutline,
  documentOutline,
  listOutline,
  analyticsOutline,
} from 'ionicons/icons';
import type { AnalysisResults, ComplianceAnalysisOutput } from '../legalDepartmentTypes';
import DocumentMetadataDisplay from './DocumentMetadataDisplay.vue';
import ContractAnalysisDisplay from './ContractAnalysisDisplay.vue';
import ComplianceAnalysisDisplay from './ComplianceAnalysisDisplay.vue';
import IpAnalysisDisplay from './IpAnalysisDisplay.vue';
import PrivacyAnalysisDisplay from './PrivacyAnalysisDisplay.vue';
import EmploymentAnalysisDisplay from './EmploymentAnalysisDisplay.vue';
import CorporateAnalysisDisplay from './CorporateAnalysisDisplay.vue';
import LitigationAnalysisDisplay from './LitigationAnalysisDisplay.vue';
import RealEstateAnalysisDisplay from './RealEstateAnalysisDisplay.vue';

// Props
const props = defineProps<{
  results: AnalysisResults;
}>();

// Emits
const emit = defineEmits<{
  (e: 'restart'): void;
}>();

// State
const activeTab = ref('findings');
const findingsSearch = ref('');
const riskFilter = ref('all');
const recommendationFilter = ref('all');

// Computed
const filteredFindings = computed(() => {
  if (!findingsSearch.value) return props.results.findings;

  const search = findingsSearch.value.toLowerCase();
  return props.results.findings.filter(
    (f) =>
      f.summary.toLowerCase().includes(search) ||
      f.details.toLowerCase().includes(search) ||
      f.category.toLowerCase().includes(search)
  );
});

const filteredRisks = computed(() => {
  if (riskFilter.value === 'all') return props.results.risks;
  return props.results.risks.filter((r) => r.severity === riskFilter.value);
});

const filteredRecommendations = computed(() => {
  if (recommendationFilter.value === 'all') return props.results.recommendations;
  return props.results.recommendations.filter((r) => r.priority === recommendationFilter.value);
});

// Methods
function handleFindingsSearch() {
  // Reactive computed will handle filtering
}

function handleRiskFilter() {
  // Reactive computed will handle filtering
}

function handleRecommendationFilter() {
  // Reactive computed will handle filtering
}

function getSeverityColor(severity?: string): string {
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

function getLikelihoodColor(likelihood: string): string {
  switch (likelihood) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'success';
    default:
      return 'medium';
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
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

function handleExport() {
  // Generate and download report
  const reportData = JSON.stringify(props.results, null, 2);
  const blob = new Blob([reportData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `legal-analysis-${props.results.taskId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Adapter to convert ComplianceAnalysisOutput to the format expected by ComplianceAnalysisDisplay
function adaptComplianceAnalysis(output: ComplianceAnalysisOutput | undefined): {
  policyChecks?: Record<string, unknown>;
  regulatoryCompliance?: {
    regulations: string[];
    status: 'compliant' | 'non-compliant' | 'review-required' | 'not-applicable';
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
} | null {
  if (!output) return null;

  // Map ComplianceAnalysisOutput to ComplianceAnalysis format
  return {
    regulatoryCompliance: {
      regulations: output.regulatoryFrameworks?.map(f => f.framework) || [],
      status: output.complianceStatus?.overall === 'compliant' ? 'compliant' :
              output.complianceStatus?.overall === 'non-compliant' ? 'non-compliant' :
              output.complianceStatus?.overall === 'partial' ? 'review-required' :
              'not-applicable',
      details: output.complianceStatus?.details || output.summary
    },
    riskFlags: output.riskFlags || [],
    confidence: output.confidence || 0,
    summary: output.summary || ''
  };
}
</script>

<style scoped>
.results-display {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-content h2 {
  margin: 0 0 4px 0;
  font-size: 24px;
  font-weight: 600;
}

.header-content p {
  margin: 0;
  color: var(--ion-color-medium);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.summary-card {
  background: linear-gradient(135deg, var(--ion-color-primary-tint), var(--ion-color-tertiary-tint));
  padding: 24px;
  border-radius: 12px;
  margin-bottom: 32px;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.summary-header ion-icon {
  font-size: 28px;
  color: var(--ion-color-primary);
}

.summary-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.summary-card > p {
  margin: 0 0 24px 0;
  line-height: 1.6;
}

.metadata-section {
  margin-bottom: 32px;
}

.specialist-section {
  margin-bottom: 32px;
}

.specialist-placeholder {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 24px;
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-primary);
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-primary);
}

.specialist-placeholder h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ion-color-primary);
}

.specialist-placeholder h3 i {
  margin-right: 8px;
}

.specialist-placeholder p {
  margin: 0 0 16px 0;
  color: var(--ion-color-medium);
}

.specialist-placeholder pre {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--ion-color-primary);
}

.stat-label {
  font-size: 14px;
  color: var(--ion-color-medium);
  margin-top: 4px;
}

.results-tabs {
  margin-bottom: 24px;
}

.tab-content {
  min-height: 400px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

/* Findings List */
.findings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.finding-card {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-medium);
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.finding-card.severity-high {
  border-left-color: var(--ion-color-warning);
}

.finding-card.severity-medium {
  border-left-color: var(--ion-color-tertiary);
}

.finding-card.severity-low {
  border-left-color: var(--ion-color-success);
}

.finding-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: center;
}

.finding-category {
  font-size: 14px;
  color: var(--ion-color-medium);
}

.finding-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.finding-card p {
  margin: 0 0 12px 0;
  color: var(--ion-color-dark);
  line-height: 1.5;
}

.finding-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ion-color-medium);
}

.meta-item ion-icon {
  font-size: 16px;
}

/* Risks List */
.risks-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.risk-card {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.risk-card.severity-critical {
  border-left-color: var(--ion-color-danger);
  background: rgba(var(--ion-color-danger-rgb), 0.12);
}

.risk-card.severity-high {
  border-left-color: var(--ion-color-warning);
  background: rgba(var(--ion-color-warning-rgb), 0.12);
}

.risk-card.severity-medium {
  border-left-color: var(--ion-color-tertiary);
  background: rgba(var(--ion-color-tertiary-rgb), 0.10);
}

.risk-card.severity-low {
  border-left-color: var(--ion-color-success);
  background: rgba(var(--ion-color-success-rgb), 0.10);
}

.risk-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: center;
}

.risk-category {
  font-size: 14px;
  color: var(--ion-color-medium);
}

.risk-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.risk-description {
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.risk-details {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.detail-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.risk-mitigation {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  padding: 12px;
  border-radius: 6px;
}

.risk-mitigation strong {
  display: block;
  margin-bottom: 6px;
}

.risk-mitigation p {
  margin: 0;
  font-size: 14px;
}

/* Recommendations List */
.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recommendation-card {
  background: var(--ion-card-background, var(--ion-background-color));
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
  border-left: 4px solid var(--ion-color-medium);
}

.recommendation-card.priority-critical {
  border-left-color: var(--ion-color-danger);
}

.recommendation-card.priority-high {
  border-left-color: var(--ion-color-warning);
}

.recommendation-card.priority-medium {
  border-left-color: var(--ion-color-tertiary);
}

.recommendation-card.priority-low {
  border-left-color: var(--ion-color-success);
}

.recommendation-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: center;
}

.recommendation-category {
  font-size: 14px;
  color: var(--ion-color-medium);
}

.recommendation-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.recommendation-description {
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.recommendation-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-section {
  background: var(--ion-color-step-100, rgba(255, 255, 255, 0.08));
  padding: 12px;
  border-radius: 6px;
}

.detail-section strong {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
}

.detail-section p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
</style>
