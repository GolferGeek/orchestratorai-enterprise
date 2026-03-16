<template>
  <div class="version-selector">
    <div class="version-header">
      <ion-icon :icon="timeOutline" />
      <span class="version-label">Version History</span>
      <ion-badge color="medium">{{ versions.length }}</ion-badge>
    </div>

    <ion-spinner v-if="loading" name="dots" />

    <div v-else class="version-list">
      <div
        v-for="version in sortedVersions"
        :key="version.id"
        class="version-item"
        :class="{
          'version-item--current': version.isCurrentVersion,
          'version-item--selected': selectedVersionId === version.id,
        }"
        @click="selectVersion(version)"
      >
        <div class="version-number">v{{ version.versionNumber }}</div>
        <div class="version-info">
          <div class="version-type">
            {{ formatCreationType(version.createdByType) }}
          </div>
          <div v-if="getModelInfo(version)" class="version-model">
            {{ getModelInfo(version) }}
          </div>
          <div class="version-date">{{ formatDate(version.createdAt) }}</div>
        </div>
        <ion-icon
          v-if="version.isCurrentVersion"
          :icon="checkmarkCircleOutline"
          class="current-indicator"
        />
      </div>
    </div>

    <!-- Version comparison toggle -->
    <div v-if="showCompareToggle && versions.length > 1" class="compare-toggle">
      <ion-checkbox v-model="showComparison" />
      <span>Compare with previous</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonIcon, IonBadge, IonCheckbox, IonSpinner } from '@ionic/vue';
import { timeOutline, checkmarkCircleOutline } from 'ionicons/icons';
import type { VersionSelectorProps, VersionSelectorEmits } from './types';
import type { DeliverableVersion } from '@/services/deliverablesService';

const props = withDefaults(defineProps<VersionSelectorProps>(), {
  showCompareToggle: false,
  loading: false,
});

const emit = defineEmits<VersionSelectorEmits>();

const showComparison = ref(false);

const sortedVersions = computed(() =>
  [...props.versions].sort((a, b) => b.versionNumber - a.versionNumber)
);

const selectVersion = (version: DeliverableVersion) => {
  emit('select', version);
};

const formatCreationType = (type: string): string => {
  const labels: Record<string, string> = {
    ai_response: 'AI Generated',
    manual_edit: 'Your Edit',
    ai_enhancement: 'AI Regenerated',
    user_request: 'Requested',
    llm_rerun: 'AI Rerun',
  };
  return labels[type] || type;
};

const getModelInfo = (version: DeliverableVersion): string | null => {
  const metadata = version.metadata as Record<string, unknown> | undefined;
  if (!metadata) return null;

  const provider = metadata.provider as string | undefined;
  const model = metadata.model as string | undefined;

  // Also check nested llm object
  const llm = metadata.llm as Record<string, unknown> | undefined;
  const llmProvider = llm?.provider as string | undefined;
  const llmModel = llm?.model as string | undefined;

  const finalProvider = provider || llmProvider;
  const finalModel = model || llmModel;

  if (finalProvider && finalModel) {
    // Shorten common provider names
    const shortProvider = finalProvider.replace('anthropic', 'Anthropic').replace('openai', 'OpenAI');
    // Shorten model names (e.g., claude-3-5-sonnet-20241022 -> claude-3.5-sonnet)
    const shortModel = finalModel
      .replace(/-\d{8}$/, '') // Remove date suffix
      .replace('claude-3-5', 'claude-3.5');
    return `${shortProvider} / ${shortModel}`;
  }
  if (finalModel) {
    return finalModel.replace(/-\d{8}$/, '').replace('claude-3-5', 'claude-3.5');
  }
  return null;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Watch comparison toggle
watch(showComparison, (enabled) => emit('compare', enabled));
</script>

<style scoped>
.version-selector {
  background: var(--ion-color-step-50);
  border-radius: 8px;
  padding: 0.75rem;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
}

.version-header ion-icon {
  font-size: 1.25rem;
  color: var(--ion-color-primary);
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-step-100);
}

.version-item:hover {
  background: var(--ion-color-step-100);
}

.version-item--current {
  border-color: var(--ion-color-primary);
}

.version-item--selected {
  background: var(--ion-color-primary-tint);
}

.version-number {
  font-weight: 700;
  font-size: 0.9rem;
  min-width: 2.5rem;
}

.version-info {
  flex: 1;
}

.version-type {
  font-size: 0.85rem;
}

.version-model {
  font-size: 0.75rem;
  color: var(--ion-color-primary);
  font-weight: 500;
}

.version-date {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.current-indicator {
  color: var(--ion-color-primary);
  font-size: 1.25rem;
}

.compare-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--ion-color-step-100);
  font-size: 0.85rem;
}
</style>
