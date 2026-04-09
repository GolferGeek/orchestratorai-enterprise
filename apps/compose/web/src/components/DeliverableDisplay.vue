<template>
  <div class="deliverable-display">
    <!-- Document Paper Container -->
    <div class="document-paper">
    <!-- Compact Header -->
    <div class="deliverable-header compact">
      <div class="title-section">
        <h3 class="deliverable-title">{{ displayTitle }}</h3>
        <!-- LLM Information in Main Header -->
        <div v-if="getVersionLLMInfo(displayVersion)" class="llm-info-header">
          <ion-chip color="secondary" size="small">
            <ion-icon :icon="hardwareChipOutline" />
            {{ getVersionLLMInfo(displayVersion) }}
          </ion-chip>
          <span v-if="getVersionCost(displayVersion)" class="cost-info">
            ${{ getVersionCost(displayVersion) }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <!-- Edit Mode Controls (when editing) -->
        <div v-if="isEditing" class="edit-controls">
          <ion-button 
            fill="clear" 
            size="small" 
            @click="cancelEditing"
            color="medium"
          >
            <ion-icon :icon="closeOutline" />
          </ion-button>
          <ion-button
            fill="solid"
            size="small"
            @click="saveEdits"
            color="secondary"
            :disabled="!hasUnsavedChanges || isSaving"
          >
            <ion-icon :icon="saveOutline" />
            {{ isSaving ? 'Saving...' : 'Save' }}
          </ion-button>
        </div>
        <!-- Normal Mode Actions -->
        <div v-else class="normal-actions">
          <!-- Actions Dropdown -->
          <ion-button 
            fill="clear" 
            size="small" 
            @click="showActionsMenu = !showActionsMenu"
            id="actions-trigger"
          >
            <ion-icon :icon="ellipsisVerticalOutline" />
          </ion-button>
          <!-- Quick Edit -->
          <ion-button 
            fill="clear" 
            size="small" 
            @click="startEditing"
          >
            <ion-icon :icon="createOutline" />
          </ion-button>
          <!-- Quick Download -->
          <ion-button 
            fill="clear" 
            size="small" 
            @click="downloadDeliverable"
          >
            <ion-icon :icon="downloadOutline" />
          </ion-button>
        </div>
      </div>
    </div>
    <!-- Version Navigation (always visible) -->
  <div class="version-section">
      <div class="version-info">
        <span class="version-label">
          Version {{ displayVersion?.versionNumber || currentVersion?.versionNumber || 1 }} of {{ totalVersions }}
          <span v-if="displayVersion?.metadata?.provider && displayVersion?.metadata?.model" class="llm-info">
            ({{ displayVersion.metadata.provider }}/{{ displayVersion.metadata.model }})
          </span>
        </span>
        <ion-chip v-if="isViewingNewest && !displayVersion?.isCurrentVersion" color="tertiary" size="small" class="viewing-indicator">
          Viewing new version
        </ion-chip>
      </div>
  <div class="version-controls">
        <ion-button
          fill="clear"
          size="small"
          :disabled="!canGoPrevious"
          @click="goToPreviousVersion"
        >
          <ion-icon :icon="chevronBackOutline" />
        </ion-button>
        <ion-button
          v-if="selectedVersion && !selectedVersion.isCurrentVersion"
          fill="outline"
          size="small"
          @click="makeCurrentVersion"
          color="secondary"
        >
          Set as Current
        </ion-button>
        <ion-button
          fill="clear"
          size="small"
          :disabled="!canGoNext"
          @click="goToNextVersion"
        >
          <ion-icon :icon="chevronForwardOutline" />
        </ion-button>
        <ion-chip v-if="previousVersion" :color="showDiff ? 'secondary' : 'medium'" outline @click="showDiff = !showDiff" style="margin-left:8px;">
          {{ showDiff ? 'Hide Changes' : 'View Changes vs Previous' }}
        </ion-chip>
      </div>
    </div>
    <!-- Version History Timeline -->
    <ion-accordion-group v-if="showVersionHistory" class="version-history">
      <ion-accordion value="versions">
        <ion-item slot="header">
          <ion-icon :icon="gitBranchOutline" slot="start" />
          <ion-label>Version History ({{ totalVersions }})</ion-label>
        </ion-item>
        <div slot="content" class="version-timeline">
          <div 
            v-for="version in sortedVersions"
            :key="version.id"
            class="version-item"
            :class="{ 
              active: selectedVersion?.id === version.id,
              current: version.isCurrentVersion 
            }"
            @click="selectVersion(version)"
          >
            <div class="version-marker">
              <div class="version-dot" :class="{ current: version.isCurrentVersion }"></div>
            </div>
            <div class="version-details">
              <div class="version-header">
                <span class="version-number">v{{ version.versionNumber }}</span>
                <span class="version-date">{{ formatDate(version.createdAt) }}</span>
              </div>
              <p class="version-preview">{{ getContentPreview(version.content || '') }}</p>
              <div class="version-meta">
                <span v-if="version.createdByType" class="creation-type">{{ formatCreationType(version.createdByType) }}</span>
                <ion-chip v-if="version.isCurrentVersion" color="success" size="small">Current</ion-chip>
                <!-- LLM Information -->
                <div v-if="getVersionLLMInfo(version)" class="llm-info">
                  <ion-chip color="secondary" size="small">
                    <ion-icon :icon="hardwareChipOutline" />
                    {{ getVersionLLMInfo(version) }}
                  </ion-chip>
                  <span v-if="getVersionCost(version)" class="cost-info">
                    ${{ getVersionCost(version) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ion-accordion>
    </ion-accordion-group>
    <!-- Version Management Panel -->
    <VersionManagementPanel
      v-if="showVersionManagement"
      :deliverable-id="actualDeliverableId"
      :versions="versions"
      :current-version-id="currentVersion?.id"
      :agent-slug="props.agentSlug"
      class="version-management"
    />
    <!-- Content Display -->
    <div class="content-section">
      <!-- Sub-tabs: Plan, Document, Media -->
      <ion-segment v-model="activeSubTab" class="subtabs">
        <ion-segment-button value="plan">Plan</ion-segment-button>
        <ion-segment-button value="document">Document</ion-segment-button>
        <ion-segment-button value="media" :disabled="mediaAssets.length === 0">Media</ion-segment-button>
      </ion-segment>

      <!-- Plan Tab -->
      <div v-if="activeSubTab === 'plan'" class="plan-panel content-display">
        <template v-if="hasPlanContent">
          <pre class="json-content"><code>{{ planPretty }}</code></pre>
        </template>
        <template v-else>
          <div class="text-content">No structured plan content available for this version.</div>
        </template>
      </div>

      <!-- Document Tab -->
      <template v-else-if="activeSubTab === 'document'">
      <!-- Edit Mode -->
      <div v-if="isEditing" class="edit-mode-content">
        <!-- Title Editing -->
        <div class="edit-field">
          <label class="edit-label">Title</label>
          <ion-textarea
            v-model="editedTitle"
            placeholder="Enter deliverable title"
            :rows="1"
            fill="outline"
            class="title-editor"
          />
        </div>
        <!-- Content Editing -->
        <div class="edit-field">
          <label class="edit-label">Content</label>
          <!-- Markdown Toolbar -->
          <div class="markdown-toolbar">
            <div class="toolbar-group">
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('**', '**', 'Bold text')"
                title="Bold"
              >
                <ion-icon :icon="textOutline" />
                <strong>B</strong>
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('*', '*', 'Italic text')"
                title="Italic"
              >
                <ion-icon :icon="textOutline" />
                <em>I</em>
              </ion-button>
            </div>
            <div class="toolbar-group">
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('# ', '', 'Header 1')"
                title="Header 1"
              >
                H1
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('## ', '', 'Header 2')"
                title="Header 2"
              >
                H2
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('### ', '', 'Header 3')"
                title="Header 3"
              >
                H3
              </ion-button>
            </div>
            <div class="toolbar-group">
              <ion-button
                fill="clear"
                size="small"
                @click="insertList('bullet')"
                title="Bullet List"
              >
                <ion-icon :icon="listOutline" />
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertList('numbered')"
                title="Numbered List"
              >
                1.
              </ion-button>
            </div>
            <div class="toolbar-group">
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('[', '](url)', 'Link text')"
                title="Link"
              >
                <ion-icon :icon="linkOutline" />
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('`', '`', 'code')"
                title="Inline Code"
              >
                <ion-icon :icon="codeSlashOutline" />
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertCodeBlock()"
                title="Code Block"
              >
                ```
              </ion-button>
            </div>
            <div class="toolbar-group">
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('> ', '', 'Quote text')"
                title="Quote"
              >
                <ion-icon :icon="chatboxOutline" />
              </ion-button>
              <ion-button
                fill="clear"
                size="small"
                @click="insertMarkdown('---\n', '', '')"
                title="Horizontal Rule"
              >
                <ion-icon :icon="removeOutline" />
              </ion-button>
            </div>
          </div>
          <ion-textarea
            ref="contentTextarea"
            v-model="editedContent"
            placeholder="Enter deliverable content (supports Markdown)"
            :rows="20"
            fill="outline"
            class="content-editor"
          />
        </div>
        <!-- Edit Help Text -->
        <div class="edit-help">
          <ion-icon :icon="informationCircleOutline" />
          <span>You can use Markdown formatting in the content area</span>
        </div>
      </div>
      <!-- Read-Only Mode -->
      <div v-else class="content-display" :class="`format-${displayVersion?.format || 'text'}`">
        <template v-if="showDiff && previousVersion">
          <div class="diff-view">
            <div v-for="(line, idx) in diffLines" :key="idx" :class="['diff-line', `diff-${line.type}`]">
              <span class="diff-prefix">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}</span>
              <span class="diff-text">{{ line.text }}</span>
            </div>
          </div>
        </template>
        <template v-else>
        <!-- Markdown Content -->
        <!-- eslint-disable vue/no-v-html -- Sanitized markdown content -->
        <div
          v-if="displayVersion?.format === 'markdown'"
          class="markdown-content"
          v-html="renderedMarkdown"
        ></div>
        <!-- eslint-enable vue/no-v-html -->
        <!-- JSON Content -->
        <pre 
          v-else-if="displayVersion?.format === 'json'"
          class="json-content"
        ><code>{{ formatJson(displayVersion?.content || '') }}</code></pre>
        <!-- HTML Content -->
        <div 
          v-else-if="displayVersion?.format === 'html'"
          class="html-content"
        >{{ displayVersion?.content }}</div>
        <!-- Plain Text Content -->
        <div 
          v-else
          class="text-content"
        >{{ displayVersion?.content || '' }}</div>
        </template>
      </div>
      </template>

      <!-- Media Tab -->
      <div v-else-if="activeSubTab === 'media'" class="media-panel content-display">
        <div class="media-actions">
          <ion-button size="small" color="secondary" @click="openGenerateModal">Generate Media</ion-button>
        </div>
        <div v-if="mediaAssets.length" class="media-grid">
          <template v-for="(item, idx) in mediaAssets" :key="idx">
            <!-- Image -->
            <img
              v-if="item.type === 'image'"
              class="media-thumb"
              :src="item.thumbnailUrl || item.url"
              :alt="item.altText || 'image'"
              @click="openImage(item)"
            />
            <!-- Video -->
            <video
              v-else-if="item.type === 'video'"
              class="media-thumb"
              :src="item.url"
              :poster="item.thumbnailUrl"
              controls
              @click.stop
            />
          </template>
        </div>
        <div v-else class="text-content">No media attached to this version.</div>
      </div>
    </div>
    <!-- Compact Footer -->
    <div class="deliverable-footer compact">
      <div class="version-info">
        <span class="version-badge">v{{ displayVersion?.versionNumber || currentVersion?.versionNumber || 1 }} of {{ totalVersions }}</span>
        <span v-if="displayVersion?.metadata?.provider && displayVersion?.metadata?.model" class="llm-used">
          ({{ displayVersion.metadata.provider }}/{{ displayVersion.metadata.model }})
        </span>
        <span v-if="getVersionCost(displayVersion)" class="cost-info">
          ${{ getVersionCost(displayVersion) }}
        </span>
      </div>
      <div class="footer-actions">
        <!-- Run with different LLM Button -->
        <ion-button
          fill="clear"
          size="small"
          @click="runWithDifferentLLM"
          color="secondary"
        >
          Run with different LLM
        </ion-button>
        <!-- Inline Rating (if available) -->
        <div v-if="displayVersion?.taskId" class="inline-rating">
          <TaskRating 
            :task-id="displayVersion.taskId"
            :agent-name="displayVersion.createdByType"
          />
        </div>
        <!-- Settings/More Button -->
        <ion-button 
          fill="clear" 
          size="small" 
          @click="showFooterMenu = !showFooterMenu"
        >
          <ion-icon :icon="settingsOutline" />
        </ion-button>
      </div>
    </div>

    <!-- Actions Dropdown Menu -->
    <ion-popover 
      :is-open="showActionsMenu" 
      trigger="actions-trigger"
      @didDismiss="showActionsMenu = false"
    >
      <ion-content>
        <ion-list>
          <ion-item button @click="showVersionControls = !showVersionControls">
            <ion-icon :icon="timeOutline" slot="start" />
            <ion-label>{{ showVersionControls ? 'Hide' : 'Show' }} Versions</ion-label>
          </ion-item>
          <ion-item button @click="showVersionManagement = !showVersionManagement">
            <ion-icon :icon="settingsOutline" slot="start" />
            <ion-label>Manage Versions</ion-label>
          </ion-item>
          <ion-item button @click="showVersionHistory = !showVersionHistory">
            <ion-icon :icon="gitBranchOutline" slot="start" />
            <ion-label>Version History</ion-label>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-popover>
    </div>
  </div>
  <!-- Generate Media Modal -->
  <ion-modal :is-open="showGenerateModal" @didDismiss="showGenerateModal = false">
    <div class="ion-padding">
      <h3>Generate Media</h3>
      <ion-item>
        <ion-label position="stacked">Prompt</ion-label>
        <ion-input v-model="genPrompt" placeholder="Describe the image..." />
      </ion-item>
      <ion-item>
        <ion-label>Size</ion-label>
        <ion-select v-model="genSize">
          <ion-select-option value="256x256">256 x 256</ion-select-option>
          <ion-select-option value="512x512">512 x 512</ion-select-option>
          <ion-select-option value="1024x1024">1024 x 1024</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label>Providers</ion-label>
        <ion-select v-model="genProviders" multiple>
          <ion-select-option value="openai">OpenAI</ion-select-option>
          <ion-select-option value="gemini">Gemini/Imagen</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Count</ion-label>
        <ion-input type="number" min="1" max="4" v-model="genN" />
      </ion-item>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
        <ion-button fill="clear" @click="showGenerateModal = false">Cancel</ion-button>
        <ion-button color="secondary" @click="submitGenerate">Generate</ion-button>
      </div>
    </div>
  </ion-modal>
</template>
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { marked } from 'marked';
import {
  IonChip,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonAccordion,
  IonAccordionGroup,
  IonTextarea,
  IonPopover,
  IonContent,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonModal,
  IonInput,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue';
import {
  timeOutline,
  createOutline,
  downloadOutline,
  chevronBackOutline,
  chevronForwardOutline,
  gitBranchOutline,
  closeOutline,
  saveOutline,
  informationCircleOutline,
  textOutline,
  listOutline,
  linkOutline,
  codeSlashOutline,
  chatboxOutline,
  removeOutline,
  settingsOutline,
  ellipsisVerticalOutline,
  hardwareChipOutline,
} from 'ionicons/icons';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import { useConversationsStore } from '@/stores/conversationsStore';
// import { useAgentsStore } from '@/stores/agentsStore';
import { createDeliverableVersion } from '@/stores/helpers/deliverablesActions';
import { setCurrentVersion } from '@/services/invoke-actions';
import { getDeliverablesService } from '@/services/deliverablesService.impl';
import TaskRating from './TaskRating.vue';
import VersionManagementPanel from './VersionManagementPanel.vue';
import type { Deliverable, DeliverableVersion } from '@/types/deliverables';
interface Props {
  deliverable: Deliverable | DeliverableVersion;
  conversationId?: string;
  agentSlug?: string;
}
interface Emits {
  (e: 'version-changed', version: DeliverableVersion): void;
  (e: 'version-created', version: DeliverableVersion): void;
  (e: 'current-version-changed', version: DeliverableVersion): void;
  (e: 'edit-requested', deliverable: Deliverable): void;
  (e: 'merge-requested', deliverable: Deliverable): void;
  (e: 'run-with-different-llm', data: { deliverable: Deliverable; version: DeliverableVersion }): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();
// Store
const deliverablesStore = useDeliverablesStore();
// Helper computed properties to handle both Deliverable and DeliverableVersion objects
const isVersionObject = computed(() => {
  // DeliverableVersion has 'deliverableId' and 'versionNumber', Deliverable does not
  return 'deliverableId' in props.deliverable && 'versionNumber' in props.deliverable;
});
const actualDeliverableId = computed(() => {
  return isVersionObject.value 
    ? (props.deliverable as DeliverableVersion).deliverableId 
    : (props.deliverable as Deliverable).id;
});
const displayTitle = computed(() => {
  // If it's a version object, we might not have the title, so we'll need to get it from store
  if (isVersionObject.value) {
    const deliverable = deliverablesStore.getDeliverableById(actualDeliverableId.value);
    return deliverable?.title || 'Untitled Deliverable';
  }
  return (props.deliverable as Deliverable).title || 'Untitled Deliverable';
});
// Reactive state
const showVersionHistory = ref(false);
const showVersionManagement = ref(false);
const showDiff = ref(false);
const showVersionControls = ref(true);
const showActionsMenu = ref(false);
const showFooterMenu = ref(false);
const selectedVersion = ref<DeliverableVersion | null>(null);
const selectedVersionIndex = ref(0);
const isEditing = ref(false);
const editedContent = ref('');
const editedTitle = ref('');
const isSaving = ref(false);
const contentTextarea = ref<{ $el?: { querySelector: (selector: string) => HTMLTextAreaElement | null }; querySelector?: (selector: string) => HTMLTextAreaElement | null } | null>(null);
const activeSubTab = ref<'plan' | 'document' | 'media'>('document');
const hasAutoSelectedTab = ref(false);
const showGenerateModal = ref(false);
const genPrompt = ref('');
const genSize = ref<'256x256' | '512x512' | '1024x1024'>('512x512');
const genN = ref(1);
const genProviders = ref<string[]>(['openai']);
// Computed versions that reactively watches the store state
const versions = computed(() => {
  // This will trigger whenever the store state changes
  return deliverablesStore.getDeliverableVersionsSync(actualDeliverableId.value);
});
const totalVersions = computed(() => versions.value.length);
const currentVersion = computed(() => {
  if (isVersionObject.value) {
    // If we have a version object, it's the current version being displayed
    return props.deliverable as DeliverableVersion;
  }
  // If we have a deliverable object, get its current version
  return (props.deliverable as Deliverable).currentVersion || deliverablesStore.getCurrentVersion(actualDeliverableId.value);
});
const displayVersion = computed(() => {
  return selectedVersion.value || [...versions.value].sort((a, b) => b.versionNumber - a.versionNumber)[0] || currentVersion.value;
});
const previousVersion = computed(() => {
  const list = [...versions.value].sort((a, b) => b.versionNumber - a.versionNumber);
  if (!displayVersion.value) return null;
  const idx = list.findIndex(v => v.id === displayVersion.value!.id);
  return idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
});
const sortedVersions = computed(() => {
  return [...versions.value].sort((a, b) => b.versionNumber - a.versionNumber);
});
const isViewingNewest = computed(() => {
  const latest = sortedVersions.value[0];
  return !!(displayVersion.value && latest && displayVersion.value.id === latest.id);
});

// Render markdown content as HTML
const renderedMarkdown = computed(() => {
  if (displayVersion.value?.format === 'markdown' && displayVersion.value?.content) {
    let content = displayVersion.value.content;

    // Strip markdown code fences if present (```markdown ... ```)
    const codeBlockMatch = content.match(/^```(?:markdown)?\n([\s\S]*?)\n```$/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }

    return marked(content, { breaks: true, gfm: true });
  }
  return displayVersion.value?.content || '';
});
// Use sortedVersions for navigation to ensure consistent ordering
const canGoPrevious = computed(() => {
  const currentDisplayVersion = displayVersion.value || currentVersion.value;
  if (!currentDisplayVersion || sortedVersions.value.length <= 1) return false;
  const currentIndex = sortedVersions.value.findIndex(v => v.id === currentDisplayVersion.id);
  return currentIndex < sortedVersions.value.length - 1; // Can go to previous (older) version
});
const canGoNext = computed(() => {
  const currentDisplayVersion = displayVersion.value || currentVersion.value;
  if (!currentDisplayVersion || sortedVersions.value.length <= 1) return false;
  const currentIndex = sortedVersions.value.findIndex(v => v.id === currentDisplayVersion.id);
  return currentIndex > 0; // Can go to next (newer) version
});
const hasUnsavedChanges = computed(() => {
  return isEditing.value && (
    editedContent.value !== (displayVersion.value?.content || '') ||
    editedTitle.value !== displayTitle.value
  );
});
// renderedMarkdown computed property removed - not used in template

// Simple line-by-line diff for markdown/text
const diffLines = computed(() => {
  if (!showDiff.value) return [] as Array<{ type: 'same' | 'add' | 'del'; text: string }>;
  const curr = (displayVersion.value?.content || '').split('\n');
  const prev = (previousVersion.value?.content || '').split('\n');
  const maxLen = Math.max(curr.length, prev.length);
  const out: Array<{ type: 'same' | 'add' | 'del'; text: string }> = [];
  for (let i = 0; i < maxLen; i++) {
    const a = curr[i] ?? '';
    const b = prev[i] ?? '';
    if (a === b) out.push({ type: 'same', text: a });
    else {
      if (b) out.push({ type: 'del', text: b });
      if (a) out.push({ type: 'add', text: a });
    }
  }
  return out;
});
// sanitizedHtml computed property removed - not used in template
// Methods
// Version controls are always visible; no toggle needed

// getTypeColor, getFormatColor, and formatType functions removed - not used in template

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  if (diffInHours < 1) {
    return 'Just now';
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hours ago`;
  } else if (diffInHours < 48) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
};
const formatCreationType = (creationType: string) => {
  if (!creationType || typeof creationType !== 'string') {
    return 'Unknown'; // Default fallback
  }
  const typeMap = {
    ai_response: 'AI Assistant',
    manual_edit: 'Manual Edit',
    ai_enhancement: 'AI Enhancement',
    user_request: 'User Request',
  };
  return typeMap[creationType as keyof typeof typeMap] || creationType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
const getContentPreview = (content: string) => {
  if (!content || typeof content !== 'string') {
    return 'No content available';
  }
  // Remove markdown formatting and get first few lines
  const cleanContent = content
    .replace(/^#+\s+/gm, '') // Remove headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1') // Remove italic
    .replace(/`(.*?)`/g, '$1') // Remove inline code
    .replace(/```[\s\S]*?```/g, '[code block]') // Replace code blocks
    .trim();
  // Get first 150 characters
  return cleanContent.length > 150 
    ? cleanContent.substring(0, 147) + '...'
    : cleanContent;
};
const startEditing = () => {
  isEditing.value = true;
  editedContent.value = displayVersion.value?.content || '';
  editedTitle.value = displayTitle.value || '';
};
const cancelEditing = () => {
  isEditing.value = false;
  editedContent.value = '';
  editedTitle.value = '';
};

const runWithDifferentLLM = () => {
  // Ensure we have a valid version to rerun
  const version = displayVersion.value;
  if (!version) {
    console.error('No version available to rerun');
    return;
  }

  // Get the actual deliverable object
  const deliverable = isVersionObject.value
    ? deliverablesStore.getDeliverableById(actualDeliverableId.value)
    : props.deliverable as Deliverable;

  if (!deliverable) {
    console.error('No deliverable found');
    return;
  }

  // Emit event to parent component to handle LLM chooser and re-run
  emit('run-with-different-llm', {
    deliverable: deliverable,
    version: version
  });
};
const saveEdits = async () => {
  if (!hasUnsavedChanges.value || isSaving.value) return;
  try {
    isSaving.value = true;

    if (!props.agentSlug) {
      throw new Error('Agent information required to save');
    }

    if (!currentVersion.value?.id) {
      throw new Error('No current version to edit from');
    }

    const newVersion = await createDeliverableVersion(
      props.agentSlug,
      actualDeliverableId.value,
      currentVersion.value.id,
      editedContent.value,
      {
        editReason: 'user_edit',
        previousVersionNumber: currentVersion.value.versionNumber,
        format: currentVersion.value.format || 'markdown'
      }
    );

    // Reload the versions to get the updated list
    const versionList = await getDeliverablesService().getVersionHistory(actualDeliverableId.value);
    versionList.forEach(v => {
      deliverablesStore.addVersion(actualDeliverableId.value, v);
    });

    // The versions computed property will automatically update from the store
    // Update the display to show the new version
    selectedVersion.value = newVersion;
    // Find the index of the new version in the versions array
    if (Array.isArray(versions.value)) {
      const newVersionIndex = versions.value.findIndex(v => v.id === newVersion.id);
      if (newVersionIndex !== -1) {
        selectedVersionIndex.value = newVersionIndex;
      }
    }
    // Force reactive updates with nextTick
    await nextTick();
    // Emit an event to notify parent component that a new version was created
    emit('version-created', newVersion);
    isEditing.value = false;
    editedContent.value = '';
    editedTitle.value = '';
  } catch (error: unknown) {

    // Show error message to user
    alert(`Failed to save deliverable: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    isSaving.value = false;
  }
};
// Markdown toolbar methods
const insertMarkdown = (before: string, after: string, placeholder: string) => {
  const ionTextarea = contentTextarea.value;
  const textarea = ionTextarea?.$el?.querySelector('textarea') || ionTextarea?.querySelector?.('textarea');
  if (!textarea) return;
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const selectedText = editedContent.value.substring(start, end);
  const textToInsert = selectedText || placeholder;
  const newText = before + textToInsert + after;
  editedContent.value = 
    editedContent.value.substring(0, start) + 
    newText + 
    editedContent.value.substring(end);
  // Move cursor to the right position
  nextTick(() => {
    const newStart = start + before.length;
    const newEnd = newStart + textToInsert.length;
    textarea.focus();
    textarea.setSelectionRange(newStart, newEnd);
  });
};
const insertList = (type: 'bullet' | 'numbered') => {
  const ionTextarea = contentTextarea.value;
  const textarea = ionTextarea?.$el?.querySelector('textarea') || ionTextarea?.querySelector?.('textarea');
  if (!textarea) return;
  const start = textarea.selectionStart || 0;
  const prefix = type === 'bullet' ? '- ' : '1. ';
  const listItem = `${prefix}List item`;
  // If we're at the start of a line or the previous character is a newline
  const needsNewline = start === 0 || editedContent.value.charAt(start - 1) !== '\n';
  const insertion = (needsNewline ? '\n' : '') + listItem;
  editedContent.value = 
    editedContent.value.substring(0, start) + 
    insertion + 
    editedContent.value.substring(start);
  nextTick(() => {
    const newPos = start + insertion.length;
    textarea.focus();
    textarea.setSelectionRange(newPos, newPos);
  });
};
const insertCodeBlock = () => {
  const ionTextarea = contentTextarea.value;
  const textarea = ionTextarea?.$el?.querySelector('textarea') || ionTextarea?.querySelector?.('textarea');
  if (!textarea) return;
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const selectedText = editedContent.value.substring(start, end);
  const codeBlock = selectedText 
    ? `\n\`\`\`\n${selectedText}\n\`\`\`\n`
    : `\n\`\`\`\ncode here\n\`\`\`\n`;
  editedContent.value = 
    editedContent.value.substring(0, start) + 
    codeBlock + 
    editedContent.value.substring(end);
  nextTick(() => {
    const newStart = start + 5; // Position after ```\n
    textarea.focus();
    textarea.setSelectionRange(newStart, newStart + (selectedText || 'code here').length);
  });
};
const formatJson = (content: string) => {
  if (!content || typeof content !== 'string') {
    return '';
  }
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
};
const loadVersions = async () => {
  try {
    const deliverableId = actualDeliverableId.value;

    // Load versions from service
    const versionList = await getDeliverablesService().getVersionHistory(deliverableId);

    // Update store
    versionList.forEach(v => {
      deliverablesStore.addVersion(deliverableId, v);
    });

    // The versions computed property will automatically update from the store
  } catch {
    // The computed property will handle the fallback through the store
  }
};
// Type guard for media item
interface MediaItem {
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  assetId?: string;
  mime?: string;
}

function isMediaItem(item: unknown): item is MediaItem {
  return typeof item === 'object' && item !== null && 'url' in item && typeof (item as MediaItem).url === 'string';
}

// Combined media assets (images + videos) for the Media tab
const mediaAssets = computed(() => {
  try {
    const attachments = (displayVersion.value as DeliverableVersion)?.fileAttachments;
    if (!attachments || typeof attachments !== 'object') return [];

    const items: Array<{
      type: 'image' | 'video';
      url: string;
      thumbnailUrl?: string;
      altText?: string;
      assetId?: string;
      mime?: string;
    }> = [];

    // Add images
    const imgsField = (attachments as Record<string, unknown>).images;
    if (Array.isArray(imgsField)) {
      items.push(
        ...imgsField.filter(isMediaItem).map((img) => ({
          type: 'image' as const,
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          altText: img.altText,
          assetId: img.assetId,
          mime: img.mime,
        })),
      );
    }

    // Add videos
    const vidsField = (attachments as Record<string, unknown>).videos;
    if (Array.isArray(vidsField)) {
      items.push(
        ...vidsField.filter(isMediaItem).map((vid) => ({
          type: 'video' as const,
          url: vid.url,
          thumbnailUrl: vid.thumbnailUrl,
          altText: vid.altText,
          assetId: vid.assetId,
          mime: vid.mime,
        })),
      );
    }

    return items;
  } catch {
    return [];
  }
});
const hasPlanContent = computed(() => {
  const c = displayVersion.value?.content || '';
  if (displayVersion.value?.format === 'json') {
    try {
      const parsed = JSON.parse(c);
      return Boolean(parsed?.phases || parsed?.steps || parsed?.plan || parsed?.plan_json);
    } catch { return false; }
  }
  return /(^|\n)#+\s*plan\b/i.test(c);
});
const planPretty = computed(() => {
  const c = displayVersion.value?.content || '';
  if (displayVersion.value?.format === 'json') {
    try { return JSON.stringify(JSON.parse(c), null, 2); } catch { return c; }
  }
  return c;
});
function openImage(img: { url: string }) {
  try { window.open(img.url, '_blank'); } catch {}
}

// Auto-select Plan tab once when structured plan content is detected
watch(hasPlanContent, (val) => {
  if (val && !hasAutoSelectedTab.value) {
    activeSubTab.value = 'plan';
    hasAutoSelectedTab.value = true;
  }
});

function openGenerateModal() {
  genPrompt.value = '';
  genSize.value = '512x512';
  genN.value = 1;
  genProviders.value = ['openai'];
  showGenerateModal.value = true;
}

async function submitGenerate() {
  // TODO: Media generation will be implemented via transport types similar to converse/plan/build/hitl
  // For now, this is a placeholder that just closes the modal
  console.warn('Image generation not yet implemented via unified orchestrator');
  showGenerateModal.value = false;
}
const goToPreviousVersion = async () => {
  if (!canGoPrevious.value) return;
  // Find current version index in sortedVersions (newest first)
  const currentDisplayVersion = displayVersion.value || currentVersion.value;
  if (!Array.isArray(sortedVersions.value) || !currentDisplayVersion) return;
  const currentIndex = sortedVersions.value.findIndex(v => v.id === currentDisplayVersion.id);
  // Go to previous (older) version - next index in the sorted array
  if (currentIndex < sortedVersions.value.length - 1) {
    const previousVersion = sortedVersions.value[currentIndex + 1];
    selectedVersionIndex.value = currentIndex + 1;
    await selectAndDisplayVersion(previousVersion);
  }
};
const goToNextVersion = async () => {
  if (!canGoNext.value) return;
  // Find current version index in sortedVersions (newest first)
  const currentDisplayVersion = displayVersion.value || currentVersion.value;
  const currentIndex = sortedVersions.value.findIndex(v => v.id === currentDisplayVersion?.id);
  // Go to next (newer) version - previous index in the sorted array
  if (currentIndex > 0) {
    const nextVersion = sortedVersions.value[currentIndex - 1];
    selectedVersionIndex.value = currentIndex - 1;
    await selectAndDisplayVersion(nextVersion);
  }
};
const selectVersion = async (version: DeliverableVersion) => {
  selectedVersion.value = version;
  await selectAndDisplayVersion(version);
};
const selectAndDisplayVersion = async (version: DeliverableVersion) => {
  selectedVersion.value = version;
  // If this is not a full version object with content, load it
  if (!version.content && version.id) {
    try {
      const fullVersion = await deliverablesStore.getDeliverableVersionsSync(actualDeliverableId.value).find(v => v.id === version.id);
      if (fullVersion) {
        selectedVersion.value = fullVersion;
      }
    } catch {
      // Failed to load full version
    }
  }
};
const makeCurrentVersion = async () => {
  if (!selectedVersion.value) return;
  try {
    // Get deliverable to find agentSlug and conversationId
    const deliverable = deliverablesStore.getDeliverableById(actualDeliverableId.value);
    if (!deliverable) throw new Error('Deliverable not found');

    // Get agent slug from props, or derive from conversation
    let agentSlug = props.agentSlug;

    if (!agentSlug) {
      // Try to get from conversation
      const conversationsStore = useConversationsStore();
      const conversation = deliverable.conversationId
        ? conversationsStore.conversationById(deliverable.conversationId)
        : conversationsStore.activeConversation;

      if (conversation?.agentName) {
        // Convert agent display name to slug format (e.g., "Blog Post Writer" -> "blog_post_writer")
        agentSlug = conversation.agentName.toLowerCase().replace(/\s+/g, '_');
      } else {
        throw new Error('Unable to determine agent for this deliverable');
      }
    }

    // Call the backend to set this version as current using action
    // Note: setCurrentVersion gets deliverableId from ExecutionContext store
    await setCurrentVersion(selectedVersion.value.id);

    // Reload versions to get updated current version status
    const versionList = await getDeliverablesService().getVersionHistory(actualDeliverableId.value);
    versionList.forEach(v => {
      deliverablesStore.addVersion(actualDeliverableId.value, v);
    });

    // Update local state
    selectedVersion.value.isCurrentVersion = true;
    emit('current-version-changed', selectedVersion.value);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    alert(`Failed to set current version: ${errorMessage}`);
  }
};
// loadAndEmitFullVersion function removed - not used
const downloadDeliverable = () => {
  const content = displayVersion.value?.content || '';
  const filename = `${displayTitle.value.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${getFileExtension()}`;
  const blob = new Blob([content], { type: getMimeType() });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
const getFileExtension = () => {
  const format = displayVersion.value?.format || 'text';
  const extensions = {
    markdown: 'md',
    html: 'html',
    json: 'json',
    text: 'txt',
  };
  return extensions[format as keyof typeof extensions] || 'txt';
};
const getMimeType = () => {
  const format = displayVersion.value?.format || 'text';
  const mimeTypes = {
    markdown: 'text/markdown',
    html: 'text/html',
    json: 'application/json',
    text: 'text/plain',
  };
  return mimeTypes[format as keyof typeof mimeTypes] || 'text/plain';
};

/**
 * Extract LLM information from version metadata
 */
const getVersionLLMInfo = (version: DeliverableVersion | undefined): string | null => {
  if (!version?.metadata || typeof version.metadata !== 'object') return null;

  const metadata = version.metadata as Record<string, unknown>;

  // Check for rerun LLM info first (most specific)
  const llmRerunInfo = metadata.llmRerunInfo;
  if (llmRerunInfo && typeof llmRerunInfo === 'object') {
    const info = llmRerunInfo as Record<string, unknown>;
    if (typeof info.provider === 'string' && typeof info.model === 'string') {
      return `${info.provider}/${info.model}`;
    }
  }

  // Check for general LLM metadata
  const llmMetadata = metadata.llmMetadata;
  if (llmMetadata && typeof llmMetadata === 'object') {
    // Convert Vue proxy to plain object for easier access
    const info = JSON.parse(JSON.stringify(llmMetadata)) as Record<string, unknown>;

    // Handle direct provider/model format (from reruns and new initial creation)
    if (typeof info.provider === 'string' && typeof info.model === 'string') {
      return `${info.provider}/${info.model}`;
    }

    // Handle originalLLMSelection format (from old initial creation)
    const originalLLMSelection = info.originalLLMSelection;
    if (originalLLMSelection && typeof originalLLMSelection === 'object') {
      const selection = originalLLMSelection as Record<string, unknown>;
      if (typeof selection.providerName === 'string' && typeof selection.modelName === 'string') {
        return `${selection.providerName}/${selection.modelName}`;
      }
    }
  }

  // Check for legacy LLM metadata formats
  const llmUsed = metadata.llmUsed;
  if (llmUsed && typeof llmUsed === 'object') {
    const info = llmUsed as Record<string, unknown>;
    if (typeof info.provider === 'string' && typeof info.model === 'string') {
      return `${info.provider}/${info.model}`;
    }
  }

  // Check top-level provider/model (from metadata enrichment)
  if (typeof metadata.provider === 'string' && typeof metadata.model === 'string') {
    return `${metadata.provider}/${metadata.model}`;
  }

  return null;
};

/**
 * Extract cost information from version metadata
 */
const getVersionCost = (version: DeliverableVersion | undefined): string | null => {
  if (!version?.metadata || typeof version.metadata !== 'object') return null;

  const metadata = version.metadata as Record<string, unknown>;

  // Helper to extract cost from nested objects
  const extractCost = (obj: unknown): number | null => {
    if (typeof obj === 'number') return obj;
    if (typeof obj === 'object' && obj !== null) {
      const costField = (obj as Record<string, unknown>).cost;
      if (typeof costField === 'number') return costField;
    }
    return null;
  };

  // Check various possible locations for cost data
  let cost: number | null = null;

  // Try llmMetadata.cost
  const llmMetadata = metadata.llmMetadata;
  if (!cost && llmMetadata && typeof llmMetadata === 'object') {
    cost = extractCost(llmMetadata);

    // Try llmMetadata.originalLLMSelection.cost
    if (!cost) {
      const originalLLMSelection = (llmMetadata as Record<string, unknown>).originalLLMSelection;
      cost = extractCost(originalLLMSelection);
    }
  }

  // Try llmRerunInfo.cost
  if (!cost) {
    cost = extractCost(metadata.llmRerunInfo);
  }

  // Try usage.cost
  if (!cost) {
    cost = extractCost(metadata.usage);
  }

  // Try costCalculation.cost
  if (!cost) {
    cost = extractCost(metadata.costCalculation);
  }

  if (typeof cost === 'number' && cost > 0) {
    return cost.toFixed(4);
  }

  return null;
};
// Watch for deliverable changes and reload versions
watch(() => props.deliverable?.id, async () => {
  if (props.deliverable) {
    loadVersions();
    // Set deliverable context for proper metadata handling
    try {
      const { useContextStore } = await import('@/stores/contextStore');
      const contextStore = useContextStore();
      contextStore.setDeliverableContext(actualDeliverableId.value);
    } catch {
      // Failed to set deliverable context
    }
  }
}, { immediate: true });
</script>
<style scoped>
.deliverable-display {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ion-color-step-50);
  padding: 20px;
  overflow-y: auto;
}
.document-paper {
  background: white;
  border-radius: 12px;
  box-shadow: 
    0 4px 6px rgba(0, 0, 0, 0.05),
    0 1px 3px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  min-height: calc(100% - 40px);
  max-width: 100%;
  margin: 0 auto;
  position: relative;
}
/* Add subtle paper texture */
.document-paper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    linear-gradient(90deg, transparent 79px, rgba(0,0,0,0.02) 79px, rgba(0,0,0,0.02) 81px, transparent 81px),
    repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(0,0,0,0.01) 24px, rgba(0,0,0,0.01) 25px);
  pointer-events: none;
  border-radius: 12px;
}
.deliverable-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 24px 16px 24px;
  border-bottom: 2px solid var(--ion-color-light);
  background: linear-gradient(to bottom, var(--ion-color-light-tint), #ffffff);
  border-radius: 12px 12px 0 0;
  position: relative;
  z-index: 1;
}
@media (min-width: 768px) {
  .deliverable-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
}
.title-section {
  flex: 1;
}
.deliverable-title {
  margin: 0 0 8px 0;
  font-size: 1.2em;
  font-weight: 600;
  color: var(--ion-color-dark);
  line-height: 1.3;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  max-width: 100%;
}
.metadata {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem; /* Better spacing for touch targets */
  align-items: center;
  justify-content: flex-end;
}

/* Ensure all header buttons have proper touch targets */
.header-actions ion-button {
  min-width: 2.75rem; /* 44px minimum touch target */
  min-height: 2.75rem;
}
@media (max-width: 767px) {
  .header-actions {
    justify-content: flex-start;
    width: 100%;
  }
}
.version-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ion-color-light-shade);
  background: var(--ion-color-step-50);
}
.version-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.version-label {
  font-weight: 500;
  color: var(--ion-color-dark);
}
.created-by {
  font-size: 0.9em;
  color: var(--ion-color-medium);
}
.version-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.version-history {
  border-bottom: 1px solid var(--ion-color-light-shade);
}
.version-timeline {
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}
.version-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid var(--ion-color-light-shade);
  cursor: pointer;
  transition: all 0.2s ease;
}
.version-item:last-child {
  border-bottom: none;
}
.version-item:hover {
  background: var(--ion-color-step-50);
  margin: 0 -16px;
  padding: 12px 16px;
  border-radius: 8px;
}
.version-item.active {
  background: var(--ion-color-primary-tint);
  margin: 0 -16px;
  padding: 12px 16px;
  border-radius: 8px;
  border-color: var(--ion-color-primary);
}
.version-marker {
  margin-right: 12px;
  margin-top: 4px;
}
.version-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ion-color-medium);
  border: 2px solid white;
  box-shadow: 0 0 0 2px var(--ion-color-medium);
}
.version-dot.latest {
  background: var(--ion-color-success);
  box-shadow: 0 0 0 2px var(--ion-color-success);
}
.version-details {
  flex: 1;
}
.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.version-number {
  font-weight: 600;
  color: var(--ion-color-dark);
}
.version-date {
  font-size: 0.85em;
  color: var(--ion-color-medium);
}
.version-preview {
  margin: 4px 0;
  font-size: 0.9em;
  color: var(--ion-color-dark);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.version-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.agent-name {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}
.content-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content-display {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: white;
  position: relative;
  z-index: 1;
}
.subtabs {
  margin: 8px 16px 0 16px;
}
.images-panel .thumb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.images-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.images-panel .thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
}

/* Media panel styles (combined images + videos) */
.media-panel .media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.media-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.media-panel .media-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
}
.media-panel video.media-thumb {
  background: #000;
}
.markdown-content {
  line-height: 1.7;
  color: #1f2937;
  font-size: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--ion-color-dark);
  margin-top: 24px;
  margin-bottom: 12px;
}
.markdown-content :deep(h1):first-child,
.markdown-content :deep(h2):first-child,
.markdown-content :deep(h3):first-child {
  margin-top: 0;
}
.markdown-content :deep(pre) {
  background: var(--ion-color-step-100);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
}
.markdown-content :deep(code) {
  background: var(--ion-color-step-100);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}

/* Simple diff styling */
.diff-view {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9rem;
  background: var(--ion-color-light);
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 8px 12px;
}
.diff-line { display: flex; gap: 8px; white-space: pre-wrap; }
.diff-prefix { width: 1em; display: inline-block; }
.diff-same { color: var(--ion-color-dark); }
.diff-add { color: #0a7a0a; background: rgba(14, 159, 110, 0.08); }
.diff-del { color: #933; background: rgba(220, 53, 69, 0.08); text-decoration: line-through; }
.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--ion-color-primary);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--ion-color-medium);
}
.json-content,
.text-content {
  white-space: pre-wrap;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  line-height: 1.5;
  color: var(--ion-color-dark);
}
.json-content {
  background: var(--ion-color-step-50);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}
.html-content {
  line-height: 1.6;
  color: var(--ion-color-dark);
}
.deliverable-footer {
  padding: 20px 24px;
  border-top: 2px solid #e2e8f0;
  background: linear-gradient(to top, #fafbfc, #ffffff);
  border-radius: 0 0 12px 12px;
  position: relative;
  z-index: 1;
}
.timestamps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.created,
.updated {
  font-size: 0.85em;
  color: var(--ion-color-medium);
}
.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 16px;
}
.rating-section {
  border-top: 1px solid var(--ion-color-light-shade);
  padding-top: 16px;
}
.rating-label {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--ion-color-dark);
  margin-bottom: 4px;
}
.rating-context {
  font-size: 0.8em;
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}
/* Edit Mode Styles */
.edit-mode-content {
  padding: 16px;
}
.edit-field {
  margin-bottom: 16px;
}
.edit-label {
  display: block;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--ion-color-dark);
  margin-bottom: 8px;
}
.title-editor {
  --background: white;
  --color: var(--ion-color-dark);
}
.content-editor {
  --background: white;
  --color: var(--ion-color-dark);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
  line-height: 1.5;
}
.edit-controls {
  display: flex;
  gap: 0.5rem; /* Better spacing for touch targets */
  align-items: center;
  flex-wrap: wrap;
}
.edit-help {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  color: var(--ion-color-medium);
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--ion-color-step-100);
  border-radius: 6px;
}
.edit-help ion-icon {
  font-size: 1.1em;
}
.markdown-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: var(--ion-color-step-100);
  border: 1px solid var(--ion-color-light);
  border-radius: 6px;
  margin-bottom: 8px;
}
.toolbar-group {
  display: flex;
  gap: 4px;
  align-items: center;
}
.toolbar-group:not(:last-child)::after {
  content: '';
  width: 1px;
  height: 20px;
  background: var(--ion-color-light);
  margin-left: 4px;
}
.markdown-toolbar ion-button {
  --color: var(--ion-color-medium);
  --padding-start: 6px;
  --padding-end: 6px;
  min-width: 32px;
  height: 32px;
  font-size: 0.85em;
  font-weight: 600;
}
.markdown-toolbar ion-button:hover {
  --color: var(--ion-color-primary);
  --background: var(--ion-color-primary-tint);
}
.markdown-toolbar ion-button ion-icon {
  font-size: 0.9em;
  margin-right: 2px;
}
.markdown-toolbar ion-button strong,
.markdown-toolbar ion-button em {
  font-size: 0.9em;
  margin-left: 2px;
}
/* Dark theme support */
@media (prefers-color-scheme: dark), 
html[data-theme="dark"] {
  .deliverable-display {
    background: #0f172a;
    color: #e2e8f0;
  }
  .document-paper {
    background: #1e293b;
    box-shadow: 
      0 4px 6px rgba(0, 0, 0, 0.2),
      0 1px 3px rgba(0, 0, 0, 0.3),
      inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }
  .document-paper::before {
    background: 
      linear-gradient(90deg, transparent 79px, rgba(255,255,255,0.03) 79px, rgba(255,255,255,0.03) 81px, transparent 81px),
      repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(255,255,255,0.02) 24px, rgba(255,255,255,0.02) 25px);
  }
  .deliverable-header {
    background: linear-gradient(to bottom, #334155, #1e293b);
    border-color: #475569;
    color: #f7fafc;
  }
  .content-display {
    background: #1e293b;
  }
  .deliverable-header h2 {
    color: #f7fafc;
  }
  .deliverable-meta {
    color: #a0aec0;
  }
  .version-section {
    background: #2d3748;
    border-color: #4a5568;
  }
  .version-item {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }
  .version-item:hover {
    background: #4b5563;
  }
  .version-item.active {
    background: rgba(21, 128, 61, 0.15);
    border-color: #15803d;
    color: #22c55e;
  }
  .deliverable-content {
    background: #1a202c;
    color: #e2e8f0;
  }
  .markdown-content {
    color: #e2e8f0;
  }
  .markdown-content :deep(h1),
  .markdown-content :deep(h2),
  .markdown-content :deep(h3),
  .markdown-content :deep(h4),
  .markdown-content :deep(h5),
  .markdown-content :deep(h6) {
    color: #f7fafc;
  }
  .markdown-content :deep(strong),
  .markdown-content :deep(b) {
    color: #f7fafc;
  }
  .markdown-content :deep(pre) {
    background: #111827;
    color: #e5e7eb;
    border: 1px solid #374151;
  }
  .markdown-content :deep(code) {
    background: #111827;
    color: #68d391;
    border: 1px solid #374151;
  }
  .markdown-content :deep(blockquote) {
    border-left-color: #4b5563;
    background-color: rgba(255, 255, 255, 0.02);
    color: #cbd5e0;
  }
  .markdown-content :deep(a) {
    color: #63b3ed;
  }
  .json-content {
    background: #111827;
    color: #e5e7eb;
    border: 1px solid #374151;
  }
  .deliverable-footer {
    background: linear-gradient(to top, #334155, #1e293b);
    border-color: #475569;
    color: #a0aec0;
  }
  .rating-label {
    color: #f7fafc;
  }
  .rating-context {
    color: #a0aec0;
  }
  .title-editor,
  .content-editor {
    --background: #374151;
    --color: #e2e8f0;
    --border-color: #4a5568;
  }
  .edit-help {
    background: #2d3748;
    color: #a0aec0;
  }
  .markdown-toolbar {
    background: #2d3748;
    border-color: #4a5568;
  }
  .toolbar-group:not(:last-child)::after {
    background: #4a5568;
  }
  .markdown-toolbar ion-button {
    --color: #d1d5db;
  }
  .markdown-toolbar ion-button:hover {
    --color: #22c55e;
    --background: #374151;
  }
}
html[data-theme="dark"] .rating-label {
  color: #f7fafc;
}
html[data-theme="dark"] .rating-context {
  color: #a0aec0;
}
.deliverable-actions {
  padding: 16px;
  border-top: 1px solid var(--ion-color-light-shade);
  background: var(--ion-color-step-25);
}

/* Compact Layout Styles */
.deliverable-header.compact {
  padding: 16px 24px 12px 24px;
  gap: 12px;
}

.deliverable-header.compact .deliverable-title {
  font-size: 1.1em;
  margin: 0;
}

.normal-actions {
  display: flex;
  gap: 0.5rem; /* Better spacing for touch targets */
  align-items: center;
}

.deliverable-footer.compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 24px 16px 24px;
  border-top: 1px solid var(--ion-color-light-shade);
  background: var(--ion-color-step-25);
  font-size: 0.85em;
  color: var(--ion-color-medium);
}

.deliverable-footer.compact .version-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.version-badge {
  background: var(--ion-color-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 500;
}

.deliverable-footer.compact .created-by {
  color: var(--ion-color-medium-shade);
}

.footer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inline-rating {
  margin-right: 8px;
}

/* Content Section gets more space */
.content-section {
  flex: 1;
  min-height: 60vh; /* Ensure content gets priority */
}

/* Hide metadata chips in compact mode - move to dropdown if needed */
.deliverable-header.compact .metadata {
  display: none;
}

/* Floating Action Button */
.deliverable-fab {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 100;
}

/* Enhanced Actions Panel */
.deliverable-actions {
  padding: 0;
  border-top: 1px solid var(--ion-color-light-shade);
  background: var(--ion-color-step-25);
  border-radius: 0 0 12px 12px;
}

.actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 8px 16px;
  background: var(--ion-color-step-50);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.actions-title {
  font-size: 0.9em;
  font-weight: 500;
  color: var(--ion-color-dark);
}

.deliverable-actions form {
  padding: 8px;
}

.deliverable-actions ion-item {
  --background: transparent;
  --border-color: var(--ion-color-light-shade);
}

.deliverable-prompt-input {
  --background: var(--ion-color-light);
  --color: var(--ion-color-dark);
  border-radius: 8px;
}
</style>
