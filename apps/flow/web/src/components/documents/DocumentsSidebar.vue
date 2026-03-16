<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-700">
      <button
        class="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="New File"
        @click="openNewFileDialog"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        File
      </button>
      <button
        class="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="New Folder"
        @click="openNewFolderDialog"
      >
        <svg class="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.5 21a3 3 0 003-3V9a3 3 0 00-3-3h-5.379a1.5 1.5 0 01-1.06-.44L11.94 4.44A1.5 1.5 0 0010.878 4H4.5a3 3 0 00-3 3v12a3 3 0 003 3h15z" />
        </svg>
        Folder
      </button>
      <button
        class="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Upload File"
        @click="fileInputRef?.click()"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Upload
      </button>
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        accept=".txt,.md,.markdown,.ts,.tsx,.js,.jsx,.py,.rs,.go,.json,.yaml,.yml,.toml,.css,.html,.xml,.sh,.sql,.env,.cfg,.ini,.csv"
        @change="handleFileUpload"
      />
    </div>

    <!-- File Tree -->
    <div class="flex-1 overflow-y-auto py-1">
      <div v-if="fileTree.length === 0" class="text-xs text-gray-500 text-center py-8 px-4">
        No documents yet. Create a file or folder to get started.
      </div>
      <FileTreeItem
        v-for="node in fileTree"
        :key="node.file.id"
        :node="node"
        :depth="0"
        :selected-file-id="selectedFileId"
        @select-file="$emit('selectFile', $event)"
        @create-in-folder="handleCreateInFolder"
        @rename="handleRename"
        @delete="handleDelete"
      />
    </div>

    <!-- Create Dialog -->
    <div
      v-if="dialogMode !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="dialogMode = null"
    >
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 class="text-lg font-semibold mb-4">
          {{ dialogMode === 'new-folder' ? 'New Folder' : 'New File' }}
        </h2>
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">Name</label>
            <input
              ref="dialogInputRef"
              v-model="newName"
              class="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white dark:bg-gray-800"
              :placeholder="dialogMode === 'new-folder' ? 'Folder name' : 'file-name.md'"
              @keydown.enter="handleCreateSubmit"
            />
          </div>
          <div v-if="dialogMode === 'new-file'" class="flex flex-col gap-1.5">
            <label class="text-sm font-medium">File Type</label>
            <select
              v-model="newFileType"
              class="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500 bg-white dark:bg-gray-800"
            >
              <option value="markdown">Markdown</option>
              <option value="plaintext">Plain Text</option>
              <option value="code">Code</option>
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button
            class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="dialogMode = null"
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            :disabled="!newName.trim()"
            @click="handleCreateSubmit"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import type { FileTreeNode } from '@/composables/useTeamFiles';
import type { CreateTeamFileDto } from '@/types/flow';
import FileTreeItem from './FileTreeItem.vue';

interface Props {
  fileTree: FileTreeNode[];
  selectedFileId: string | null;
}

defineProps<Props>();

const emit = defineEmits<{
  selectFile: [fileId: string];
  createFile: [dto: CreateTeamFileDto];
  rename: [{ fileId: string; newName: string }];
  delete: [{ fileId: string; name: string }];
}>();

type DialogMode = 'new-file' | 'new-folder' | null;

const fileInputRef = ref<HTMLInputElement | null>(null);
const dialogInputRef = ref<HTMLInputElement | null>(null);
const dialogMode = ref<DialogMode>(null);
const newName = ref('');
const newFileType = ref('markdown');
const createParentId = ref<string | undefined>(undefined);

async function openNewFileDialog() {
  createParentId.value = undefined;
  dialogMode.value = 'new-file';
  newName.value = '';
  await nextTick();
  dialogInputRef.value?.focus();
}

async function openNewFolderDialog() {
  createParentId.value = undefined;
  dialogMode.value = 'new-folder';
  newName.value = '';
  await nextTick();
  dialogInputRef.value?.focus();
}

async function handleCreateInFolder({ parentId, isFolder }: { parentId: string; isFolder: boolean }) {
  createParentId.value = parentId;
  dialogMode.value = isFolder ? 'new-folder' : 'new-file';
  newName.value = '';
  await nextTick();
  dialogInputRef.value?.focus();
}

function handleCreateSubmit() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;

  if (dialogMode.value === 'new-folder') {
    emit('createFile', {
      name: trimmed,
      isFolder: true,
      parentId: createParentId.value,
    });
  } else {
    emit('createFile', {
      name: trimmed,
      isFolder: false,
      fileType: newFileType.value,
      content: '',
      parentId: createParentId.value,
    });
  }

  dialogMode.value = null;
  newName.value = '';
  createParentId.value = undefined;
}

function inferFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'plaintext';
  return 'code';
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    emit('createFile', {
      name: file.name,
      isFolder: false,
      content,
      fileType: inferFileType(file.name),
      parentId: createParentId.value,
    });
  };
  reader.readAsText(file);
  input.value = '';
}

function handleRename({ fileId, newName: name }: { fileId: string; newName: string }) {
  emit('rename', { fileId, newName: name });
}

function handleDelete({ fileId, name }: { fileId: string; name: string }) {
  emit('delete', { fileId, name });
}
</script>
