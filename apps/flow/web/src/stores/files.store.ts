/**
 * Files Store
 *
 * State layer for team file management.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { TeamFileResponse, CreateTeamFileDto, UpdateTeamFileDto } from '@/types/flow';

export const useFilesStore = defineStore('files', () => {
  const files = ref<TeamFileResponse[]>([]);
  const selectedFile = ref<TeamFileResponse | null>(null);
  const loading = ref(false);

  const folders = computed(() => files.value.filter((f) => f.isFolder));
  const rootItems = computed(() => files.value.filter((f) => !f.parentId));

  function childrenOf(parentId: string): TeamFileResponse[] {
    return files.value.filter((f) => f.parentId === parentId);
  }

  async function loadFiles(teamId: string) {
    loading.value = true;
    try {
      files.value = await flowApiService.getTeamFiles(teamId);
    } finally {
      loading.value = false;
    }
  }

  async function selectFile(teamId: string, fileId: string) {
    const found = files.value.find((f) => f.id === fileId);
    if (found) {
      selectedFile.value = found;
    } else {
      selectedFile.value = await flowApiService.getTeamFile(teamId, fileId);
    }
  }

  async function createFile(teamId: string, dto: CreateTeamFileDto): Promise<TeamFileResponse> {
    const file = await flowApiService.createTeamFile(teamId, dto);
    files.value.push(file);
    return file;
  }

  async function updateFile(teamId: string, fileId: string, dto: UpdateTeamFileDto): Promise<void> {
    const updated = await flowApiService.updateTeamFile(teamId, fileId, dto);
    const idx = files.value.findIndex((f) => f.id === fileId);
    if (idx !== -1) files.value[idx] = updated;
    if (selectedFile.value?.id === fileId) selectedFile.value = updated;
  }

  async function deleteFile(teamId: string, fileId: string): Promise<void> {
    await flowApiService.deleteTeamFile(teamId, fileId);
    files.value = files.value.filter((f) => f.id !== fileId);
    if (selectedFile.value?.id === fileId) selectedFile.value = null;
  }

  return {
    files,
    selectedFile,
    loading,
    folders,
    rootItems,
    childrenOf,
    loadFiles,
    selectFile,
    createFile,
    updateFile,
    deleteFile,
  };
});
