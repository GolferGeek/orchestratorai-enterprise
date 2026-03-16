<template>
  <ion-modal :is-open="isOpen" @will-dismiss="handleDismiss" class="hitl-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>Review Generated Content</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleDismiss">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="hitl-modal-content">
        <!-- Topic Info -->
        <div class="topic-section">
          <div class="topic-label">Topic</div>
          <div class="topic-value">{{ topic }}</div>
        </div>

        <!-- Generated Content Sections -->
        <div class="content-sections">
          <!-- Blog Post -->
          <div class="content-section" v-if="hasBlogPost">
            <div class="section-header">
              <ion-icon :icon="documentTextOutline" />
              <h3>Blog Post</h3>
              <ion-button
                v-if="!editMode.blogPost"
                size="small"
                fill="clear"
                @click="enableEdit('blogPost')"
              >
                <ion-icon :icon="createOutline" slot="icon-only" />
              </ion-button>
            </div>
            <div v-if="!editMode.blogPost" class="section-content">
              <!-- eslint-disable-next-line vue/no-v-html -- Content is sanitized via DOMPurify in formatContent -->
              <div class="content-preview" v-html="formatContent(editedContent.blogPost || generatedContent?.blogPost)" />
            </div>
            <div v-else class="section-edit">
              <ion-textarea
                v-model="editedContent.blogPost"
                :rows="10"
                placeholder="Edit blog post content..."
                class="edit-textarea"
              />
              <div class="edit-actions">
                <ion-button size="small" fill="clear" @click="cancelEdit('blogPost')">
                  Cancel
                </ion-button>
                <ion-button size="small" @click="saveEdit('blogPost')">
                  Save
                </ion-button>
              </div>
            </div>
          </div>

          <!-- SEO Description (only show if generated) -->
          <div class="content-section" v-if="hasSeoDescription">
            <div class="section-header">
              <ion-icon :icon="searchOutline" />
              <h3>SEO Description</h3>
              <ion-button
                v-if="!editMode.seoDescription"
                size="small"
                fill="clear"
                @click="enableEdit('seoDescription')"
              >
                <ion-icon :icon="createOutline" slot="icon-only" />
              </ion-button>
            </div>
            <div v-if="!editMode.seoDescription" class="section-content">
              <p class="content-text">{{ editedContent.seoDescription || generatedContent?.seoDescription }}</p>
            </div>
            <div v-else class="section-edit">
              <ion-textarea
                v-model="editedContent.seoDescription"
                :rows="3"
                placeholder="Edit SEO description..."
                class="edit-textarea"
              />
              <div class="edit-actions">
                <ion-button size="small" fill="clear" @click="cancelEdit('seoDescription')">
                  Cancel
                </ion-button>
                <ion-button size="small" @click="saveEdit('seoDescription')">
                  Save
                </ion-button>
              </div>
            </div>
          </div>

          <!-- Social Posts (only show if generated) -->
          <div class="content-section" v-if="hasSocialPosts">
            <div class="section-header">
              <ion-icon :icon="shareOutline" />
              <h3>Social Media Posts</h3>
              <ion-button
                v-if="!editMode.socialPosts"
                size="small"
                fill="clear"
                @click="enableEdit('socialPosts')"
              >
                <ion-icon :icon="createOutline" slot="icon-only" />
              </ion-button>
            </div>
            <div v-if="!editMode.socialPosts" class="section-content">
              <div
                v-for="(post, index) in parseSocialPosts(editedContent.socialPosts || generatedContent?.socialPosts)"
                :key="index"
                class="social-post"
              >
                <span class="post-number">{{ index + 1 }}.</span>
                <span class="post-content">{{ post }}</span>
              </div>
            </div>
            <div v-else class="section-edit">
              <ion-textarea
                v-model="editedContent.socialPosts"
                :rows="6"
                placeholder="Edit social posts (one per line)..."
                class="edit-textarea"
              />
              <div class="edit-actions">
                <ion-button size="small" fill="clear" @click="cancelEdit('socialPosts')">
                  Cancel
                </ion-button>
                <ion-button size="small" @click="saveEdit('socialPosts')">
                  Save
                </ion-button>
              </div>
            </div>
          </div>

          <!-- Info about what will happen next -->
          <div v-if="!hasSeoDescription && !hasSocialPosts" class="pending-content-info">
            <ion-icon :icon="informationCircleOutline" />
            <p>After you approve the blog post, SEO description and social posts will be generated automatically.</p>
          </div>
        </div>

        <!-- Feedback Section -->
        <div class="feedback-section">
          <ion-item lines="none">
            <ion-label position="stacked">Feedback (optional)</ion-label>
            <ion-textarea
              v-model="feedback"
              :rows="2"
              placeholder="Add any feedback or notes..."
            />
          </ion-item>
        </div>

        <!-- Action Buttons -->
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
            @click="handleEdit"
            :disabled="isSubmitting || !hasEdits"
          >
            <ion-icon :icon="createOutline" slot="start" />
            Submit Edits
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

        <!-- Loading overlay -->
        <div v-if="isSubmitting" class="loading-overlay">
          <ion-spinner />
          <span>Submitting decision...</span>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonTextarea,
  IonItem,
  IonLabel,
  IonSpinner,
} from '@ionic/vue';
import {
  closeOutline,
  documentTextOutline,
  searchOutline,
  shareOutline,
  createOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import DOMPurify from 'dompurify';
import type { HitlGeneratedContent } from '@orchestrator-ai/transport-types';

interface Props {
  isOpen: boolean;
  topic: string;
  generatedContent?: HitlGeneratedContent;
  taskId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  cancel: [];
  approve: [feedback?: string];
  edit: [editedContent: Partial<HitlGeneratedContent>, feedback?: string];
  reject: [feedback?: string];
}>();

// Local state
const feedback = ref('');
const isSubmitting = ref(false);

// Edit mode tracking for each section
const editMode = reactive({
  blogPost: false,
  seoDescription: false,
  socialPosts: false,
});

// Edited content (initialized from props)
const editedContent = reactive<{
  blogPost: string;
  seoDescription: string;
  socialPosts: string;
}>({
  blogPost: '',
  seoDescription: '',
  socialPosts: '',
});

// Original content for cancel functionality
const originalContent = reactive<{
  blogPost: string;
  seoDescription: string;
  socialPosts: string;
}>({
  blogPost: '',
  seoDescription: '',
  socialPosts: '',
});

// Watch for modal open to initialize content
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && props.generatedContent) {
    // Initialize edited content from generated content
    editedContent.blogPost = props.generatedContent.blogPost || '';
    editedContent.seoDescription = props.generatedContent.seoDescription || '';
    editedContent.socialPosts = Array.isArray(props.generatedContent.socialPosts)
      ? props.generatedContent.socialPosts.join('\n')
      : props.generatedContent.socialPosts || '';

    // Store original for cancel
    originalContent.blogPost = editedContent.blogPost;
    originalContent.seoDescription = editedContent.seoDescription;
    originalContent.socialPosts = editedContent.socialPosts;

    // Reset edit modes
    editMode.blogPost = false;
    editMode.seoDescription = false;
    editMode.socialPosts = false;

    // Reset feedback
    feedback.value = '';
  }
});

// Check if any edits have been made
const hasEdits = computed(() => {
  return (
    editedContent.blogPost !== originalContent.blogPost ||
    editedContent.seoDescription !== originalContent.seoDescription ||
    editedContent.socialPosts !== originalContent.socialPosts
  );
});

// Check which content sections exist
const hasBlogPost = computed(() => {
  return !!(props.generatedContent?.blogPost && props.generatedContent.blogPost.trim());
});

const hasSeoDescription = computed(() => {
  return !!(props.generatedContent?.seoDescription && props.generatedContent.seoDescription.trim());
});

const hasSocialPosts = computed(() => {
  const posts = props.generatedContent?.socialPosts;
  if (!posts) return false;
  if (Array.isArray(posts)) return posts.length > 0;
  return (posts as string).trim().length > 0;
});

// Helper functions
const formatContent = (content?: string): string => {
  if (!content) return '<em>No content</em>';
  // Convert markdown-style formatting to HTML and sanitize
  const html = content
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
  return DOMPurify.sanitize(html);
};

const parseSocialPosts = (posts?: string | string[]): string[] => {
  if (!posts) return [];
  if (Array.isArray(posts)) return posts;
  return posts.split('\n').filter(p => p.trim());
};

// Edit mode functions
const enableEdit = (field: 'blogPost' | 'seoDescription' | 'socialPosts') => {
  editMode[field] = true;
};

const cancelEdit = (field: 'blogPost' | 'seoDescription' | 'socialPosts') => {
  editedContent[field] = originalContent[field];
  editMode[field] = false;
};

const saveEdit = (field: 'blogPost' | 'seoDescription' | 'socialPosts') => {
  editMode[field] = false;
};

// Action handlers
const handleDismiss = () => {
  emit('cancel');
};

const handleApprove = async () => {
  isSubmitting.value = true;
  try {
    emit('approve', feedback.value || undefined);
  } finally {
    isSubmitting.value = false;
  }
};

const handleEdit = async () => {
  isSubmitting.value = true;
  try {
    const content: Partial<HitlGeneratedContent> = {};

    // Only include fields that were edited
    if (editedContent.blogPost !== originalContent.blogPost) {
      content.blogPost = editedContent.blogPost;
    }
    if (editedContent.seoDescription !== originalContent.seoDescription) {
      content.seoDescription = editedContent.seoDescription;
    }
    if (editedContent.socialPosts !== originalContent.socialPosts) {
      // Convert back to array
      content.socialPosts = editedContent.socialPosts.split('\n').filter(p => p.trim());
    }

    emit('edit', content, feedback.value || undefined);
  } finally {
    isSubmitting.value = false;
  }
};

const handleReject = async () => {
  isSubmitting.value = true;
  try {
    emit('reject', feedback.value || undefined);
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<style scoped>
.hitl-modal-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: relative;
  min-height: 100%;
}

/* Topic Section */
.topic-section {
  background: var(--ion-color-step-50);
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-primary);
}

.topic-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ion-color-medium);
  margin-bottom: 0.25rem;
}

.topic-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ion-color-dark);
}

/* Content Sections */
.content-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.content-section {
  background: var(--ion-color-step-50);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--ion-color-step-100);
  border-bottom: 1px solid var(--ion-color-step-150);
}

.section-header ion-icon {
  font-size: 1.25rem;
  color: var(--ion-color-primary);
}

.section-header h3 {
  flex: 1;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.section-header ion-button {
  margin: 0;
}

.section-content {
  padding: 1rem;
  max-height: 300px;
  overflow-y: auto;
}

.content-preview {
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--ion-color-dark);
}

.content-preview p {
  margin: 0 0 1rem 0;
}

.content-preview p:last-child {
  margin-bottom: 0;
}

.content-text {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ion-color-dark);
  margin: 0;
}

/* Social posts */
.social-post {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--ion-color-step-100);
}

/* Pending content info */
.pending-content-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--ion-color-warning-tint);
  border-radius: 8px;
  border-left: 4px solid var(--ion-color-warning);
}

.pending-content-info ion-icon {
  font-size: 1.5rem;
  color: var(--ion-color-warning-shade);
  flex-shrink: 0;
}

.pending-content-info p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ion-color-dark);
}

.social-post:last-child {
  border-bottom: none;
}

.post-number {
  font-weight: 600;
  color: var(--ion-color-medium);
  min-width: 1.5rem;
}

.post-content {
  flex: 1;
  font-size: 0.9rem;
  line-height: 1.4;
}

/* Edit mode */
.section-edit {
  padding: 1rem;
}

.edit-textarea {
  --background: var(--ion-background-color);
  --border-radius: 8px;
  border: 1px solid var(--ion-color-step-200);
  margin-bottom: 0.5rem;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Feedback Section */
.feedback-section {
  background: var(--ion-color-step-50);
  border-radius: 8px;
  padding: 0.5rem;
}

.feedback-section ion-textarea {
  --background: var(--ion-background-color);
  --border-radius: 8px;
  border: 1px solid var(--ion-color-step-200);
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-color-step-100);
  margin-top: auto;
}

.action-buttons ion-button {
  flex: 1;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(var(--ion-background-color-rgb), 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 100;
}

.loading-overlay span {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .action-buttons {
    flex-direction: column;
  }

  .action-buttons ion-button {
    flex: none;
  }
}

/* Modal sizing */
.hitl-modal {
  --width: 90%;
  --max-width: 800px;
  --height: 90%;
  --max-height: 800px;
}
</style>
