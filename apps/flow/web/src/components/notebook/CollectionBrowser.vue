<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-semibold">Knowledge Collections</h2>
        <p class="text-sm text-gray-500">Upload documents and ask AI questions about them</p>
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        @click="showCreate = true"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Collection
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <!-- Empty state -->
    <div v-else-if="collections.length === 0" class="border border-gray-200 dark:border-gray-700 rounded-lg text-center py-12 px-4">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <p class="text-gray-500">No collections yet. Create one to start uploading documents.</p>
    </div>

    <!-- Grid -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="c in collections"
        :key="c.id"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
        @click="$emit('select', { id: c.id, name: c.name })"
      >
        <div class="flex items-start justify-between mb-1">
          <h3 class="font-medium text-base">{{ c.name }}</h3>
          <button
            class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 rounded transition-colors"
            @click.stop="handleDelete(c.id)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
        <p v-if="c.description" class="text-sm text-gray-500 line-clamp-2 mb-2">{{ c.description }}</p>
        <div class="flex gap-4 text-xs text-gray-500">
          <span>{{ c.documentCount ?? 0 }} docs</span>
          <span>{{ c.totalChunks ?? 0 }} chunks</span>
          <span>{{ new Date(c.createdAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <div
      v-if="showCreate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showCreate = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 class="text-lg font-semibold mb-4">New Collection</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input
              ref="createNameInputRef"
              v-model="newName"
              class="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white dark:bg-gray-800"
              placeholder="My Knowledge Base"
              @keydown.enter="handleCreate"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              v-model="newDescription"
              class="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white dark:bg-gray-800 resize-none"
              placeholder="What this collection is about..."
              rows="3"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button
            class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="showCreate = false"
          >
            Cancel
          </button>
          <button
            class="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            :disabled="!newName.trim() || creating"
            @click="handleCreate"
          >
            <svg v-if="creating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { getCollections, createCollection, deleteCollection } from '@/services/notebook-api.service';
import type { Collection } from '@/services/notebook-api.service';

defineEmits<{
  select: [collection: { id: string; name: string }];
}>();

const collections = ref<Collection[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showCreate = ref(false);
const newName = ref('');
const newDescription = ref('');
const creating = ref(false);
const createNameInputRef = ref<HTMLInputElement | null>(null);

watch(showCreate, async (val) => {
  if (val) {
    await nextTick();
    createNameInputRef.value?.focus();
  }
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    collections.value = await getCollections();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load collections';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function handleCreate() {
  if (!newName.value.trim()) return;
  creating.value = true;
  error.value = null;
  try {
    await createCollection(newName.value.trim(), newDescription.value.trim() || undefined);
    showCreate.value = false;
    newName.value = '';
    newDescription.value = '';
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create collection';
  } finally {
    creating.value = false;
  }
}

async function handleDelete(id: string) {
  if (!window.confirm('Delete this collection and all its documents?')) return;
  error.value = null;
  try {
    await deleteCollection(id);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete collection';
  }
}
</script>
