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
          <ion-button fill="clear" @click="cancelEdit">Cancel</ion-button>
          <ion-button fill="solid" color="primary" @click="save">
            Save
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
          <a
            v-if="editVideo"
            :href="editVideo"
            target="_blank"
            rel="noopener"
            class="video-link"
          >
            <ion-button fill="outline" color="secondary">
              Watch Video
            </ion-button>
          </a>
          <div v-html="renderMarkdown(editMarkdown)" />
        </div>
      </template>

      <!-- Read mode -->
      <div v-else class="brief-content">
        <h1 v-if="title">{{ title }}</h1>
        <a
          v-if="video"
          :href="video"
          target="_blank"
          rel="noopener"
          class="video-link"
        >
          <ion-button fill="outline" color="secondary">
            Watch Video
          </ion-button>
        </a>
        <div v-html="renderMarkdown(markdown)" />
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
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

const loading = ref(false);
const error = ref('');
const title = ref('');
const video = ref('');
const markdown = ref('');

const editing = ref(false);
const editTab = ref<'edit' | 'preview'>('edit');
const editTitle = ref('');
const editVideo = ref('');
const editMarkdown = ref('');

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '<br><br>');
}

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
      error.value = res.status === 404 ? 'Brief not found.' : 'Failed to load brief.';
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

async function save() {
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
      error.value = 'Failed to save brief.';
      return;
    }
    title.value = editTitle.value;
    video.value = editVideo.value;
    markdown.value = editMarkdown.value;
    editing.value = false;
  } catch {
    error.value = 'Failed to save brief.';
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

.video-link {
  display: inline-block;
  margin-bottom: 16px;
  text-decoration: none;
}

.edit-form ion-item {
  --padding-start: 0;
  margin-bottom: 8px;
}
</style>
