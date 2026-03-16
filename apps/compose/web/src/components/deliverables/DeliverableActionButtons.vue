<template>
  <div class="deliverable-action-buttons">
    <ion-button
      fill="outline"
      color="medium"
      @click="handleExport"
      :disabled="isLoading"
    >
      <ion-icon :icon="downloadOutline" slot="start" />
      {{ isMediaType ? 'Download' : 'Export' }}
    </ion-button>

    <ion-button
      v-if="!isMediaType"
      fill="outline"
      color="secondary"
      @click="emit('edit')"
      :disabled="isLoading"
    >
      <ion-icon :icon="createOutline" slot="start" />
      Edit
    </ion-button>

    <ion-button
      fill="outline"
      color="secondary"
      @click="emit('rerun')"
      :disabled="isLoading"
    >
      <ion-icon :icon="refreshOutline" slot="start" />
      Regenerate
    </ion-button>

    <ion-button
      fill="solid"
      color="tertiary"
      @click="emit('rerunWithDifferentLlm')"
      :disabled="isLoading"
    >
      <ion-icon :icon="swapHorizontalOutline" slot="start" />
      {{ isMediaType ? 'Try Different Model' : 'Rerun with Different LLM' }}
    </ion-button>
  </div>

  <!-- Text Export Format Popover -->
  <ion-popover
    :is-open="showExportPopover && !isMediaType"
    @did-dismiss="showExportPopover = false"
    :event="popoverEvent"
  >
    <ion-content class="ion-padding">
      <ion-list lines="none">
        <ion-item button @click="doExport('markdown')">
          <ion-icon :icon="documentTextOutline" slot="start" />
          <ion-label>Markdown (.md)</ion-label>
        </ion-item>
        <ion-item button @click="doExport('html')">
          <ion-icon :icon="codeOutline" slot="start" />
          <ion-label>HTML (.html)</ion-label>
        </ion-item>
        <ion-item button @click="doExport('json')">
          <ion-icon :icon="codeSlashOutline" slot="start" />
          <ion-label>JSON (.json)</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>

  <!-- Media Export Format Popover -->
  <ion-popover
    :is-open="showExportPopover && isMediaType"
    @did-dismiss="showExportPopover = false"
    :event="popoverEvent"
  >
    <ion-content class="ion-padding">
      <ion-list lines="none">
        <ion-item button @click="doMediaExport('download')">
          <ion-icon :icon="downloadOutline" slot="start" />
          <ion-label>Download {{ deliverableType === 'video' ? 'Video' : 'Image' }}</ion-label>
        </ion-item>
        <ion-item v-if="deliverableType === 'image'" button @click="doMediaExport('clipboard')">
          <ion-icon :icon="copyOutline" slot="start" />
          <ion-label>Copy to Clipboard</ion-label>
        </ion-item>
        <ion-item button @click="doMediaExport('link')">
          <ion-icon :icon="linkOutline" slot="start" />
          <ion-label>Copy Link</ion-label>
        </ion-item>
        <ion-item v-if="hasMultipleMedia" button @click="doMediaExport('zip')">
          <ion-icon :icon="archiveOutline" slot="start" />
          <ion-label>Download All (ZIP)</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonButton,
  IonIcon,
  IonPopover,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/vue';
import {
  downloadOutline,
  createOutline,
  refreshOutline,
  swapHorizontalOutline,
  documentTextOutline,
  codeOutline,
  codeSlashOutline,
  copyOutline,
  linkOutline,
  archiveOutline,
} from 'ionicons/icons';

interface Props {
  deliverableId?: string;
  currentVersionId?: string;
  isLoading?: boolean;
  deliverableType?: string;
  mediaCount?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  edit: [];
  rerun: [];
  rerunWithDifferentLlm: [];
  export: [format: 'markdown' | 'html' | 'json'];
  mediaExport: [action: 'download' | 'clipboard' | 'link' | 'zip'];
}>();

const showExportPopover = ref(false);
const popoverEvent = ref<Event | null>(null);

const isMediaType = computed(() => {
  return props.deliverableType === 'image' || props.deliverableType === 'video';
});

const hasMultipleMedia = computed(() => {
  return (props.mediaCount ?? 0) > 1;
});

function handleExport(event: Event) {
  popoverEvent.value = event;
  showExportPopover.value = true;
}

function doExport(format: 'markdown' | 'html' | 'json') {
  showExportPopover.value = false;
  emit('export', format);
}

function doMediaExport(action: 'download' | 'clipboard' | 'link' | 'zip') {
  showExportPopover.value = false;
  emit('mediaExport', action);
}
</script>

<style scoped>
.deliverable-action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem;
}

@media (max-width: 600px) {
  .deliverable-action-buttons {
    flex-wrap: wrap;
  }

  .deliverable-action-buttons ion-button {
    flex: 1 1 45%;
  }
}
</style>
