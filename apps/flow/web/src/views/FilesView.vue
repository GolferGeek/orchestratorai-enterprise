<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFilesStore } from '@/stores/files.store';
import { useTeamsStore } from '@/stores/teams.store';
import FileUpload from '@/components/shared/FileUpload.vue';
import type { TeamFileResponse } from '@/types/flow';

const filesStore = useFilesStore();
const teamsStore = useTeamsStore();

const currentParent = ref<string | null>(null);
const showUpload = ref(false);
const showNewFolder = ref(false);
const newFolderName = ref('');
const editingFile = ref<TeamFileResponse | null>(null);
const editContent = ref('');
const breadcrumbs = ref<{ id: string | null; name: string }[]>([{ id: null, name: 'Files' }]);

onMounted(async () => {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await filesStore.loadFiles(teamId);
});

const currentItems = computed(() =>
  currentParent.value
    ? filesStore.childrenOf(currentParent.value)
    : filesStore.rootItems,
);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileIcon(file: TeamFileResponse): string {
  if (file.isFolder) return '📁';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['md', 'txt'].includes(ext ?? '')) return '📝';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '')) return '🖼';
  if (['ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'go'].includes(ext ?? '')) return '💻';
  return '📎';
}

function openFolder(item: TeamFileResponse) {
  if (!item.isFolder) return;
  currentParent.value = item.id;
  breadcrumbs.value.push({ id: item.id, name: item.name });
}

function navigateTo(idx: number) {
  const crumb = breadcrumbs.value[idx];
  currentParent.value = crumb.id;
  breadcrumbs.value = breadcrumbs.value.slice(0, idx + 1);
}

async function createFolder() {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !newFolderName.value.trim()) return;
  await filesStore.createFile(teamId, {
    name: newFolderName.value.trim(),
    isFolder: true,
    parentId: currentParent.value ?? undefined,
  });
  newFolderName.value = '';
  showNewFolder.value = false;
}

async function handleUpload(file: File) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  const content = await file.text().catch(() => '');
  await filesStore.createFile(teamId, {
    name: file.name,
    isFolder: false,
    parentId: currentParent.value ?? undefined,
    content: content || undefined,
    fileType: file.type,
  });
  showUpload.value = false;
}

async function handleDelete(fileId: string) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await filesStore.deleteFile(teamId, fileId);
}

function openFile(file: TeamFileResponse) {
  if (file.isFolder) {
    openFolder(file);
    return;
  }
  editingFile.value = file;
  editContent.value = file.content ?? '';
}

async function saveFile() {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !editingFile.value) return;
  await filesStore.updateFile(teamId, editingFile.value.id, { content: editContent.value });
  editingFile.value = null;
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Files</h1>
          <!-- Breadcrumbs -->
          <div class="flex items-center gap-1 text-sm text-muted mt-1">
            <button
              v-for="(crumb, idx) in breadcrumbs"
              :key="idx"
              class="btn btn-ghost btn-sm"
              style="padding:2px 4px;font-size:13px;"
              :style="{ color: idx === breadcrumbs.length - 1 ? 'var(--color-text)' : 'var(--color-text-muted)' }"
              @click="navigateTo(idx)"
            >
              {{ crumb.name }}
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" @click="showNewFolder = !showNewFolder">+ Folder</button>
          <button class="btn btn-primary btn-sm" @click="showUpload = !showUpload">↑ Upload</button>
        </div>
      </div>
    </div>

    <div class="page-body">
      <!-- New folder form -->
      <div v-if="showNewFolder" class="flex gap-2 mb-4">
        <input
          v-model="newFolderName"
          class="form-input"
          style="flex:1;"
          placeholder="Folder name"
          @keydown.enter="createFolder"
        />
        <button class="btn btn-primary btn-sm" :disabled="!newFolderName.trim()" @click="createFolder">Create</button>
        <button class="btn btn-ghost btn-sm" @click="showNewFolder = false">Cancel</button>
      </div>

      <!-- Upload -->
      <div v-if="showUpload" class="mb-4">
        <FileUpload @upload="handleUpload" />
      </div>

      <!-- Loading -->
      <div v-if="filesStore.loading" class="empty-state">
        <div class="spinner" />
        <span>Loading files...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="currentItems.length === 0" class="empty-state">
        <span style="font-size:28px;">⬡</span>
        <div class="font-medium">No files here</div>
        <div class="text-sm">Upload files or create folders</div>
      </div>

      <!-- File table -->
      <div v-else class="table-wrap card" style="padding:0;overflow:hidden;">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Modified</th>
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in currentItems"
              :key="item.id"
              style="cursor:pointer;"
              @click="openFile(item)"
            >
              <td>
                <div class="flex items-center gap-2">
                  <span style="font-size:16px;">{{ getFileIcon(item) }}</span>
                  <span class="font-medium">{{ item.name }}</span>
                </div>
              </td>
              <td class="text-muted">{{ item.isFolder ? 'Folder' : item.fileType || 'File' }}</td>
              <td class="text-muted">{{ item.isFolder ? '—' : formatSize(item.sizeBytes) }}</td>
              <td class="text-muted">{{ formatDate(item.updatedAt) }}</td>
              <td>
                <button
                  class="btn btn-ghost btn-sm"
                  style="color:var(--color-text-muted);"
                  @click.stop="handleDelete(item.id)"
                >
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- File editor modal -->
    <div v-if="editingFile" class="modal-overlay" @click.self="editingFile = null">
      <div class="modal" style="width:700px;max-width:95vw;">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span style="font-size:18px;">{{ getFileIcon(editingFile) }}</span>
            <h2 class="font-semibold">{{ editingFile.name }}</h2>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm" @click="saveFile">Save</button>
            <button class="btn btn-ghost btn-icon" @click="editingFile = null">✕</button>
          </div>
        </div>
        <textarea
          v-model="editContent"
          class="form-textarea"
          style="width:100%;height:400px;font-family:monospace;font-size:13px;"
          :placeholder="editingFile.isFolder ? '' : 'File content...'"
        />
      </div>
    </div>
  </div>
</template>
