<template>
  <div class="content-viewer">
    <ion-segment v-model="activeTab" class="content-tabs">
      <ion-segment-button v-if="blogPost" value="blog">
        <ion-label>Blog Post</ion-label>
      </ion-segment-button>
      <ion-segment-button v-if="seoDescription" value="seo">
        <ion-label>SEO</ion-label>
      </ion-segment-button>
      <ion-segment-button v-if="socialPosts?.length" value="social">
        <ion-label>Social</ion-label>
      </ion-segment-button>
    </ion-segment>

    <div class="content-panel" :class="{ 'is-loading': loading }">
      <ion-spinner v-if="loading" name="crescent" />

      <template v-else>
        <!-- Blog Post Tab -->
        <div v-if="activeTab === 'blog'" class="markdown-content">
          <!-- eslint-disable-next-line vue/no-v-html -- Sanitized via DOMPurify -->
          <div v-html="renderedBlogPost" />
        </div>

        <!-- SEO Tab -->
        <div v-if="activeTab === 'seo'" class="seo-content">
          <h4>SEO Description</h4>
          <p>{{ seoDescription }}</p>
          <div class="char-count">
            {{ seoDescription?.length || 0 }} / 160 characters
          </div>
        </div>

        <!-- Social Tab -->
        <div v-if="activeTab === 'social'" class="social-content">
          <div
            v-for="(post, index) in socialPosts"
            :key="index"
            class="social-post"
          >
            <div class="post-header">Post {{ index + 1 }}</div>
            <div class="post-content">{{ formatSocialPost(post) }}</div>
            <div class="char-count">{{ formatSocialPost(post).length }} characters</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonSegment, IonSegmentButton, IonLabel, IonSpinner } from '@ionic/vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ContentViewerProps } from './types';

const props = withDefaults(defineProps<ContentViewerProps>(), {
  initialTab: 'blog',
  loading: false,
});

const activeTab = ref(props.initialTab);

// Set initial tab based on available content
watch(
  () => [props.blogPost, props.seoDescription, props.socialPosts],
  () => {
    if (!props.blogPost && props.seoDescription) {
      activeTab.value = 'seo';
    } else if (!props.blogPost && !props.seoDescription && props.socialPosts?.length) {
      activeTab.value = 'social';
    }
  },
  { immediate: true }
);

const renderedBlogPost = computed(() => {
  if (!props.blogPost) return '';
  const html = marked(props.blogPost) as string;
  return DOMPurify.sanitize(html);
});

/**
 * Format a social post for display
 * Handles both string posts and object posts (with platform, content, hashtags, etc.)
 */
function formatSocialPost(post: unknown): string {
  if (typeof post === 'string') {
    return post;
  }
  if (typeof post === 'object' && post !== null) {
    const postObj = post as Record<string, unknown>;
    // Try to extract meaningful content from the object
    // Common fields: content, text, message, post, body
    const content = postObj.content ?? postObj.text ?? postObj.message ?? postObj.post ?? postObj.body;
    if (typeof content === 'string') {
      // If there's a platform, prefix it
      const platform = postObj.platform ?? postObj.network;
      const hashtags = postObj.hashtags;
      let result = '';
      if (typeof platform === 'string') {
        result += `[${platform}]\n`;
      }
      result += content;
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        result += '\n\n' + hashtags.join(' ');
      } else if (typeof hashtags === 'string') {
        result += '\n\n' + hashtags;
      }
      return result;
    }
    // Fallback: serialize the object nicely
    return JSON.stringify(post, null, 2);
  }
  return String(post);
}
</script>

<style scoped>
.content-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-tabs {
  margin-bottom: 1rem;
}

.content-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: var(--ion-background-color);
  border-radius: 8px;
  border: 1px solid var(--ion-color-step-100);
}

.content-panel.is-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.markdown-content {
  line-height: 1.6;
}

.markdown-content :deep(h1) {
  font-size: 1.75rem;
  margin-bottom: 1rem;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
}

.seo-content h4 {
  margin-bottom: 0.5rem;
  color: var(--ion-color-medium);
}

.char-count {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-top: 0.5rem;
}

.social-post {
  background: var(--ion-color-step-50);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.post-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ion-color-primary);
}

.post-content {
  white-space: pre-wrap;
}
</style>
