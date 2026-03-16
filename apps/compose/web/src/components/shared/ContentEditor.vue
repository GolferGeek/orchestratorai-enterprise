<template>
  <div class="content-editor">
    <ion-segment v-model="activeTab" class="editor-tabs">
      <ion-segment-button value="blog">
        <ion-label>Blog Post</ion-label>
      </ion-segment-button>
      <ion-segment-button value="seo">
        <ion-label>SEO</ion-label>
      </ion-segment-button>
      <ion-segment-button value="social">
        <ion-label>Social</ion-label>
      </ion-segment-button>
    </ion-segment>

    <div class="editor-panel">
      <!-- Blog Post Tab -->
      <div v-if="activeTab === 'blog'" class="editor-section">
        <ion-textarea
          :value="blogPost"
          @ion-input="handleBlogPostChange"
          :disabled="disabled"
          :rows="12"
          placeholder="Enter blog post content (supports Markdown)..."
          class="editor-textarea"
        />
        <div class="editor-hint">Supports Markdown formatting</div>
      </div>

      <!-- SEO Tab -->
      <div v-if="activeTab === 'seo'" class="editor-section">
        <ion-textarea
          :value="seoDescription"
          @ion-input="handleSeoChange"
          :disabled="disabled"
          :rows="3"
          :maxlength="160"
          placeholder="Enter SEO meta description..."
          class="editor-textarea"
        />
        <div class="editor-hint">
          {{ seoDescription?.length || 0 }} / 160 characters (recommended limit)
        </div>
      </div>

      <!-- Social Tab -->
      <div v-if="activeTab === 'social'" class="editor-section">
        <ion-textarea
          :value="socialPosts"
          @ion-input="handleSocialChange"
          :disabled="disabled"
          :rows="6"
          placeholder="Enter social media posts (one per line)..."
          class="editor-textarea"
        />
        <div class="editor-hint">One post per line</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { IonSegment, IonSegmentButton, IonLabel, IonTextarea } from '@ionic/vue';
import type { ContentEditorProps, ContentEditorEmits } from './types';

const props = withDefaults(defineProps<ContentEditorProps>(), {
  initialTab: 'blog',
  disabled: false,
});

const emit = defineEmits<ContentEditorEmits>();

const activeTab = ref(props.initialTab);

// Set initial tab based on provided content
watch(
  () => [props.blogPost, props.seoDescription, props.socialPosts],
  () => {
    if (!props.blogPost && props.seoDescription) {
      activeTab.value = 'seo';
    } else if (!props.blogPost && !props.seoDescription && props.socialPosts) {
      activeTab.value = 'social';
    }
  },
  { immediate: true }
);

const handleBlogPostChange = (event: CustomEvent) => {
  const value = (event.target as HTMLIonTextareaElement).value || '';
  emit('update:blogPost', value);
  emit('change');
};

const handleSeoChange = (event: CustomEvent) => {
  const value = (event.target as HTMLIonTextareaElement).value || '';
  emit('update:seoDescription', value);
  emit('change');
};

const handleSocialChange = (event: CustomEvent) => {
  const value = (event.target as HTMLIonTextareaElement).value || '';
  emit('update:socialPosts', value);
  emit('change');
};
</script>

<style scoped>
.content-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-tabs {
  margin-bottom: 1rem;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.editor-textarea {
  flex: 1;
  --background: var(--ion-color-step-50);
  --border-radius: 8px;
  --padding-start: 12px;
  --padding-end: 12px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 0.9rem;
}

.editor-hint {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
</style>
