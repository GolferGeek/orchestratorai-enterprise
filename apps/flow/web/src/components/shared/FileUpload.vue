<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'upload', file: File): void;
}>();

const dragOver = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

function handleDrop(e: DragEvent) {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length) emit('upload', files[0]);
}

function handleChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files?.length) emit('upload', files[0]);
}

function openPicker() {
  inputRef.value?.click();
}
</script>

<template>
  <div
    class="card"
    style="border-style:dashed;text-align:center;cursor:pointer;transition:all 0.15s;"
    :style="{ borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-border)' }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="handleDrop"
    @click="openPicker"
  >
    <input ref="inputRef" type="file" style="display:none;" @change="handleChange" />
    <div class="empty-state" style="padding:24px 16px;">
      <span style="font-size:28px;">⬆</span>
      <div class="font-medium">Drop file here or click to upload</div>
      <div class="text-xs text-muted">Any file type supported</div>
    </div>
  </div>
</template>
