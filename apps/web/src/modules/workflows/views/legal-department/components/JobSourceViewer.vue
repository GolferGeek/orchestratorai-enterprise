<template>
  <div class="source-viewer">
    <!-- Original file rendered inline when available -->
    <template v-if="originalFileUrl">
      <iframe
        v-if="isPdf"
        :src="originalFileUrl"
        :title="originalFileName ?? 'Original document'"
        class="pdf-frame"
      />
      <img
        v-else-if="isImage"
        :src="originalFileUrl"
        :alt="originalFileName ?? 'Original image'"
        class="img-original"
      />
      <pre v-else-if="isInlineText" class="text-original">{{ extractedText }}</pre>
      <a
        v-else
        :href="originalFileUrl"
        :download="originalFileName ?? 'document'"
        class="download-link"
      >
        Download {{ originalFileName ?? 'original file' }}
      </a>
    </template>

    <!-- Fallback: jobs without a stored original file (pre-Phase-5 or
         JSON-body enqueues) render the extracted text with a small badge. -->
    <template v-else>
      <pre class="text-original">{{ extractedText }}</pre>
      <div class="hint">
        <ion-icon :icon="informationCircleOutline" /> Original file not stored —
        showing extracted text only.
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { informationCircleOutline } from 'ionicons/icons';

const props = defineProps<{
  originalFileUrl?: string;
  originalFileName?: string;
  mimeType?: string;
  extractedText: string;
}>();

const isPdf = computed(
  () =>
    props.mimeType === 'application/pdf' ||
    props.originalFileName?.toLowerCase().endsWith('.pdf'),
);

const isImage = computed(() => {
  if (props.mimeType?.startsWith('image/')) return true;
  const lower = (props.originalFileName ?? '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(lower);
});

const isInlineText = computed(() => {
  if (props.mimeType?.startsWith('text/')) return true;
  if (props.mimeType === 'application/json') return true;
  const lower = (props.originalFileName ?? '').toLowerCase();
  return /\.(txt|md|json|csv|log)$/.test(lower);
});
</script>

<style scoped>
.source-viewer {
  width: 100%;
}

.pdf-frame {
  width: 100%;
  height: 600px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
  background: white;
}

.img-original {
  max-width: 100%;
  max-height: 600px;
  display: block;
  border: 1px solid var(--ion-color-step-150);
  border-radius: 6px;
}

.text-original {
  background: var(--ion-color-step-50);
  padding: 12px 14px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-size: 0.85em;
  max-height: 480px;
  overflow-y: auto;
  margin: 0;
}

.download-link {
  display: inline-block;
  padding: 10px 18px;
  background: var(--ion-color-primary);
  color: white;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
}

.hint {
  font-size: 0.78em;
  color: var(--ion-color-medium);
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
