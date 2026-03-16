<template>
  <ion-modal :is-open="isOpen" @didDismiss="emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Version History</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
        <p>Loading version history...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-container">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ error }}</p>
        <ion-button @click="loadVersions">Retry</ion-button>
      </div>

      <!-- Output Info Header -->
      <div v-else class="output-info">
        <div class="output-header">
          <div class="agent-info">
            <ion-icon :icon="documentTextOutline" />
            <span class="agent-name">{{ output?.writerAgent?.name || output?.writerAgent?.slug || 'Writer' }}</span>
            <ion-badge v-if="output?.writerAgent?.isLocal" color="warning" size="small">Local</ion-badge>
            <ion-badge v-else color="tertiary" size="small">Cloud</ion-badge>
          </div>
          <div v-if="output?.editorAgent" class="editor-info">
            <ion-icon :icon="pencilOutline" />
            <span>{{ output.editorAgent.name || output.editorAgent.slug }}</span>
          </div>
        </div>
        <div class="output-meta">
          <span>{{ versions.length }} version{{ versions.length !== 1 ? 's' : '' }}</span>
          <span v-if="output?.status" class="status-badge" :class="output.status">
            {{ formatStatus(output.status) }}
          </span>
        </div>
      </div>

      <!-- Version Timeline -->
      <div v-if="!isLoading && !error" class="versions-timeline">
        <div
          v-for="(version, index) in versions"
          :key="version.id"
          class="version-entry"
          :class="{ 'is-first': index === 0, 'is-last': index === versions.length - 1 }"
        >
          <!-- Timeline Connector -->
          <div class="timeline-connector">
            <div class="connector-line" v-if="index > 0"></div>
            <div class="connector-dot" :class="version.action_type"></div>
            <div class="connector-line" v-if="index < versions.length - 1"></div>
          </div>

          <!-- Version Content -->
          <div class="version-content">
            <!-- Version Header -->
            <div class="version-header">
              <span class="version-number">Version {{ version.version_number }}</span>
              <ion-badge :color="version.action_type === 'write' ? 'primary' : 'warning'">
                {{ version.action_type === 'write' ? 'Initial Write' : 'Rewrite' }}
              </ion-badge>
              <span class="version-time">{{ formatTime(version.created_at) }}</span>
            </div>

            <!-- Editor Feedback (shown before rewrite content) -->
            <div v-if="version.editor_feedback" class="editor-feedback">
              <div class="feedback-header">
                <ion-icon :icon="chatbubbleOutline" />
                <span>Editor Feedback</span>
              </div>
              <div class="feedback-content">
                {{ version.editor_feedback }}
              </div>
            </div>

            <!-- Content Preview -->
            <div class="content-preview">
              <div class="preview-header" @click="toggleExpanded(version.id)">
                <span>Content</span>
                <ion-icon :icon="expandedVersions[version.id] ? chevronUpOutline : chevronDownOutline" />
              </div>
              <div class="preview-content" :class="{ expanded: expandedVersions[version.id] }">
                {{ version.content }}
              </div>
            </div>

            <!-- Metadata -->
            <div v-if="version.llm_metadata" class="version-meta">
              <span v-if="version.llm_metadata.tokensUsed">
                {{ version.llm_metadata.tokensUsed }} tokens
              </span>
              <span v-if="version.llm_metadata.latencyMs">
                {{ version.llm_metadata.latencyMs }}ms
              </span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="versions.length === 0" class="empty-state">
          <ion-icon :icon="documentOutline" />
          <p>No versions recorded yet</p>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { ref, watch, reactive } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonSpinner,
  IonIcon,
  IonBadge,
} from '@ionic/vue';
import {
  alertCircleOutline,
  documentTextOutline,
  pencilOutline,
  chatbubbleOutline,
  chevronDownOutline,
  chevronUpOutline,
  documentOutline,
} from 'ionicons/icons';
import { marketingSwarmService } from '@/services/marketingSwarmService';
import type { OutputVersion, SwarmOutputPhase2 } from '@/types/marketing-swarm';

interface Props {
  isOpen: boolean;
  outputId: string | null;
  output: SwarmOutputPhase2 | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isLoading = ref(false);
const error = ref<string | null>(null);
const versions = ref<OutputVersion[]>([]);
const expandedVersions = reactive<Record<string, boolean>>({});

// Load versions when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && props.outputId) {
    loadVersions();
  } else {
    // Reset state when closing
    versions.value = [];
    error.value = null;
    Object.keys(expandedVersions).forEach(key => delete expandedVersions[key]);
  }
});

async function loadVersions() {
  if (!props.outputId) return;

  isLoading.value = true;
  error.value = null;

  try {
    const response = await marketingSwarmService.getOutputVersions(props.outputId);
    versions.value = response.versions;

    // Auto-expand latest version
    if (versions.value.length > 0) {
      const latestVersion = versions.value[versions.value.length - 1];
      expandedVersions[latestVersion.id] = true;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load versions';
    console.error('Failed to load versions:', err);
  } finally {
    isLoading.value = false;
  }
}

function toggleExpanded(versionId: string) {
  expandedVersions[versionId] = !expandedVersions[versionId];
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending_write: 'Pending',
    writing: 'Writing',
    pending_edit: 'Awaiting Edit',
    editing: 'Editing',
    pending_rewrite: 'Awaiting Rewrite',
    rewriting: 'Rewriting',
    approved: 'Approved',
    max_cycles_reached: 'Max Cycles',
    failed: 'Failed',
  };
  return statusMap[status] || status;
}
</script>

<style scoped>
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 16px;
}

.error-container ion-icon {
  font-size: 48px;
}

/* Output Info Header */
.output-info {
  padding: 16px;
  background: var(--ion-color-light);
  border-radius: 8px;
  margin-bottom: 24px;
}

.output-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.agent-info,
.editor-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-name {
  font-weight: 600;
}

.editor-info {
  font-size: 0.9em;
  color: var(--ion-color-medium);
}

.output-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
  color: var(--ion-color-medium);
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 500;
}

.status-badge.approved {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}

.status-badge.max_cycles_reached {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}

.status-badge.failed {
  background: var(--ion-color-danger-tint);
  color: var(--ion-color-danger-shade);
}

/* Version Timeline */
.versions-timeline {
  padding: 0 8px;
}

.version-entry {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

/* Timeline Connector */
.timeline-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}

.connector-line {
  width: 2px;
  flex: 1;
  background: var(--ion-color-light-shade);
}

.connector-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ion-color-primary);
  flex-shrink: 0;
}

.connector-dot.rewrite {
  background: var(--ion-color-warning);
}

/* Version Content */
.version-content {
  flex: 1;
  min-width: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.version-number {
  font-weight: 600;
}

.version-time {
  font-size: 0.8em;
  color: var(--ion-color-medium);
  margin-left: auto;
}

/* Editor Feedback */
.editor-feedback {
  background: var(--ion-color-warning-tint);
  border-left: 3px solid var(--ion-color-warning);
  padding: 12px;
  border-radius: 0 8px 8px 0;
  margin-bottom: 12px;
}

.feedback-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--ion-color-warning-shade);
}

.feedback-content {
  font-size: 0.9em;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Content Preview */
.content-preview {
  background: var(--ion-background-color);
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--ion-color-light);
  cursor: pointer;
  font-size: 0.9em;
  font-weight: 500;
}

.preview-header:hover {
  background: var(--ion-color-light-shade);
}

.preview-content {
  padding: 12px;
  font-size: 0.9em;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 150px;
  overflow: hidden;
  position: relative;
}

.preview-content::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(transparent, var(--ion-background-color));
}

.preview-content.expanded {
  max-height: none;
}

.preview-content.expanded::after {
  display: none;
}

/* Version Metadata */
.version-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .output-info {
    background: #2d3748;
  }

  .editor-feedback {
    background: rgba(255, 196, 0, 0.15);
  }

  .content-preview {
    border-color: #4a5568;
  }

  .preview-header {
    background: #2d3748;
  }

  .preview-header:hover {
    background: #3d4a5c;
  }

  .preview-content::after {
    background: linear-gradient(transparent, #1a1a2e);
  }
}

html[data-theme="dark"] .output-info {
  background: #2d3748;
}

html[data-theme="dark"] .editor-feedback {
  background: rgba(255, 196, 0, 0.15);
}

html[data-theme="dark"] .content-preview {
  border-color: #4a5568;
}

html[data-theme="dark"] .preview-header {
  background: #2d3748;
}

html[data-theme="dark"] .preview-content::after {
  background: linear-gradient(transparent, #1a1a2e);
}
</style>
