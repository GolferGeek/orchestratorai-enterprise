<template>
  <!-- Loading state -->
  <div v-if="loading" class="flex-1 flex items-center justify-center">
    <span class="text-sm text-gray-500 animate-pulse">Loading documents...</span>
  </div>

  <div v-else class="flex h-full overflow-hidden">
    <!-- Sidebar -->
    <div class="w-64 min-w-[180px] max-w-[320px] border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      <DocumentsSidebar
        :file-tree="fileTree"
        :selected-file-id="selectedFileId"
        @select-file="handleSelectFile"
        @create-file="handleCreateFile"
        @rename="handleRename"
        @delete="handleDeleteRequest"
      />
    </div>

    <!-- Editor -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <DocumentEditor
        :file="editorFile"
        :content="editorContent"
        :is-dirty="isDirty"
        :saving="saving"
        @content-change="handleContentChange"
        @save="handleSave"
      />
    </div>

    <!-- Delete Confirmation Dialog -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="deleteTarget = null"
    >
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 class="text-lg font-semibold mb-2">Delete "{{ deleteTarget.name }}"?</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          This action cannot be undone. This will permanently delete this item and all of its contents.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="deleteTarget = null"
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            @click="handleDeleteConfirm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import { useTeamFiles } from '@/composables/useTeamFiles';
import type { TeamFileResponse, CreateTeamFileDto } from '@/types/flow';
import DocumentsSidebar from './DocumentsSidebar.vue';
import DocumentEditor from './DocumentEditor.vue';

interface Props {
  teamId: string | null | undefined;
}

const props = defineProps<Props>();

const teamIdRef = computed(() => props.teamId) as Ref<string | null | undefined>;

const { fileTree, loading, createFile, updateFile, deleteFile, loadFileContent } = useTeamFiles(teamIdRef);

const selectedFileId = ref<string | null>(null);
const selectedFileMeta = ref<{ id: string; name: string; fileType: string } | null>(null);
const editorContent = ref('');
const savedContent = ref('');
const isDirty = ref(false);
const saving = ref(false);
const deleteTarget = ref<{ id: string; name: string } | null>(null);

const editorFile = computed<TeamFileResponse | null>(() => {
  if (!selectedFileMeta.value) return null;
  return {
    id: selectedFileMeta.value.id,
    teamId: props.teamId ?? '',
    parentId: null,
    name: selectedFileMeta.value.name,
    isFolder: false,
    content: editorContent.value,
    fileType: selectedFileMeta.value.fileType,
    sizeBytes: 0,
    createdByUserId: null,
    createdAt: '',
    updatedAt: '',
  };
});

async function handleSelectFile(fileId: string) {
  const file = await loadFileContent(fileId);
  selectedFileId.value = fileId;
  selectedFileMeta.value = { id: file.id, name: file.name, fileType: file.fileType };
  editorContent.value = file.content ?? '';
  savedContent.value = file.content ?? '';
  isDirty.value = false;
}

function handleContentChange(value: string) {
  editorContent.value = value;
  isDirty.value = value !== savedContent.value;
}

async function handleSave() {
  if (!selectedFileId.value || !isDirty.value) return;
  saving.value = true;
  await updateFile(selectedFileId.value, { content: editorContent.value });
  savedContent.value = editorContent.value;
  isDirty.value = false;
  saving.value = false;
}

async function handleCreateFile(dto: CreateTeamFileDto) {
  const created = await createFile(dto);
  if (created && !dto.isFolder) {
    selectedFileId.value = created.id;
    selectedFileMeta.value = { id: created.id, name: created.name, fileType: created.fileType };
    editorContent.value = created.content ?? '';
    savedContent.value = created.content ?? '';
    isDirty.value = false;
  }
}

async function handleRename({ fileId, newName }: { fileId: string; newName: string }) {
  await updateFile(fileId, { name: newName });
  if (selectedFileMeta.value?.id === fileId) {
    selectedFileMeta.value = { ...selectedFileMeta.value, name: newName };
  }
}

function handleDeleteRequest({ fileId, name }: { fileId: string; name: string }) {
  deleteTarget.value = { id: fileId, name };
}

async function handleDeleteConfirm() {
  if (!deleteTarget.value) return;
  if (selectedFileId.value === deleteTarget.value.id) {
    selectedFileId.value = null;
    selectedFileMeta.value = null;
    editorContent.value = '';
    savedContent.value = '';
    isDirty.value = false;
  }
  await deleteFile(deleteTarget.value.id);
  deleteTarget.value = null;
}
</script>
