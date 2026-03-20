<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleClose"
    class="deliverables-modal"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title || 'Deliverable' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleClose">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Version Badge -->
      <div class="version-info">
        <VersionBadge
          :version-number="displayVersionNumber"
          :creation-type="currentCreationType"
          :is-current="true"
        />
        <span v-if="topic" class="topic-label">{{ topic }}</span>
        <span v-if="versionCost" class="cost-label">
          <ion-icon :icon="cashOutline" />
          ${{ versionCost.toFixed(4) }}
        </span>
      </div>

      <!-- Version History -->
      <VersionSelector
        v-if="versions.length > 1"
        :versions="versions"
        :selected-version-id="selectedVersionId"
        :loading="isLoadingVersions"
        @select="handleVersionSelect"
        class="version-section"
      />

      <!-- Media Viewer (for image/video deliverables) -->
      <div v-if="isMediaType" class="media-viewer">
        <div v-if="mediaAssets.length" class="media-grid">
          <template v-for="(item, idx) in mediaAssets" :key="idx">
            <img
              v-if="item.type === 'image'"
              class="media-item"
              :src="item.url"
              :alt="item.altText || 'Generated image'"
              @click="openFullImage(item.url)"
            />
            <video
              v-else-if="item.type === 'video'"
              class="media-item"
              :src="item.url"
              :poster="item.thumbnailUrl"
              controls
            />
          </template>
        </div>
        <div v-else class="no-media">
          <p>No media content available.</p>
        </div>
        <div v-if="displayContent.blogPost" class="media-prompt">
          <strong>Prompt:</strong> {{ displayContent.blogPost }}
        </div>
      </div>

      <!-- Content Viewer/Editor (for text deliverables) -->
      <template v-else>
        <!-- Edit Mode -->
        <div v-if="isEditing" class="edit-mode-container">
          <div class="edit-mode-header">
            <span class="edit-mode-label">Editing</span>
            <div class="edit-mode-actions">
              <ion-button fill="clear" size="small" @click="cancelEdit" :disabled="isSaving">
                Cancel
              </ion-button>
              <ion-button fill="solid" size="small" color="secondary" @click="saveEdit" :disabled="isSaving">
                {{ isSaving ? 'Saving...' : 'Save' }}
              </ion-button>
            </div>
          </div>
          <ContentEditor
            v-model:blog-post="editedContent.blogPost"
            v-model:seo-description="editedContent.seoDescription"
            v-model:social-posts="editedContent.socialPosts"
            :disabled="isSaving"
          />
        </div>
        <!-- View Mode -->
        <ContentViewer
          v-else
          :blog-post="displayContent.blogPost"
          :seo-description="displayContent.seoDescription"
          :social-posts="displayContent.socialPosts"
          :loading="isLoading"
        />
      </template>

      <!-- Evaluation Section -->
      <div class="evaluation-section" v-if="currentTaskId">
        <h3>Rate this agent's work</h3>
        <TaskRating :task-id="currentTaskId" />
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <DeliverableActionButtons
          :deliverable-id="deliverableId"
          :current-version-id="selectedVersionId"
          :is-loading="isActionLoading"
          :deliverable-type="deliverableType"
          :media-count="mediaAssets.length"
          @edit="handleEdit"
          @rerun="handleRerun"
          @rerun-with-different-llm="handleRerunWithDifferentLlm"
          @export="handleExport"
          @media-export="handleMediaExport"
        />
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonFooter,
} from '@ionic/vue';
import { closeOutline, cashOutline } from 'ionicons/icons';
import ContentViewer from '@/components/shared/ContentViewer.vue';
import ContentEditor from '@/components/shared/ContentEditor.vue';
import VersionSelector from '@/components/shared/VersionSelector.vue';
import VersionBadge from '@/components/shared/VersionBadge.vue';
import DeliverableActionButtons from './DeliverableActionButtons.vue';
import TaskRating from '@/components/TaskRating.vue';
import { getDeliverablesService } from '@/services/deliverablesService.impl';
import { DeliverableVersionCreationType, DeliverableFormat } from '@/services/deliverablesService';
import { useDeliverablesStore } from '@/stores/deliverablesStore';
import type { DeliverableVersion } from '@/services/deliverablesService';
import type { VersionCreationType } from '@/components/shared/types';
import type { HitlGeneratedContent } from '@/types/forge-types';

interface Props {
  isOpen: boolean;
  deliverableId: string;
  title?: string;
  topic?: string;
  initialContent?: HitlGeneratedContent;
  currentVersionNumber?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  edit: [deliverableId: string, versionId: string];
  rerun: [deliverableId: string, versionId: string];
  rerunWithDifferentLlm: [deliverableId: string, versionId: string, version: DeliverableVersion];
}>();

// Store for reactivity to version updates
const deliverablesStore = useDeliverablesStore();

// State
const isLoading = ref(false);
const isLoadingVersions = ref(false);
const isActionLoading = ref(false);
const selectedVersionId = ref<string | undefined>();
const isEditing = ref(false);
const isSaving = ref(false);

// Versions from store - reactive!
const versions = computed(() => {
  if (!props.deliverableId) return [];
  // This is reactive - when store updates, this recomputes
  return deliverablesStore.getDeliverableVersionsSync(props.deliverableId) || [];
});

// Content state
const displayContent = reactive<HitlGeneratedContent>({
  blogPost: '',
  seoDescription: '',
  socialPosts: [],
});

// Edited content state (string format for editor)
const editedContent = reactive<{
  blogPost: string;
  seoDescription: string;
  socialPosts: string;
}>({
  blogPost: '',
  seoDescription: '',
  socialPosts: '',
});

/**
 * Convert socialPosts array to newline-separated string for editing
 */
function socialPostsToString(posts: unknown[] | undefined): string {
  if (!posts || !Array.isArray(posts)) return '';
  return posts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}

// Computed
const displayVersionNumber = computed(() => {
  const current = versions.value.find((v) => v.id === selectedVersionId.value);
  return current?.versionNumber ?? props.currentVersionNumber ?? 1;
});

const currentCreationType = computed<VersionCreationType>(() => {
  const current = versions.value.find((v) => v.id === selectedVersionId.value);
  return (current?.createdByType as VersionCreationType) || 'ai_response';
});

const currentTaskId = computed(() => {
  const current = versions.value.find((v) => v.id === selectedVersionId.value);
  return current?.taskId;
});

// Get the cost from current version's metadata
const versionCost = computed(() => {
  const current = versions.value.find((v) => v.id === selectedVersionId.value);
  const metadata = current?.metadata as Record<string, unknown> | undefined;
  const cost = metadata?.cost;
  return typeof cost === 'number' ? cost : null;
});

// Get the deliverable type from store
const deliverableType = computed(() => {
  if (!props.deliverableId) return 'document';
  const deliverable = deliverablesStore.getDeliverableById(props.deliverableId);
  console.log('🖼️ [DeliverablesModal] deliverableType computed - deliverableId:', props.deliverableId, 'deliverable:', deliverable, 'type:', deliverable?.type);
  return deliverable?.type || 'document';
});

// Check if this is a media type deliverable
const isMediaType = computed(() => {
  const result = deliverableType.value === 'image' || deliverableType.value === 'video';
  console.log('🖼️ [DeliverablesModal] isMediaType computed:', result, 'type:', deliverableType.value);
  return result;
});

// Get media assets from current version's fileAttachments
const mediaAssets = computed(() => {
  const current = versions.value.find((v) => v.id === selectedVersionId.value);
  const attachments = current?.fileAttachments;
  console.log('🖼️ [DeliverablesModal] mediaAssets computed - versionId:', selectedVersionId.value, 'attachments:', attachments);
  if (!attachments) return [];

  const items: Array<{
    type: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
    altText?: string;
  }> = [];

  // Add images
  const imgs = attachments.images as Array<{ url: string; thumbnailUrl?: string; altText?: string }> | undefined;
  if (Array.isArray(imgs)) {
    items.push(...imgs.map((img) => ({ type: 'image' as const, ...img })));
  }

  // Add videos
  const vids = attachments.videos as Array<{ url: string; thumbnailUrl?: string; altText?: string }> | undefined;
  if (Array.isArray(vids)) {
    items.push(...vids.map((vid) => ({ type: 'video' as const, ...vid })));
  }

  return items;
});

// Open full image in new tab
function openFullImage(url: string) {
  window.open(url, '_blank');
}

// Initialize content when modal opens
watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      // Reset edit state
      isEditing.value = false;
      isSaving.value = false;

      // Set initial content if provided
      if (props.initialContent) {
        displayContent.blogPost = props.initialContent.blogPost || '';
        displayContent.seoDescription = props.initialContent.seoDescription || '';
        displayContent.socialPosts = props.initialContent.socialPosts || [];
      }

      // Load versions from API to populate store (if not already there)
      if (props.deliverableId && versions.value.length === 0) {
        await loadVersions();
      } else if (props.deliverableId && versions.value.length > 0) {
        // Versions already in store, just select the current one
        const current = versions.value.find((v) => v.isCurrentVersion);
        selectedVersionId.value = current?.id;
        if (current && !props.initialContent) {
          loadVersionContent(current);
        }
      }
    } else {
      // Modal closing - reset edit state
      isEditing.value = false;
    }
  }
);

// Watch for new versions added to store - auto-select and display new current version
watch(
  () => versions.value,
  (newVersions) => {
    if (props.isOpen && newVersions.length > 0) {
      const current = newVersions.find((v) => v.isCurrentVersion);
      if (current && current.id !== selectedVersionId.value) {
        console.log('🔍 [DeliverablesModal] New version detected, selecting:', current.id);
        selectedVersionId.value = current.id;
        loadVersionContent(current);
      }
    }
  },
  { deep: true }
);

// Load version history from API and populate store
async function loadVersions() {
  if (!props.deliverableId) return;

  isLoadingVersions.value = true;
  try {
    const history = await getDeliverablesService().getVersionHistory(props.deliverableId);

    // Add each version to the store (store handles deduplication)
    history.forEach((version) => {
      deliverablesStore.addVersion(props.deliverableId, version);
    });

    // Select current version
    const current = history.find((v) => v.isCurrentVersion);
    selectedVersionId.value = current?.id;

    // Load content from current version if no initial content
    if (current && !props.initialContent) {
      loadVersionContent(current);
    }
  } catch (error) {
    console.error('Failed to load versions:', error);
  } finally {
    isLoadingVersions.value = false;
  }
}

// Load content from a version
function loadVersionContent(version: DeliverableVersion) {
  if (version.content) {
    try {
      const content = JSON.parse(version.content);
      displayContent.blogPost = content.blogPost || '';
      displayContent.seoDescription = content.seoDescription || '';
      displayContent.socialPosts = content.socialPosts || [];
    } catch {
      // Content might be plain text
      displayContent.blogPost = version.content;
      displayContent.seoDescription = '';
      displayContent.socialPosts = [];
    }
  }
}

// Handle version selection
function handleVersionSelect(version: DeliverableVersion) {
  selectedVersionId.value = version.id;
  loadVersionContent(version);
}

// Action handlers
function handleEdit() {
  // Enter edit mode instead of emitting
  isEditing.value = true;
  editedContent.blogPost = displayContent.blogPost || '';
  editedContent.seoDescription = displayContent.seoDescription || '';
  editedContent.socialPosts = socialPostsToString(displayContent.socialPosts);
}

function cancelEdit() {
  isEditing.value = false;
  // Reset edited content to display content
  editedContent.blogPost = displayContent.blogPost || '';
  editedContent.seoDescription = displayContent.seoDescription || '';
  editedContent.socialPosts = socialPostsToString(displayContent.socialPosts);
}

async function saveEdit() {
  if (isSaving.value) return;
  isSaving.value = true;

  try {
    // Convert edited content back to display format
    const newContent: HitlGeneratedContent = {
      blogPost: editedContent.blogPost,
      seoDescription: editedContent.seoDescription,
      socialPosts: editedContent.socialPosts.split('\n').filter((p) => p.trim()),
    };

    // Create a new version with the edited content
    const currentVersion = versions.value.find((v) => v.id === selectedVersionId.value);
    if (!currentVersion) {
      throw new Error('No version selected');
    }

    // Call API to create new version
    const newVersion = await getDeliverablesService().createVersion(props.deliverableId, {
      content: JSON.stringify(newContent),
      format: (currentVersion.format as DeliverableFormat) || DeliverableFormat.JSON,
      createdByType: DeliverableVersionCreationType.MANUAL_EDIT,
      metadata: { previousVersionId: currentVersion.id },
    });

    // Add to store
    deliverablesStore.addVersion(props.deliverableId, newVersion);

    // Update display
    displayContent.blogPost = newContent.blogPost || '';
    displayContent.seoDescription = newContent.seoDescription || '';
    displayContent.socialPosts = newContent.socialPosts || [];
    selectedVersionId.value = newVersion.id;

    // Exit edit mode
    isEditing.value = false;
  } catch (error) {
    console.error('Failed to save edit:', error);
  } finally {
    isSaving.value = false;
  }
}

function handleRerun() {
  if (selectedVersionId.value) {
    emit('rerun', props.deliverableId, selectedVersionId.value);
  }
}

function handleRerunWithDifferentLlm() {
  console.log('handleRerunWithDifferentLlm called', {
    deliverableId: props.deliverableId,
    selectedVersionId: selectedVersionId.value,
    versionsCount: versions.value.length,
    versionIds: versions.value.map(v => v.id)
  });
  if (selectedVersionId.value) {
    const version = versions.value.find(v => v.id === selectedVersionId.value);
    if (version) {
      emit('rerunWithDifferentLlm', props.deliverableId, selectedVersionId.value, version);
    } else {
      console.warn('Cannot rerun with different LLM: version not found in store. Looking for:', selectedVersionId.value);
    }
  } else {
    console.warn('Cannot rerun with different LLM: no version selected');
  }
}

async function handleExport(format: 'markdown' | 'html' | 'json') {
  isActionLoading.value = true;
  try {
    let content = '';
    const filename = `${props.title || 'deliverable'}.${format === 'json' ? 'json' : format === 'html' ? 'html' : 'md'}`;

    if (format === 'json') {
      content = JSON.stringify(displayContent, null, 2);
    } else if (format === 'html') {
      // Simple HTML export
      content = `<!DOCTYPE html>
<html>
<head><title>${props.title || 'Deliverable'}</title></head>
<body>
<h1>${props.title || 'Deliverable'}</h1>
${displayContent.blogPost ? `<article>${displayContent.blogPost}</article>` : ''}
${displayContent.seoDescription ? `<p><strong>SEO:</strong> ${displayContent.seoDescription}</p>` : ''}
${displayContent.socialPosts?.length ? `<h2>Social Posts</h2><ul>${displayContent.socialPosts.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}
</body>
</html>`;
    } else {
      // Markdown export
      content = `# ${props.title || 'Deliverable'}\n\n`;
      if (displayContent.blogPost) {
        content += `${displayContent.blogPost}\n\n`;
      }
      if (displayContent.seoDescription) {
        content += `## SEO Description\n\n${displayContent.seoDescription}\n\n`;
      }
      if (displayContent.socialPosts?.length) {
        content += `## Social Posts\n\n${displayContent.socialPosts.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n`;
      }
    }

    // Download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export:', error);
  } finally {
    isActionLoading.value = false;
  }
}

async function handleMediaExport(action: 'download' | 'clipboard' | 'link' | 'zip') {
  isActionLoading.value = true;
  try {
    const assets = mediaAssets.value;
    if (!assets.length) {
      console.warn('No media assets to export');
      return;
    }

    switch (action) {
      case 'download': {
        // Download first/primary media asset
        const asset = assets[0];
        const response = await fetch(asset.url);
        const blob = await response.blob();
        const extension = asset.type === 'video' ? 'mp4' : 'png';
        const filename = `${props.title || 'media'}.${extension}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        break;
      }

      case 'clipboard': {
        // Copy image to clipboard (images only)
        const asset = assets[0];
        if (asset.type === 'image') {
          const response = await fetch(asset.url);
          const blob = await response.blob();
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
        }
        break;
      }

      case 'link': {
        // Copy URL to clipboard
        const asset = assets[0];
        await navigator.clipboard.writeText(asset.url);
        break;
      }

      case 'zip': {
        // Download all as ZIP - requires JSZip library
        // For now, download each individually
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const response = await fetch(asset.url);
          const blob = await response.blob();
          const extension = asset.type === 'video' ? 'mp4' : 'png';
          const filename = `${props.title || 'media'}_${i + 1}.${extension}`;

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);

          // Small delay between downloads
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        break;
      }
    }
  } catch (error) {
    console.error('Failed to export media:', error);
  } finally {
    isActionLoading.value = false;
  }
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
.deliverables-modal {
  --width: 90%;
  --max-width: 800px;
  --height: 90%;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.topic-label {
  font-size: 1.1rem;
  font-weight: 500;
}

.cost-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  background: var(--ion-color-light);
  border-radius: 4px;
}

.cost-label ion-icon {
  font-size: 0.9rem;
}

.version-section {
  margin-bottom: 1rem;
}

.evaluation-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--ion-color-light-shade);
}

.evaluation-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ion-color-medium);
}

/* Media viewer styles */
.media-viewer {
  padding: 1rem;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.media-item {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s ease;
  background: var(--ion-color-light);
}

.media-item:hover {
  transform: scale(1.02);
}

.no-media {
  text-align: center;
  padding: 2rem;
  color: var(--ion-color-medium);
}

.media-prompt {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
  font-size: 0.9rem;
}

/* Edit mode styles */
.edit-mode-container {
  padding: 1rem;
}

.edit-mode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.edit-mode-label {
  font-weight: 600;
  color: var(--ion-color-primary);
}

.edit-mode-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
