<template>
  <ion-modal
    :is-open="open"
    class="brief-modal"
    @didDismiss="$emit('close')"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title || 'Workflow Brief' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="canEdit && !editing"
            fill="clear"
            @click="startEdit"
          >
            Edit
          </ion-button>
          <ion-button fill="clear" @click="$emit('close')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar v-if="editing">
        <ion-segment v-model="editTab">
          <ion-segment-button value="edit">Edit</ion-segment-button>
          <ion-segment-button value="preview">Preview</ion-segment-button>
        </ion-segment>
        <ion-buttons slot="end">
          <ion-button fill="clear" :disabled="saving" @click="cancelEdit">Cancel</ion-button>
          <ion-button fill="solid" color="primary" :disabled="saving" @click="save">
            <ion-spinner v-if="saving" name="crescent" style="width: 16px; height: 16px; margin-right: 6px;" />
            {{ saving ? 'Saving...' : 'Save' }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div v-if="loading" class="center">Loading...</div>
      <div v-else-if="error" class="center error">{{ error }}</div>

      <!-- Edit mode -->
      <template v-else-if="editing">
        <div v-if="editTab === 'edit'" class="edit-form">
          <ion-item>
            <ion-input
              v-model="editTitle"
              label="Title"
              label-placement="stacked"
              placeholder="Brief title"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="editVideo"
              label="Video URL"
              label-placement="stacked"
              placeholder="https://loom.com/..."
            />
          </ion-item>
          <ion-item>
            <ion-textarea
              v-model="editMarkdown"
              label="Content (Markdown)"
              label-placement="stacked"
              :auto-grow="true"
              :rows="20"
            />
          </ion-item>
        </div>
        <div v-else class="brief-content">
          <h1 v-if="editTitle">{{ editTitle }}</h1>
          <div v-if="editVideo && parseVideoEmbed(editVideo)" class="video-embed">
            <iframe
              :src="parseVideoEmbed(editVideo)!"
              frameborder="0"
              allowfullscreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              :title="editTitle || 'Video'"
            />
          </div>
          <a
            v-else-if="editVideo"
            :href="editVideo"
            target="_blank"
            rel="noopener"
            class="video-link"
          >
            <ion-button fill="outline" color="secondary">
              Watch Video
            </ion-button>
          </a>
          <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown sanitizes through DOMPurify (see briefUtils.ts) -->
          <div v-html="renderMarkdown(editMarkdown)" />
        </div>
      </template>

      <!-- Read mode -->
      <div v-else class="brief-content">
        <h1 v-if="title">{{ title }}</h1>
        <div v-if="video && parseVideoEmbed(video)" class="video-embed">
          <iframe
            :src="parseVideoEmbed(video)!"
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
        <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown sanitizes through DOMPurify (see briefUtils.ts) -->
        <div v-html="renderMarkdown(markdown)" />
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { parseVideoEmbed, renderMarkdown } from '../utils/briefUtils';
import { useBrief } from '../composables/useBrief';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonItem,
  IonInput,
  IonTextarea,
  IonSpinner,
  toastController,
} from '@ionic/vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    agentSlug?: string;
    capabilitySlug: string;
    canEdit?: boolean;
  }>(),
  { agentSlug: 'legal-department', canEdit: false },
);

defineEmits<{ close: [] }>();

const { loading, error, title, video, markdown, fetchBrief } = useBrief(
  props.agentSlug,
  props.capabilitySlug,
);

const editing = ref(false);
const saving = ref(false);
const editTab = ref<'edit' | 'preview'>('edit');
const editTitle = ref('');
const editVideo = ref('');
const editMarkdown = ref('');

function startEdit() {
  editTitle.value = title.value;
  editVideo.value = video.value;
  editMarkdown.value = markdown.value;
  editTab.value = 'edit';
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
}

async function showToast(message: string, color: 'success' | 'danger') {
  const toast = await toastController.create({ message, color, duration: 2500, position: 'bottom' });
  await toast.present();
}

async function save() {
  saving.value = true;
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(
      `/agents/${props.agentSlug}/brief/${props.capabilitySlug}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle.value,
          video: editVideo.value,
          markdown: editMarkdown.value,
        }),
      },
    );
    if (!res.ok) {
      await showToast('Failed to save brief.', 'danger');
      return;
    }
    title.value = editTitle.value;
    video.value = editVideo.value;
    markdown.value = editMarkdown.value;
    editing.value = false;
    await showToast('Brief saved.', 'success');
  } catch {
    await showToast('Failed to save brief.', 'danger');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      editing.value = false;
      fetchBrief();
    }
  },
);
</script>

<style scoped>
ion-modal.brief-modal {
  --height: 90%;
  --width: 90%;
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
  max-width: 800px;
  margin: 0 auto;
}

.brief-content h1 {
  margin-bottom: 8px;
}

.video-embed {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 16 / 9;
  margin-bottom: 16px;
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

.edit-form ion-item {
  --padding-start: 0;
  margin-bottom: 8px;
}

/* Rendered markdown styles */
.brief-content :deep(h1) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0 0 12px;
}

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

.brief-content :deep(code) {
  background: var(--ion-color-step-100);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.brief-content :deep(pre) {
  background: var(--ion-color-step-100);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0 0 12px;
}

.brief-content :deep(pre code) {
  background: none;
  padding: 0;
}

.brief-content :deep(blockquote) {
  border-left: 3px solid var(--ion-color-primary);
  margin: 0 0 12px;
  padding: 8px 16px;
  color: var(--ion-color-medium-shade);
}

.brief-content :deep(strong) {
  font-weight: 600;
}

.brief-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--ion-color-step-200);
  margin: 16px 0;
}
</style>
