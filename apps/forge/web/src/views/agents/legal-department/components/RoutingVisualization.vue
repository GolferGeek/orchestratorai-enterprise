<template>
  <div class="routing-visualization">
    <div class="routing-header">
      <div class="routing-title">
        <ion-icon :icon="gitBranchOutline" />
        <span>CLO Routing</span>
      </div>
      <div v-if="routingDecision?.confidence" class="confidence-badge">
        <ion-icon :icon="analyticsOutline" />
        <span>{{ Math.round(routingDecision.confidence * 100) }}% confidence</span>
      </div>
    </div>

    <!-- Specialist Cards -->
    <div class="specialist-cards">
      <div
        v-for="specialist in displayedSpecialists"
        :key="specialist.slug"
        class="specialist-card"
        :class="[
          `status-${specialist.status}`,
          { 'is-selected': isSpecialistSelected(specialist.slug) }
        ]"
        @click="handleSpecialistClick(specialist.slug)"
      >
        <div class="card-icon">
          <ion-icon :icon="getSpecialistIcon(specialist.slug)" />
        </div>
        <div class="card-name">{{ specialist.name }}</div>
        <div class="card-status">
          <ion-spinner v-if="specialist.status === 'running'" name="crescent" />
          <ion-icon v-else-if="specialist.status === 'completed'" :icon="checkmarkCircle" color="success" />
          <ion-icon v-else-if="specialist.status === 'failed'" :icon="closeCircle" color="danger" />
          <ion-icon v-else :icon="ellipseOutline" color="medium" />
        </div>
      </div>
    </div>

    <!-- Routing Reasoning -->
    <div v-if="routingDecision?.reasoning && showReasoning" class="routing-reasoning">
      <div class="reasoning-toggle" @click="reasoningExpanded = !reasoningExpanded">
        <ion-icon :icon="informationCircleOutline" />
        <span>Why these specialists?</span>
        <ion-icon :icon="reasoningExpanded ? chevronUpOutline : chevronDownOutline" />
      </div>
      <div v-if="reasoningExpanded" class="reasoning-content">
        {{ routingDecision.reasoning }}
      </div>
    </div>

    <!-- Categories -->
    <div v-if="routingDecision?.categories?.length" class="routing-categories">
      <ion-chip
        v-for="category in routingDecision.categories"
        :key="category"
        size="small"
        color="tertiary"
      >
        {{ formatCategory(category) }}
      </ion-chip>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { IonIcon, IonSpinner, IonChip } from '@ionic/vue';
import {
  gitBranchOutline,
  analyticsOutline,
  checkmarkCircle,
  closeCircle,
  ellipseOutline,
  informationCircleOutline,
  chevronUpOutline,
  chevronDownOutline,
  // Specialist icons
  documentTextOutline,
  shieldCheckmarkOutline,
  bulbOutline,
  lockClosedOutline,
  personOutline,
  businessOutline,
  hammerOutline,
  homeOutline,
} from 'ionicons/icons';
import type { RoutingDecision, SpecialistType, SpecialistState } from '../legalDepartmentTypes';

// Props
const props = withDefaults(defineProps<{
  routingDecision?: RoutingDecision;
  specialistStates?: Record<SpecialistType, SpecialistState>;
  showReasoning?: boolean;
}>(), {
  routingDecision: undefined,
  specialistStates: undefined,
  showReasoning: true,
});

// Emits
const emit = defineEmits<{
  (e: 'specialist-click', specialist: SpecialistType): void;
}>();

// State
const reasoningExpanded = ref(false);

// All available specialists with display names
const allSpecialists: Array<{ slug: SpecialistType; name: string }> = [
  { slug: 'contract', name: 'Contract' },
  { slug: 'compliance', name: 'Compliance' },
  { slug: 'ip', name: 'IP' },
  { slug: 'privacy', name: 'Privacy' },
  { slug: 'employment', name: 'Employment' },
  { slug: 'corporate', name: 'Corporate' },
  { slug: 'litigation', name: 'Litigation' },
  { slug: 'real_estate', name: 'Real Estate' },
];

// Computed
const displayedSpecialists = computed(() => {
  // Get the list of specialists to display
  const activeSpecialists = props.routingDecision?.multiAgent
    ? props.routingDecision.specialists || []
    : props.routingDecision?.specialist
      ? [props.routingDecision.specialist]
      : [];

  // Include alternatives if available
  const alternatives = props.routingDecision?.alternatives || [];
  const allActive = [...new Set([...activeSpecialists, ...alternatives])];

  // Build display list
  return allSpecialists
    .filter(s => allActive.includes(s.slug) || props.specialistStates?.[s.slug])
    .map(s => ({
      ...s,
      status: props.specialistStates?.[s.slug]?.status ||
              (activeSpecialists.includes(s.slug) ? 'pending' : 'pending'),
      isActive: activeSpecialists.includes(s.slug),
    }));
});

// Methods
function isSpecialistSelected(slug: SpecialistType): boolean {
  if (props.routingDecision?.multiAgent) {
    return props.routingDecision.specialists?.includes(slug) || false;
  }
  return props.routingDecision?.specialist === slug;
}

function getSpecialistIcon(slug: SpecialistType): string {
  const icons: Record<SpecialistType, string> = {
    contract: documentTextOutline,
    compliance: shieldCheckmarkOutline,
    ip: bulbOutline,
    privacy: lockClosedOutline,
    employment: personOutline,
    corporate: businessOutline,
    litigation: hammerOutline,
    real_estate: homeOutline,
    unknown: documentTextOutline,
  };
  return icons[slug] || documentTextOutline;
}

function formatCategory(category: string): string {
  return category
    .replace(/[_-]/g, ' ')
    .replace(/:/g, ': ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function handleSpecialistClick(slug: SpecialistType) {
  emit('specialist-click', slug);
}
</script>

<style scoped>
.routing-visualization {
  background: var(--ion-card-background, var(--ion-background-color));
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--ion-color-light-shade);
}

.routing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.routing-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  color: var(--ion-color-dark);
}

.routing-title ion-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
}

.confidence-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--ion-color-medium-shade);
  background: rgba(0, 0, 0, 0.06);
  padding: 4px 8px;
  border-radius: 12px;
}

.confidence-badge ion-icon {
  font-size: 14px;
}

.specialist-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.specialist-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
  padding: 12px;
  background: var(--ion-color-step-50, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
  cursor: pointer;
  transition: all 0.2s ease;
}

.specialist-card:hover {
  border-color: var(--ion-color-primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.specialist-card.is-selected {
  border-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.05);
}

.specialist-card.status-running {
  border-color: var(--ion-color-warning);
}

.specialist-card.status-completed {
  border-color: var(--ion-color-success);
}

.specialist-card.status-failed {
  border-color: var(--ion-color-danger);
}

.card-icon {
  font-size: 24px;
  color: var(--ion-color-medium-shade);
  margin-bottom: 4px;
}

.card-name {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  margin-bottom: 4px;
  color: var(--ion-color-dark);
}

.card-status {
  height: 20px;
  display: flex;
  align-items: center;
}

.card-status ion-spinner {
  width: 16px;
  height: 16px;
}

.card-status ion-icon {
  font-size: 16px;
}

.routing-reasoning {
  margin-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-top: 12px;
}

.reasoning-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ion-color-medium);
  cursor: pointer;
}

.reasoning-toggle:hover {
  color: var(--ion-color-primary);
}

.reasoning-content {
  margin-top: 8px;
  padding: 12px;
  background: var(--ion-background-color);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ion-color-dark);
}

.routing-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.routing-categories ion-chip {
  font-size: 11px;
  height: 24px;
}
</style>
