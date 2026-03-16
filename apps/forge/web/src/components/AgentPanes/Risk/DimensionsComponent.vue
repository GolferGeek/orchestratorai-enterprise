<template>
  <div class="dimensions-component">
    <div class="dimensions-header">
      <h3>Risk Dimensions</h3>
      <span class="dimension-count">{{ dimensions.length }} dimensions</span>
    </div>

    <div v-if="dimensions.length === 0" class="empty-state">
      <p>No dimensions configured for this scope</p>
    </div>

    <div v-else class="dimensions-grid">
      <div
        v-for="dimension in sortedDimensions"
        :key="dimension.id"
        class="dimension-config-card"
        :class="{ inactive: !dimension.isActive }"
        @click="openEditModal(dimension)"
      >
        <div class="card-header">
          <span class="dimension-slug">{{ dimension.slug }}</span>
          <span class="dimension-weight">{{ formatPercent(dimension.weight) }}</span>
        </div>
        <div class="card-title-row">
          <span v-if="dimension.icon" class="material-icons dimension-icon" :style="{ color: dimension.color || '#15803d' }">
            {{ dimension.icon }}
          </span>
          <h4>{{ dimension.displayName || dimension.name }}</h4>
        </div>
        <p v-if="dimension.description" class="dimension-description">{{ dimension.description }}</p>
        <div class="card-footer">
          <span :class="['status-badge', dimension.isActive ? 'active' : 'inactive']">
            {{ dimension.isActive ? 'Active' : 'Inactive' }}
          </span>
          <span class="edit-hint">Click to edit</span>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <EditDimensionModal
      ref="editModalRef"
      :is-open="showEditModal"
      :dimension="selectedDimension"
      @close="closeEditModal"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { RiskDimension } from '@/types/risk-agent';
import { riskDashboardService } from '@/services/riskDashboardService';
import EditDimensionModal from './EditDimensionModal.vue';

interface Props {
  dimensions: RiskDimension[];
  scopeId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'dimension-updated': [dimension: RiskDimension];
}>();

// Modal state
const showEditModal = ref(false);
const selectedDimension = ref<RiskDimension | null>(null);
const editModalRef = ref<InstanceType<typeof EditDimensionModal> | null>(null);

// Sort dimensions by display order
const sortedDimensions = computed(() => {
  return [...props.dimensions].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
});

function formatPercent(value: number): string {
  // Handle both 0-1 and 0-100 scales
  const normalized = value > 1 ? value / 100 : value;
  return (normalized * 100).toFixed(0) + '%';
}

function openEditModal(dimension: RiskDimension) {
  selectedDimension.value = dimension;
  showEditModal.value = true;
}

function closeEditModal() {
  showEditModal.value = false;
  selectedDimension.value = null;
}

async function handleSave(params: {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  weight: number;
  displayOrder: number;
  icon?: string;
  color?: string;
  isActive: boolean;
}) {
  editModalRef.value?.setSubmitting(true);

  try {
    const response = await riskDashboardService.updateDimension(params.id, {
      name: params.name,
      displayName: params.displayName,
      description: params.description,
      weight: params.weight,
      displayOrder: params.displayOrder,
      icon: params.icon,
      color: params.color,
      isActive: params.isActive,
    });

    if (response.success && response.content) {
      emit('dimension-updated', response.content);
      closeEditModal();
    } else {
      editModalRef.value?.setError(response.error?.message || 'Failed to update dimension');
    }
  } catch (err) {
    editModalRef.value?.setError(err instanceof Error ? err.message : 'Failed to update dimension');
  }
}
</script>

<style scoped>
.dimensions-component {
  max-width: 1000px;
}

.dimensions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.dimensions-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.dimension-count {
  font-size: 0.875rem;
  color: var(--ion-color-medium, #666);
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--ion-color-medium, #666);
}

.dimensions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.dimension-config-card {
  background: var(--ion-card-background, #fff);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.dimension-config-card:hover {
  border-color: var(--primary-color, #a87c4f);
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.dimension-config-card.inactive {
  opacity: 0.6;
}

.dimension-config-card.inactive:hover {
  opacity: 0.8;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.dimension-slug {
  font-family: monospace;
  font-size: 0.75rem;
  background: var(--ion-color-light, #f4f5f8);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.dimension-weight {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-color, #a87c4f);
  background: rgba(168, 124, 79, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.dimension-icon {
  font-size: 1.25rem;
}

.dimension-config-card h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary, #111827);
}

.dimension-description {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--ion-color-medium, #666);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.status-badge.active {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}

.status-badge.inactive {
  color: var(--ion-color-medium, #666);
  background: var(--ion-color-light, #f4f5f8);
}

.edit-hint {
  font-size: 0.75rem;
  color: var(--ion-color-medium, #999);
  opacity: 0;
  transition: opacity 0.2s;
}

.dimension-config-card:hover .edit-hint {
  opacity: 1;
}

/* Dark mode */
html.ion-palette-dark .dimensions-component,
html[data-theme="dark"] .dimensions-component {
  --text-primary: #f9fafb;
}

html.ion-palette-dark .dimensions-component .dimensions-header h3,
html[data-theme="dark"] .dimensions-component .dimensions-header h3,
html.ion-palette-dark .dimensions-component .dimension-config-card h4,
html[data-theme="dark"] .dimensions-component .dimension-config-card h4 {
  color: var(--dark-text-primary, #f7fafc);
}

html.ion-palette-dark .dimensions-component .dimension-count,
html[data-theme="dark"] .dimensions-component .dimension-count,
html.ion-palette-dark .dimensions-component .dimension-description,
html[data-theme="dark"] .dimensions-component .dimension-description,
html.ion-palette-dark .dimensions-component .empty-state,
html[data-theme="dark"] .dimensions-component .empty-state,
html.ion-palette-dark .dimensions-component .edit-hint,
html[data-theme="dark"] .dimensions-component .edit-hint {
  color: var(--dark-text-muted, #a0aec0);
}

html.ion-palette-dark .dimensions-component .dimension-config-card,
html[data-theme="dark"] .dimensions-component .dimension-config-card {
  background: var(--dark-bg-tertiary, #2d3748);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

html.ion-palette-dark .dimensions-component .dimension-config-card:hover,
html[data-theme="dark"] .dimensions-component .dimension-config-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
}

html.ion-palette-dark .dimensions-component .dimension-slug,
html[data-theme="dark"] .dimensions-component .dimension-slug {
  background: var(--dark-bg-quaternary, #374151);
  color: var(--dark-text-secondary, #e2e8f0);
}

html.ion-palette-dark .dimensions-component .dimension-weight,
html[data-theme="dark"] .dimensions-component .dimension-weight {
  background: rgba(161, 108, 74, 0.2);
  color: #d4a574;
}

html.ion-palette-dark .dimensions-component .status-badge.active,
html[data-theme="dark"] .dimensions-component .status-badge.active {
  background: rgba(74, 222, 128, 0.15);
  color: #86efac;
}

html.ion-palette-dark .dimensions-component .status-badge.inactive,
html[data-theme="dark"] .dimensions-component .status-badge.inactive {
  background: var(--dark-bg-quaternary, #374151);
  color: var(--dark-text-muted, #a0aec0);
}
</style>
