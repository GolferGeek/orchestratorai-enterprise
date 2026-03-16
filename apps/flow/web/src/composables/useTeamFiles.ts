/**
 * useTeamFiles composable
 *
 * Wraps the files store with team-aware loading and file tree operations.
 * Watches teamId to reload when it changes.
 */
import { ref, computed, watch } from 'vue';
import type { Ref } from 'vue';
import { useFilesStore } from '@/stores/files.store';
import type { TeamFileResponse, CreateTeamFileDto, UpdateTeamFileDto } from '@/types/flow';

export interface FileTreeNode {
  file: TeamFileResponse;
  children: FileTreeNode[];
}

function buildTree(files: TeamFileResponse[]): FileTreeNode[] {
  const map = new Map<string, FileTreeNode>();
  const roots: FileTreeNode[] = [];

  files.forEach((f) => map.set(f.id, { file: f, children: [] }));

  files.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.file.isFolder !== b.file.isFolder) return a.file.isFolder ? -1 : 1;
      return a.file.name.localeCompare(b.file.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export function useTeamFiles(teamId: Ref<string | null | undefined>) {
  const store = useFilesStore();
  const selectedFile = ref<TeamFileResponse | null>(null);

  const fileTree = computed(() => buildTree(store.files));

  async function load() {
    if (!teamId.value) return;
    await store.loadFiles(teamId.value);
  }

  watch(
    teamId,
    (id) => {
      if (id) load();
    },
    { immediate: true },
  );

  async function selectFile(fileId: string): Promise<void> {
    if (!teamId.value) return;
    await store.selectFile(teamId.value, fileId);
    selectedFile.value = store.selectedFile;
  }

  async function createFile(dto: CreateTeamFileDto): Promise<TeamFileResponse | null> {
    if (!teamId.value) return null;
    return store.createFile(teamId.value, dto);
  }

  async function updateFile(fileId: string, dto: UpdateTeamFileDto): Promise<void> {
    if (!teamId.value) return;
    await store.updateFile(teamId.value, fileId, dto);
    if (selectedFile.value?.id === fileId) {
      selectedFile.value = store.selectedFile;
    }
  }

  async function deleteFile(fileId: string): Promise<void> {
    if (!teamId.value) return;
    // Collect all descendant ids for optimistic removal
    const idsToRemove = new Set<string>();
    const collect = (parentId: string) => {
      idsToRemove.add(parentId);
      store.files.filter((f) => f.parentId === parentId).forEach((f) => collect(f.id));
    };
    collect(fileId);

    await store.deleteFile(teamId.value, fileId);
    if (selectedFile.value && idsToRemove.has(selectedFile.value.id)) {
      selectedFile.value = null;
    }
  }

  async function loadFileContent(fileId: string): Promise<TeamFileResponse> {
    if (!teamId.value) throw new Error('No team selected');
    await store.selectFile(teamId.value, fileId);
    return store.selectedFile!;
  }

  function childrenOf(parentId: string): TeamFileResponse[] {
    return store.childrenOf(parentId);
  }

  return {
    files: computed(() => store.files),
    selectedFile,
    folders: computed(() => store.folders),
    rootItems: computed(() => store.rootItems),
    fileTree,
    loading: computed(() => store.loading),
    childrenOf,
    selectFile,
    createFile,
    updateFile,
    deleteFile,
    loadFileContent,
  };
}
