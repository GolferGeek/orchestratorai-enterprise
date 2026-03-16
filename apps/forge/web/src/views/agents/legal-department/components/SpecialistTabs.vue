<template>
  <div class="specialist-tabs">
    <!-- Tab Header -->
    <div class="tabs-header">
      <div
        v-for="specialist in activeSpecialists"
        :key="specialist.slug"
        class="tab"
        :class="{ active: activeTab === specialist.slug }"
        @click="activeTab = specialist.slug"
      >
        <ion-icon :icon="getSpecialistIcon(specialist.slug)" />
        <span>{{ specialist.name }}</span>
        <ion-badge
          v-if="getSpecialistStatus(specialist.slug) === 'completed'"
          color="success"
          size="small"
        >
          Done
        </ion-badge>
        <ion-spinner
          v-else-if="getSpecialistStatus(specialist.slug) === 'running'"
          name="crescent"
        />
      </div>
    </div>

    <!-- Tab Content -->
    <div class="tabs-content">
      <!-- Contract Specialist -->
      <div v-if="activeTab === 'contract' && specialistOutputs?.contract" class="tab-panel">
        <ContractAnalysisDisplay :analysis="specialistOutputs.contract" />
      </div>

      <!-- Compliance Specialist -->
      <div
        v-else-if="activeTab === 'compliance' && specialistOutputs?.compliance"
        class="tab-panel"
      >
        <ComplianceAnalysisDisplay :analysis="adaptComplianceAnalysis(specialistOutputs.compliance)" />
      </div>

      <!-- IP Specialist -->
      <div v-else-if="activeTab === 'ip' && specialistOutputs?.ip" class="tab-panel">
        <IpAnalysisDisplay :analysis="specialistOutputs.ip" />
      </div>

      <!-- Privacy Specialist -->
      <div v-else-if="activeTab === 'privacy' && specialistOutputs?.privacy" class="tab-panel">
        <PrivacyAnalysisDisplay :analysis="specialistOutputs.privacy" />
      </div>

      <!-- Employment Specialist -->
      <div v-else-if="activeTab === 'employment' && specialistOutputs?.employment" class="tab-panel">
        <EmploymentAnalysisDisplay :analysis="specialistOutputs.employment" />
      </div>

      <!-- Corporate Specialist -->
      <div v-else-if="activeTab === 'corporate' && specialistOutputs?.corporate" class="tab-panel">
        <CorporateAnalysisDisplay :analysis="specialistOutputs.corporate" />
      </div>

      <!-- Litigation Specialist -->
      <div v-else-if="activeTab === 'litigation' && specialistOutputs?.litigation" class="tab-panel">
        <LitigationAnalysisDisplay :analysis="specialistOutputs.litigation" />
      </div>

      <!-- Real Estate Specialist -->
      <div v-else-if="activeTab === 'realEstate' && specialistOutputs?.realEstate" class="tab-panel">
        <RealEstateAnalysisDisplay :analysis="specialistOutputs.realEstate" />
      </div>

      <!-- Loading/Pending State -->
      <div v-else class="tab-panel-loading">
        <div v-if="getSpecialistStatus(activeTab) === 'running'" class="loading-state">
          <ion-spinner name="crescent" />
          <p>{{ getSpecialistName(activeTab) }} is analyzing the document...</p>
        </div>
        <div v-else-if="getSpecialistStatus(activeTab) === 'failed'" class="error-state">
          <ion-icon :icon="alertCircleOutline" color="danger" />
          <p>Analysis failed. Please try again.</p>
        </div>
        <div v-else class="pending-state">
          <ion-icon :icon="timeOutline" color="medium" />
          <p>Waiting to analyze...</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { IonIcon, IonBadge, IonSpinner } from '@ionic/vue';
import {
  alertCircleOutline,
  timeOutline,
  documentTextOutline,
  shieldCheckmarkOutline,
  bulbOutline,
  lockClosedOutline,
  personOutline,
  businessOutline,
  hammerOutline,
  homeOutline,
} from 'ionicons/icons';
import type { SpecialistOutputs, SpecialistType, SpecialistStatus, RoutingDecision, ComplianceAnalysisOutput } from '../legalDepartmentTypes';
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
  specialistOutputs?: SpecialistOutputs;
  routingDecision?: RoutingDecision;
  specialistStatuses?: Record<string, SpecialistStatus>;
}>();

// State
const activeTab = ref<SpecialistType | string>('contract');

// Specialist metadata
const specialistMeta: Record<string, { name: string; icon: string }> = {
  contract: { name: 'Contract', icon: documentTextOutline },
  compliance: { name: 'Compliance', icon: shieldCheckmarkOutline },
  ip: { name: 'IP', icon: bulbOutline },
  privacy: { name: 'Privacy', icon: lockClosedOutline },
  employment: { name: 'Employment', icon: personOutline },
  corporate: { name: 'Corporate', icon: businessOutline },
  litigation: { name: 'Litigation', icon: hammerOutline },
  realEstate: { name: 'Real Estate', icon: homeOutline },
  real_estate: { name: 'Real Estate', icon: homeOutline },
};

// Computed
const activeSpecialists = computed(() => {
  const specialists: Array<{ slug: string; name: string }> = [];

  // Get specialists from routing decision
  if (props.routingDecision?.multiAgent && props.routingDecision.specialists) {
    for (const slug of props.routingDecision.specialists) {
      const normalizedSlug = slug === 'real_estate' ? 'realEstate' : slug;
      specialists.push({
        slug: normalizedSlug,
        name: specialistMeta[slug]?.name || slug,
      });
    }
  } else if (props.routingDecision?.specialist) {
    const slug = props.routingDecision.specialist;
    const normalizedSlug = slug === 'real_estate' ? 'realEstate' : slug;
    specialists.push({
      slug: normalizedSlug,
      name: specialistMeta[slug]?.name || slug,
    });
  }

  // Also include any specialists that have outputs
  if (props.specialistOutputs) {
    for (const [key, value] of Object.entries(props.specialistOutputs)) {
      if (value && !specialists.find(s => s.slug === key)) {
        specialists.push({
          slug: key,
          name: specialistMeta[key]?.name || key,
        });
      }
    }
  }

  return specialists;
});

// Watch for active specialists change - auto-select first tab
watch(activeSpecialists, (newVal) => {
  if (newVal.length > 0 && !newVal.find(s => s.slug === activeTab.value)) {
    activeTab.value = newVal[0].slug;
  }
}, { immediate: true });

// Methods
function getSpecialistIcon(slug: string): string {
  return specialistMeta[slug]?.icon || documentTextOutline;
}

function getSpecialistName(slug: string): string {
  return specialistMeta[slug]?.name || slug;
}

function getSpecialistStatus(slug: string): SpecialistStatus {
  // Check if we have output
  const normalizedSlug = slug === 'real_estate' ? 'realEstate' : slug;
  if (props.specialistOutputs?.[normalizedSlug as keyof SpecialistOutputs]) {
    return 'completed';
  }

  // Check status from props
  if (props.specialistStatuses?.[slug]) {
    return props.specialistStatuses[slug];
  }

  return 'pending';
}

// Adapter to convert ComplianceAnalysisOutput to the format expected by ComplianceAnalysisDisplay
function adaptComplianceAnalysis(output: ComplianceAnalysisOutput | undefined): ComplianceAnalysisOutput | null {
  if (!output) return null;

  // Ensure all required fields are present
  return {
    policyChecks: output.policyChecks || {},
    regulatoryCompliance: output.regulatoryCompliance || {
      regulations: [],
      status: 'not-applicable',
      details: ''
    },
    riskFlags: output.riskFlags || [],
    confidence: output.confidence || 0,
    summary: output.summary || '',
    ...(output.regulatoryFrameworks && { regulatoryFrameworks: output.regulatoryFrameworks }),
    ...(output.complianceStatus && { complianceStatus: output.complianceStatus }),
    ...(output.requirements && { requirements: output.requirements })
  };
}
</script>

<style scoped>
.specialist-tabs {
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-light-shade);
}

.tabs-header {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--ion-color-light-shade);
  padding: 0 8px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.tab:hover {
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.05));
}

.tab.active {
  border-bottom-color: var(--ion-color-primary);
  color: var(--ion-color-primary);
}

.tab ion-icon {
  font-size: 18px;
}

.tab span {
  font-size: 14px;
  font-weight: 500;
}

.tab ion-spinner {
  width: 14px;
  height: 14px;
}

.tab ion-badge {
  font-size: 10px;
}

.tabs-content {
  min-height: 200px;
}

.tab-panel {
  padding: 16px;
}

.tab-panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 32px;
}

.loading-state,
.error-state,
.pending-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--ion-color-medium);
}

.loading-state ion-spinner {
  width: 32px;
  height: 32px;
}

.error-state ion-icon,
.pending-state ion-icon {
  font-size: 48px;
}

.error-state p,
.pending-state p,
.loading-state p {
  margin: 0;
  text-align: center;
}
</style>
