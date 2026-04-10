<template>
  <div class="brief-landing">
    <div v-if="loading" class="center">Loading...</div>
    <div v-else-if="error" class="center error">{{ error }}</div>
    <div v-else class="brief-content">
      <h1 v-if="title">{{ title }}</h1>
      <div v-if="video && embedUrl" class="video-embed">
        <iframe
          :src="embedUrl"
          frameborder="0"
          allowfullscreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          :title="title || 'Video'"
        />
      </div>
      <a
        v-else-if="video"
        :href="video"
        target="_blank"
        rel="noopener"
        class="video-link"
      >
        <ion-button fill="outline" color="secondary">
          Watch Video
        </ion-button>
      </a>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="renderedMarkdown" />
      <ion-button
        color="primary"
        size="large"
        class="cta-button"
        @click="$emit('cta')"
      >
        {{ ctaLabel }}
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonButton } from '@ionic/vue';
import { parseVideoEmbed, renderMarkdown } from '../utils/briefUtils';

const props = withDefaults(
  defineProps<{
    agentSlug?: string;
    capabilitySlug: string;
    ctaLabel: string;
  }>(),
  { agentSlug: 'legal-department' },
);

defineEmits<{ cta: [] }>();

const loading = ref(false);
const error = ref('');
const title = ref('');
const video = ref('');
const markdown = ref('');

const embedUrl = computed(() => video.value ? parseVideoEmbed(video.value) : null);
const renderedMarkdown = computed(() => markdown.value ? renderMarkdown(markdown.value) : '');

async function fetchBrief() {
  loading.value = true;
  error.value = '';
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(
      `/agents/${props.agentSlug}/brief/${props.capabilitySlug}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      error.value = 'Brief not available.';
      return;
    }
    const data = await res.json();
    title.value = data.title ?? '';
    video.value = data.video ?? '';
    markdown.value = data.markdown ?? '';
  } catch {
    error.value = 'Failed to load brief.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchBrief();
});
</script>

<style scoped>
.brief-landing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
}

.center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--ion-color-medium);
}

.center.error {
  color: var(--ion-color-danger);
}

.brief-content {
  max-width: 720px;
  width: 100%;
}

.brief-content h1 {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0 0 16px;
  text-align: center;
}

.video-embed {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 20px;
  border-radius: 8px;
  overflow: hidden;
}

.video-embed iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.video-link {
  display: inline-block;
  margin-bottom: 16px;
  text-decoration: none;
}

.cta-button {
  display: block;
  margin: 24px auto 0;
}

/* Rendered markdown styles */
.brief-content :deep(h2) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 20px 0 8px;
}

.brief-content :deep(h3) {
  font-size: 1.1em;
  font-weight: 600;
  margin: 16px 0 6px;
}

.brief-content :deep(p) {
  margin: 0 0 12px;
  line-height: 1.6;
}

.brief-content :deep(ul),
.brief-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.brief-content :deep(li) {
  margin-bottom: 4px;
  line-height: 1.5;
}

.brief-content :deep(a) {
  color: var(--ion-color-primary);
  text-decoration: underline;
}

.brief-content :deep(strong) {
  font-weight: 600;
}
</style>
