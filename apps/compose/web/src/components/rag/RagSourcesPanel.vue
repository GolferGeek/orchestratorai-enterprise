<template>
  <div v-if="sources && sources.length > 0" class="rag-sources-panel">
    <div class="sources-header" @click="toggleExpanded">
      <ion-icon :icon="expanded ? chevronDownOutline : chevronForwardOutline" class="toggle-icon" />
      <span class="sources-title">Sources ({{ sources.length }})</span>
      <ion-badge color="secondary" class="sources-badge">RAG</ion-badge>
    </div>

    <div v-if="expanded" class="sources-list">
      <div
        v-for="(source, index) in sources"
        :key="index"
        class="source-item"
        :class="{ 'source-expanded': expandedSources.has(index) }"
      >
        <div class="source-header" @click="toggleSource(index)">
          <div class="source-info">
            <span class="source-number">[{{ index + 1 }}]</span>
            <span class="source-document">{{ formatDocumentName(source.document) }}</span>
            <ion-badge v-if="source.matchType === 'both'" color="success" class="match-badge">
              hybrid
            </ion-badge>
            <ion-badge v-else-if="source.matchType === 'keyword'" color="tertiary" class="match-badge">
              keyword
            </ion-badge>
            <ion-badge :color="getScoreColor(source.score)" class="source-score">
              {{ source.score }}%
            </ion-badge>
          </div>
          <div class="source-actions">
            <ion-button
              v-if="source.documentId"
              fill="clear"
              size="small"
              @click.stop="openDocumentViewer(source)"
              title="View full document"
            >
              <ion-icon :icon="documentOutline" />
            </ion-button>
            <ion-icon
              :icon="expandedSources.has(index) ? chevronUpOutline : chevronDownOutline"
              class="expand-icon"
            />
          </div>
        </div>

        <div v-if="source.sectionPath || source.version" class="source-section">
          <ion-icon :icon="navigateOutline" class="section-icon" />
          <span v-if="source.sectionPath">{{ source.sectionPath }}</span>
          <ion-badge v-if="source.version" color="light" class="version-badge">
            v{{ source.version }}
          </ion-badge>
        </div>

        <div v-if="expandedSources.has(index)" class="source-excerpt">
          <p>{{ source.excerpt }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Document Viewer Modal -->
  <RagDocumentViewer
    v-if="viewerSource"
    :is-open="showViewer"
    :source="viewerSource"
    :organization-slug="organizationSlug"
    @close="closeViewer"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonIcon, IonBadge, IonButton } from '@ionic/vue';
import {
  chevronDownOutline,
  chevronForwardOutline,
  chevronUpOutline,
  documentOutline,
  navigateOutline,
} from 'ionicons/icons';
import type { RagSource } from '@/services/ragService';
import RagDocumentViewer from './RagDocumentViewer.vue';

defineProps<{
  sources: RagSource[];
  organizationSlug: string;
}>();

const expanded = ref(true);
const expandedSources = ref<Set<number>>(new Set());
const showViewer = ref(false);
const viewerSource = ref<RagSource | null>(null);

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

const toggleSource = (index: number) => {
  if (expandedSources.value.has(index)) {
    expandedSources.value.delete(index);
  } else {
    expandedSources.value.add(index);
  }
  // Force reactivity
  expandedSources.value = new Set(expandedSources.value);
};

const formatDocumentName = (filename: string): string => {
  // Remove extension and convert kebab/snake case to title case
  return filename
    .replace(/\.(md|txt|pdf|docx)$/i, '')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return 'success';
  if (score >= 60) return 'primary';
  if (score >= 40) return 'warning';
  return 'medium';
};

const openDocumentViewer = (source: RagSource) => {
  viewerSource.value = source;
  showViewer.value = true;
};

const closeViewer = () => {
  showViewer.value = false;
  viewerSource.value = null;
};
</script>

<style scoped>
.rag-sources-panel {
  margin-top: 12px;
  border: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: var(--ion-color-step-50, #f8f9fa);
  overflow: hidden;
}

.sources-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  background: var(--ion-color-step-100, #f0f1f2);
  transition: background 0.2s ease;
}

.sources-header:hover {
  background: var(--ion-color-step-150, #e8e9ea);
}

.toggle-icon {
  font-size: 16px;
  color: var(--ion-color-medium);
  margin-right: 8px;
}

.sources-title {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ion-text-color);
}

.sources-badge {
  font-size: 0.7rem;
  font-weight: 600;
}

.sources-list {
  padding: 8px;
}

.source-item {
  background: var(--ion-background-color, #fff);
  border-radius: 6px;
  margin-bottom: 6px;
  border: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.source-item:last-child {
  margin-bottom: 0;
}

.source-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.source-header:hover {
  background: var(--ion-color-step-50, #f8f9fa);
}

.source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.source-number {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ion-color-primary);
  flex-shrink: 0;
}

.source-document {
  font-size: 0.85rem;
  color: var(--ion-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-badge {
  font-size: 0.6rem;
  font-weight: 600;
  flex-shrink: 0;
}

.source-score {
  font-size: 0.7rem;
  flex-shrink: 0;
}

.version-badge {
  font-size: 0.65rem;
  margin-left: 6px;
  flex-shrink: 0;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.source-actions ion-button {
  --padding-start: 6px;
  --padding-end: 6px;
  margin: 0;
}

.expand-icon {
  font-size: 14px;
  color: var(--ion-color-medium);
}

.source-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px 8px;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.section-icon {
  font-size: 12px;
}

.source-excerpt {
  padding: 10px 12px;
  background: var(--ion-color-step-50, #f8f9fa);
  border-top: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.08));
}

.source-excerpt p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--ion-color-medium-shade);
}

/* Dark mode adjustments */
:global(.ion-palette-dark) .rag-sources-panel,
:global([data-theme="dark"]) .rag-sources-panel {
  background: var(--ion-color-step-100, #1e1e1e);
  border-color: var(--ion-border-color, rgba(255, 255, 255, 0.1));
}

:global(.ion-palette-dark) .sources-header,
:global([data-theme="dark"]) .sources-header {
  background: var(--ion-color-step-150, #2a2a2a);
}

:global(.ion-palette-dark) .source-item,
:global([data-theme="dark"]) .source-item {
  background: var(--ion-color-step-50, #1a1a1a);
  border-color: var(--ion-border-color, rgba(255, 255, 255, 0.08));
}

:global(.ion-palette-dark) .source-excerpt,
:global([data-theme="dark"]) .source-excerpt {
  background: var(--ion-color-step-100, #222);
}
</style>
