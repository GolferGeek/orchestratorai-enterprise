<template>
  <div class="p-6 h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button
          class="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="$emit('back')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 class="text-xl font-semibold">{{ collection.name }}</h2>
          <p class="text-sm text-gray-500">{{ documents.length }} documents</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button
          class="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          :disabled="uploading"
          @click="fileInputRef?.click()"
        >
          <svg v-if="uploading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload
        </button>
        <button
          class="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          :disabled="documents.length === 0"
          @click="$emit('openChat')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Ask AI
        </button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept=".pdf,.txt,.md,.docx"
      class="hidden"
      @change="handleFileInputChange"
    />

    <!-- Error -->
    <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded text-sm">
      {{ error }}
    </div>

    <!-- Upload message -->
    <div v-if="uploadMessage" class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-sm">
      {{ uploadMessage }}
    </div>

    <!-- Content -->
    <div
      class="flex-1 overflow-auto"
      @drop.prevent="handleDrop"
      @dragover.prevent
    >
      <div v-if="loading" class="flex items-center justify-center py-12">
        <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <div
        v-else-if="documents.length === 0"
        class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center py-12 px-4"
      >
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-gray-500 mb-2">No documents yet. Upload PDF, TXT, MD, or DOCX files.</p>
        <p class="text-xs text-gray-400">Drag and drop files here or click Upload</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm truncate">{{ doc.filename }}</p>
            <div class="flex gap-3 text-xs text-gray-500">
              <span>{{ doc.fileType.toUpperCase() }}</span>
              <span>{{ formatFileSize(doc.fileSize) }}</span>
              <span>{{ doc.chunkCount }} chunks</span>
              <span>{{ doc.status }}</span>
            </div>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 rounded flex-shrink-0 transition-colors"
            @click="handleDelete(doc.id)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getDocuments, uploadDocument, deleteDocument } from '@/services/notebook-api.service';
import type { RagDocument } from '@/services/notebook-api.service';

interface Props {
  collection: { id: string; name: string };
}

const props = defineProps<Props>();

defineEmits<{
  back: [];
  openChat: [];
}>();

const documents = ref<RagDocument[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const uploading = ref(false);
const uploadMessage = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    documents.value = await getDocuments(props.collection.id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load documents';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function handleUpload(files: FileList | null) {
  if (!files?.length) return;
  uploading.value = true;
  uploadMessage.value = null;
  error.value = null;
  try {
    for (const file of Array.from(files)) {
      const result = await uploadDocument(props.collection.id, file);
      uploadMessage.value = `${result.filename}: ${result.message}`;
    }
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to upload document';
  } finally {
    uploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function handleFileInputChange(e: Event) {
  handleUpload((e.target as HTMLInputElement).files);
}

function handleDrop(e: DragEvent) {
  handleUpload(e.dataTransfer?.files ?? null);
}

async function handleDelete(docId: string) {
  if (!window.confirm('Delete this document?')) return;
  error.value = null;
  try {
    await deleteDocument(props.collection.id, docId);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete document';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>
