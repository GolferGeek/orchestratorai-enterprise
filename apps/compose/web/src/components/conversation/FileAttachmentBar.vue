<template>
  <div v-if="attachments.length > 0" class="attachment-bar">
    <div class="attachment-list">
      <div
        v-for="(attachment, index) in attachments"
        :key="index"
        class="attachment-item"
      >
        <!-- Image thumbnail -->
        <div v-if="attachment.preview" class="attachment-thumbnail">
          <img :src="attachment.preview" :alt="attachment.filename" class="thumbnail-img" />
          <button
            class="remove-btn"
            :aria-label="`Remove ${attachment.filename}`"
            @click="emit('remove', index)"
          >
            <ion-icon :icon="closeCircle" class="remove-icon" />
          </button>
        </div>

        <!-- Document chip -->
        <div v-else class="attachment-chip">
          <ion-icon :icon="documentOutline" class="doc-icon" />
          <span class="attachment-name">{{ truncateFilename(attachment.filename) }}</span>
          <button
            class="remove-btn remove-btn--chip"
            :aria-label="`Remove ${attachment.filename}`"
            @click="emit('remove', index)"
          >
            <ion-icon :icon="closeCircle" class="remove-icon remove-icon--chip" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon } from '@ionic/vue';
import { closeCircle, documentOutline } from 'ionicons/icons';
import type { PendingAttachment } from '@/composables/useFileAttachments';

defineProps<{
  attachments: PendingAttachment[];
}>();

const emit = defineEmits<{
  remove: [index: number];
}>();

function truncateFilename(name: string, maxLength = 20): string {
  if (name.length <= maxLength) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 6) {
    // Keep extension visible
    const extPart = name.slice(ext);
    const basePart = name.slice(0, maxLength - extPart.length - 1);
    return `${basePart}…${extPart}`;
  }
  return `${name.slice(0, maxLength - 1)}…`;
}
</script>

<style scoped>
.attachment-bar {
  padding: 6px 16px 0;
  background: var(--ion-background-color);
  border-top: 1px solid var(--ion-color-step-100);
}

.attachment-list {
  display: flex;
  flex-direction: row;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  /* Hide scrollbar visually but keep functionality */
  scrollbar-width: none;
}

.attachment-list::-webkit-scrollbar {
  display: none;
}

/* ── Image thumbnail ── */

.attachment-thumbnail {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: visible;
}

.thumbnail-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--ion-color-step-200);
  display: block;
}

/* ── Document chip ── */

.attachment-chip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--ion-color-step-100);
  border: 1px solid var(--ion-color-step-200);
  border-radius: 16px;
  padding: 4px 8px 4px 6px;
  max-width: 160px;
}

.doc-icon {
  font-size: 14px;
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

.attachment-name {
  font-size: 0.75rem;
  color: var(--ion-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* ── Remove button (shared) ── */

.remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.remove-btn--chip {
  position: static;
  flex-shrink: 0;
}

.remove-icon {
  font-size: 18px;
  color: var(--ion-color-medium);
  background: var(--ion-background-color);
  border-radius: 50%;
}

.remove-icon--chip {
  font-size: 14px;
  background: transparent;
}

.remove-btn:hover .remove-icon {
  color: var(--ion-color-danger);
}
</style>
