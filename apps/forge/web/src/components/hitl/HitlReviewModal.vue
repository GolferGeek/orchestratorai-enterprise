<template>
  <ion-modal
    :is-open="isOpen"
    :can-dismiss="!isSubmitting"
    @did-dismiss="handleClose"
    class="hitl-review-modal"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title>Review Content</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleClose" :disabled="isSubmitting">
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
        <span class="topic-label">{{ topic }}</span>
      </div>

      <!-- Version History (if multiple versions) -->
      <VersionSelector
        v-if="versions.length > 1"
        :versions="versions"
        :selected-version-id="selectedVersionId"
        :loading="isLoadingVersions"
        @select="handleVersionSelect"
        class="version-section"
      />

      <!-- Content Viewer/Editor Toggle -->
      <ion-segment v-model="viewMode" class="view-mode-toggle">
        <ion-segment-button value="view">
          <ion-label>View</ion-label>
        </ion-segment-button>
        <ion-segment-button value="edit">
          <ion-label>Edit</ion-label>
        </ion-segment-button>
      </ion-segment>

      <!-- Content Display -->
      <ContentViewer
        v-if="viewMode === 'view'"
        :blog-post="displayContent.blogPost"
        :seo-description="displayContent.seoDescription"
        :social-posts="displayContent.socialPosts"
        :loading="isLoading"
      />

      <!-- Content Editor -->
      <ContentEditor
        v-else
        v-model:blog-post="editedContent.blogPost"
        v-model:seo-description="editedContent.seoDescription"
        v-model:social-posts="editedContent.socialPosts"
        :disabled="isSubmitting"
        @change="hasEdits = true"
      />

      <!-- Feedback Input (for regenerate) -->
      <FeedbackInput
        v-model="feedback"
        label="Feedback for AI"
        placeholder="Describe what changes you'd like..."
        :required="false"
        :disabled="isSubmitting"
        class="feedback-section"
      />

      <!-- Evaluation Section -->
      <div class="evaluation-section" v-if="taskId">
        <h3>Rate this agent's work</h3>
        <TaskRating :task-id="taskId" />
      </div>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <div class="action-buttons">
          <ion-button
            fill="outline"
            color="danger"
            @click="handleReject"
            :disabled="isSubmitting"
          >
            <ion-icon :icon="closeCircleOutline" slot="start" />
            Reject
          </ion-button>

          <ion-button
            fill="outline"
            color="warning"
            @click="handleRegenerate"
            :disabled="isSubmitting || !feedback.trim()"
            title="Add feedback above to regenerate"
          >
            <ion-icon :icon="refreshOutline" slot="start" />
            Regenerate
          </ion-button>

          <ion-button
            v-if="hasEdits"
            fill="outline"
            color="secondary"
            @click="handleReplace"
            :disabled="isSubmitting"
          >
            <ion-icon :icon="createOutline" slot="start" />
            Use My Edits
          </ion-button>

          <ion-button
            fill="solid"
            color="success"
            @click="handleApprove"
            :disabled="isSubmitting"
          >
            <ion-icon :icon="checkmarkCircleOutline" slot="start" />
            Approve
          </ion-button>
        </div>
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
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/vue';
import {
  closeOutline,
  closeCircleOutline,
  refreshOutline,
  createOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import ContentViewer from '@/components/shared/ContentViewer.vue';
import ContentEditor from '@/components/shared/ContentEditor.vue';
import VersionSelector from '@/components/shared/VersionSelector.vue';
import VersionBadge from '@/components/shared/VersionBadge.vue';
import FeedbackInput from '@/components/shared/FeedbackInput.vue';
import TaskRating from '@/components/TaskRating.vue';
import { a2aOrchestrator } from '@/services/agent2agent/orchestrator';
import { getDeliverablesService } from '@/services/deliverablesService.impl';
import { useHitlPendingStore } from '@/stores/hitlPendingStore';
import type { HitlGeneratedContent } from '@orchestrator-ai/transport-types';
import type { DeliverableVersion } from '@/services/deliverablesService';
import type { VersionCreationType } from '@/components/shared/types';
import type { A2AResult } from '@/services/agent2agent/orchestrator/types';

/**
 * Format a social post to a string
 * Handles both string posts and object posts (with platform, content, hashtags, etc.)
 */
function formatSocialPostToString(post: unknown): string {
  if (typeof post === 'string') {
    return post;
  }
  if (typeof post === 'object' && post !== null) {
    const postObj = post as Record<string, unknown>;
    // Try to extract meaningful content from the object
    const content = postObj.content ?? postObj.text ?? postObj.message ?? postObj.post ?? postObj.body;
    if (typeof content === 'string') {
      const platform = postObj.platform ?? postObj.network;
      const hashtags = postObj.hashtags;
      let result = '';
      if (typeof platform === 'string') {
        result += `[${platform}] `;
      }
      result += content;
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        result += ' ' + hashtags.join(' ');
      } else if (typeof hashtags === 'string') {
        result += ' ' + hashtags;
      }
      return result;
    }
    // Fallback: serialize the object
    return JSON.stringify(post);
  }
  return String(post);
}

/**
 * Convert socialPosts array (which may contain objects) to newline-separated string
 */
function socialPostsToString(posts: unknown[] | undefined): string {
  if (!posts || !Array.isArray(posts)) return '';
  return posts.map(formatSocialPostToString).join('\n');
}

interface Props {
  isOpen: boolean;
  organizationSlug: string;
  agentSlug: string;
  taskId: string;
  conversationId: string;
  deliverableId?: string;
  topic?: string;
  initialContent?: HitlGeneratedContent;
  currentVersionNumber?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  // Simplified per PRD: orchestrator already updated stores, just inform parent of result type
  completed: [deliverableId: string | undefined];
  regenerated: [content: HitlGeneratedContent];
}>();

const hitlPendingStore = useHitlPendingStore();

// State
const isSubmitting = ref(false);
const isLoading = ref(false);
const isLoadingVersions = ref(false);
const viewMode = ref<'view' | 'edit'>('view');
const feedback = ref('');
const hasEdits = ref(false);
const versions = ref<DeliverableVersion[]>([]);
const selectedVersionId = ref<string | undefined>();

// Content state
const displayContent = reactive<HitlGeneratedContent>({
  blogPost: '',
  seoDescription: '',
  socialPosts: [],
});

const editedContent = reactive<{
  blogPost: string;
  seoDescription: string;
  socialPosts: string;
}>({
  blogPost: '',
  seoDescription: '',
  socialPosts: '',
});

// Computed
const displayVersionNumber = computed(() => {
  const current = versions.value.find((v) => v.isCurrentVersion);
  return current?.versionNumber ?? props.currentVersionNumber ?? 1;
});

const currentCreationType = computed<VersionCreationType>(() => {
  const current = versions.value.find((v) => v.isCurrentVersion);
  return (current?.createdByType as VersionCreationType) || 'ai_response';
});

// Initialize content when modal opens
watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      // Set initial content
      if (props.initialContent) {
        displayContent.blogPost = props.initialContent.blogPost || '';
        displayContent.seoDescription = props.initialContent.seoDescription || '';
        displayContent.socialPosts = props.initialContent.socialPosts || [];

        editedContent.blogPost = displayContent.blogPost || '';
        editedContent.seoDescription = displayContent.seoDescription || '';
        editedContent.socialPosts = socialPostsToString(displayContent.socialPosts);
      }

      // Load versions if deliverable exists
      if (props.deliverableId) {
        await loadVersions();
      }

      // Reset state
      viewMode.value = 'view';
      feedback.value = '';
      hasEdits.value = false;
    }
  }
);

// Load version history
async function loadVersions() {
  if (!props.deliverableId) return;

  isLoadingVersions.value = true;
  try {
    const history = await getDeliverablesService().getVersionHistory(props.deliverableId);
    versions.value = history;
    const current = history.find((v) => v.isCurrentVersion);
    selectedVersionId.value = current?.id;
  } catch (error) {
    console.error('Failed to load versions:', error);
  } finally {
    isLoadingVersions.value = false;
  }
}

// Handle version selection
async function handleVersionSelect(version: DeliverableVersion) {
  selectedVersionId.value = version.id;

  // Parse version content
  if (version.content) {
    try {
      const content = JSON.parse(version.content);
      displayContent.blogPost = content.blogPost || '';
      displayContent.seoDescription = content.seoDescription || '';
      displayContent.socialPosts = content.socialPosts || [];

      editedContent.blogPost = displayContent.blogPost || '';
      editedContent.seoDescription = displayContent.seoDescription || '';
      editedContent.socialPosts = socialPostsToString(displayContent.socialPosts);
    } catch (e) {
      console.error('Failed to parse version content:', e);
    }
  }
}

// Action handlers
async function handleApprove() {
  await submitDecision('approve');
}

async function handleReject() {
  await submitDecision('reject');
}

async function handleRegenerate() {
  if (!feedback.value.trim()) return;
  await submitDecision('regenerate', { feedback: feedback.value });
}

async function handleReplace() {
  const content: HitlGeneratedContent = {
    blogPost: editedContent.blogPost,
    seoDescription: editedContent.seoDescription,
    socialPosts: editedContent.socialPosts.split('\n').filter((p) => p.trim()),
  };
  await submitDecision('replace', { content });
}

async function submitDecision(
  decision: 'approve' | 'reject' | 'regenerate' | 'replace',
  options?: { feedback?: string; content?: HitlGeneratedContent }
) {
  isSubmitting.value = true;

  try {
    // Map decision to orchestrator trigger
    // IMPORTANT: Pass the original taskId from props - this is the LangGraph thread_id
    // that was checkpointed when HITL was first triggered
    let result: A2AResult;
    switch (decision) {
      case 'approve':
        result = await a2aOrchestrator.execute('hitl.approve', { originalTaskId: props.taskId });
        break;
      case 'reject':
        result = await a2aOrchestrator.execute('hitl.reject', { originalTaskId: props.taskId });
        break;
      case 'regenerate':
        result = await a2aOrchestrator.execute('hitl.regenerate', {
          feedback: options?.feedback,
          originalTaskId: props.taskId,
        });
        break;
      case 'replace':
        result = await a2aOrchestrator.execute('hitl.replace', {
          content: options?.content,
          originalTaskId: props.taskId,
        });
        break;
    }

    // Handle error result
    if (result.type === 'error') {
      console.error('HITL decision failed:', result.error);
      return;
    }

    // Handle based on result type - per PRD, orchestrator already updated stores
    if (result.type === 'hitl_waiting') {
      // Still waiting (e.g., after regenerate) - update content in modal
      displayContent.blogPost = result.generatedContent.blogPost || '';
      displayContent.seoDescription = result.generatedContent.seoDescription || '';
      displayContent.socialPosts = result.generatedContent.socialPosts || [];

      editedContent.blogPost = displayContent.blogPost;
      editedContent.seoDescription = displayContent.seoDescription;
      editedContent.socialPosts = socialPostsToString(displayContent.socialPosts);

      feedback.value = '';
      hasEdits.value = false;
      viewMode.value = 'view';

      // Reload versions
      if (props.deliverableId) {
        await loadVersions();
      }

      // Emit simplified event - orchestrator already handles stores
      emit('regenerated', result.generatedContent);
    } else if (result.type === 'deliverable' || result.type === 'success') {
      // Completed - remove from pending list and close modal
      hitlPendingStore.removePendingItem(props.taskId);

      // Emit simplified event - orchestrator already added deliverable to store and message to conversation
      const deliverableId = result.type === 'deliverable' ? result.deliverable.id : undefined;
      emit('completed', deliverableId);
      handleClose();
    }
  } catch (error) {
    console.error('Failed to submit decision:', error);
  } finally {
    isSubmitting.value = false;
  }
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
.hitl-review-modal {
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

.version-section {
  margin-bottom: 1rem;
}

.view-mode-toggle {
  margin-bottom: 1rem;
}

.feedback-section {
  margin-top: 1rem;
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

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem;
}

@media (max-width: 600px) {
  .action-buttons {
    flex-wrap: wrap;
  }

  .action-buttons ion-button {
    flex: 1 1 45%;
  }
}
</style>
