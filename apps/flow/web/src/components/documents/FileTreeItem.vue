<template>
  <div>
    <!-- Item row -->
    <div
      :class="[
        'flex items-center gap-1.5 py-1 px-2 rounded-sm cursor-pointer text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors select-none',
        isSelected ? 'bg-gray-200 dark:bg-gray-700 font-medium' : '',
      ]"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="handleClick"
      @contextmenu.prevent="showContextMenu = true"
    >
      <!-- Folder chevron -->
      <template v-if="node.file.isFolder">
        <svg
          v-if="isOpen"
          class="w-3.5 h-3.5 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
        <svg
          v-else
          class="w-3.5 h-3.5 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <!-- Folder icon -->
        <svg
          class="w-4 h-4 shrink-0 text-amber-500"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            v-if="isOpen"
            d="M2.25 6a3 3 0 013-3h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 0012.371 5H18.75a3 3 0 013 3v1.5H2.25V6zm0 3v9a3 3 0 003 3h13.5a3 3 0 003-3V9H2.25z"
          />
          <path
            v-else
            d="M19.5 21a3 3 0 003-3V9a3 3 0 00-3-3h-5.379a1.5 1.5 0 01-1.06-.44L11.94 4.44A1.5 1.5 0 0010.878 4H4.5a3 3 0 00-3 3v12a3 3 0 003 3h15z"
          />
        </svg>
      </template>
      <template v-else>
        <span class="w-3.5 shrink-0" />
        <svg
          class="w-4 h-4 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </template>

      <!-- Name or rename input -->
      <input
        v-if="isRenaming"
        ref="renameInputRef"
        v-model="renameValue"
        class="flex-1 text-sm h-5 px-1 border border-blue-400 rounded outline-none bg-white dark:bg-gray-900"
        @click.stop
        @blur="submitRename"
        @keydown.enter="submitRename"
        @keydown.escape="cancelRename"
      />
      <span v-else class="truncate flex-1">{{ node.file.name }}</span>
    </div>

    <!-- Context menu -->
    <div
      v-if="showContextMenu"
      class="fixed inset-0 z-40"
      @click="showContextMenu = false"
      @contextmenu.prevent="showContextMenu = false"
    />
    <div
      v-if="showContextMenu"
      class="absolute z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 min-w-[140px]"
      :style="contextMenuStyle"
      @click.stop
    >
      <template v-if="node.file.isFolder">
        <button
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          @click="onCreateInFolder(node.file.id, false); showContextMenu = false"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          New File
        </button>
        <button
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          @click="onCreateInFolder(node.file.id, true); showContextMenu = false"
        >
          <svg class="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.5 21a3 3 0 003-3V9a3 3 0 00-3-3h-5.379a1.5 1.5 0 01-1.06-.44L11.94 4.44A1.5 1.5 0 0010.878 4H4.5a3 3 0 00-3 3v12a3 3 0 003 3h15z" />
          </svg>
          New Folder
        </button>
      </template>
      <button
        class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
        @click="startRename"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Rename
      </button>
      <button
        class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-red-600"
        @click="onDelete(node.file.id, node.file.name); showContextMenu = false"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete
      </button>
    </div>

    <!-- Children (if folder and open) -->
    <div v-if="node.file.isFolder && isOpen">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.file.id"
        :node="child"
        :depth="depth + 1"
        :selected-file-id="selectedFileId"
        @select-file="$emit('selectFile', $event)"
        @create-in-folder="$emit('createInFolder', $event)"
        @rename="$emit('rename', $event)"
        @delete="$emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import type { FileTreeNode } from '@/composables/useTeamFiles';

interface Props {
  node: FileTreeNode;
  depth: number;
  selectedFileId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  selectFile: [fileId: string];
  createInFolder: [{ parentId: string; isFolder: boolean }];
  rename: [{ fileId: string; newName: string }];
  delete: [{ fileId: string; name: string }];
}>();

// Convenience wrappers for template
function onCreateInFolder(parentId: string, isFolder: boolean) {
  emit('createInFolder', { parentId, isFolder });
}

function onDelete(fileId: string, name: string) {
  emit('delete', { fileId, name });
}

const isOpen = ref(false);
const isRenaming = ref(false);
const renameValue = ref(props.node.file.name);
const renameInputRef = ref<HTMLInputElement | null>(null);
const showContextMenu = ref(false);
const contextMenuStyle = ref('');

const isSelected = computed(() => !props.node.file.isFolder && props.node.file.id === props.selectedFileId);

function handleClick() {
  if (props.node.file.isFolder) {
    isOpen.value = !isOpen.value;
  } else {
    emit('selectFile', props.node.file.id);
  }
}

async function startRename() {
  showContextMenu.value = false;
  renameValue.value = props.node.file.name;
  isRenaming.value = true;
  await nextTick();
  renameInputRef.value?.focus();
  renameInputRef.value?.select();
}

function submitRename() {
  const trimmed = renameValue.value.trim();
  if (trimmed && trimmed !== props.node.file.name) {
    emit('rename', { fileId: props.node.file.id, newName: trimmed });
  }
  isRenaming.value = false;
}

function cancelRename() {
  renameValue.value = props.node.file.name;
  isRenaming.value = false;
}
</script>
