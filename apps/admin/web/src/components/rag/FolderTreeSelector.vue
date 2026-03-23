<template>
  <div class="folder-tree-selector">
    <div class="tree-header">
      <label class="select-all">
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="someSelected && !allSelected"
          @change="toggleAll"
        />
        <span>{{ selectedCount }} of {{ totalFileCount }} files selected</span>
      </label>
    </div>
    <div class="tree-body">
      <FolderTreeNode
        v-for="node in tree"
        :key="node.path"
        :node="node"
        :selected-paths="selectedPaths"
        :batch-upload-items="batchUploadItems"
        :depth="0"
        @toggle="onToggle"
        @toggle-expand="onToggleExpand"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { BatchUploadItem } from '@/stores/rag.store';
import FolderTreeNode from './FolderTreeNode.vue';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: File;
  children?: FileNode[];
  expanded?: boolean;
}

const props = defineProps<{
  files: File[];
  batchUploadItems?: BatchUploadItem[];
}>();

const emit = defineEmits<{
  (e: 'update:selectedFiles', files: File[]): void;
}>();

const selectedPaths = ref<Set<string>>(new Set());
const tree = ref<FileNode[]>([]);

const buildTree = (files: File[]): FileNode[] => {
  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name;
    const parts = relativePath.split('/');

    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let folderNode = folderMap.get(currentPath);
      if (!folderNode) {
        folderNode = {
          name: part,
          path: currentPath,
          type: 'folder',
          children: [],
          expanded: true,
        };
        folderMap.set(currentPath, folderNode);
        currentLevel.push(folderNode);
      }
      currentLevel = folderNode.children!;
    }

    const fileName = parts[parts.length - 1];
    const filePath = relativePath;
    currentLevel.push({
      name: fileName,
      path: filePath,
      type: 'file',
      file,
    });
  }

  return root;
};

const collectFilePaths = (nodes: FileNode[]): Set<string> => {
  const paths = new Set<string>();
  const traverse = (nodeList: FileNode[]) => {
    for (const node of nodeList) {
      if (node.type === 'file') {
        paths.add(node.path);
      } else if (node.children) {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return paths;
};

const totalFileCount = computed(() => props.files.length);

const selectedCount = computed(() => selectedPaths.value.size);

const allSelected = computed(() => selectedCount.value === totalFileCount.value && totalFileCount.value > 0);

const someSelected = computed(() => selectedCount.value > 0);

const toggleAll = () => {
  if (allSelected.value) {
    selectedPaths.value = new Set();
  } else {
    selectedPaths.value = collectFilePaths(tree.value);
  }
  emitSelected();
};

const emitSelected = () => {
  const selected: File[] = [];
  const traverse = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file' && node.file && selectedPaths.value.has(node.path)) {
        selected.push(node.file);
      } else if (node.children) {
        traverse(node.children);
      }
    }
  };
  traverse(tree.value);
  emit('update:selectedFiles', selected);
};

const onToggle = (node: FileNode) => {
  if (node.type === 'file') {
    const newPaths = new Set(selectedPaths.value);
    if (newPaths.has(node.path)) {
      newPaths.delete(node.path);
    } else {
      newPaths.add(node.path);
    }
    selectedPaths.value = newPaths;
  } else if (node.type === 'folder' && node.children) {
    const childFilePaths = collectFilePaths(node.children);
    const newPaths = new Set(selectedPaths.value);
    const allChildrenSelected = [...childFilePaths].every((p) => newPaths.has(p));
    if (allChildrenSelected) {
      childFilePaths.forEach((p) => newPaths.delete(p));
    } else {
      childFilePaths.forEach((p) => newPaths.add(p));
    }
    selectedPaths.value = newPaths;
  }
  emitSelected();
};

const onToggleExpand = (node: FileNode) => {
  node.expanded = !node.expanded;
};

watch(
  () => props.files,
  (files) => {
    tree.value = buildTree(files);
    selectedPaths.value = collectFilePaths(tree.value);
    emitSelected();
  },
  { immediate: true },
);
</script>

<style scoped>
.folder-tree-selector {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1rem;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.tree-header {
  padding: 0.5rem 0.75rem;
  background: var(--ion-color-light);
  border-bottom: 1px solid var(--ion-color-light-shade);
  flex-shrink: 0;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--dark-text-muted, #555);
  cursor: pointer;
}

.select-all input[type='checkbox'] {
  cursor: pointer;
}

.tree-body {
  overflow-y: auto;
  flex: 1;
  padding: 0.25rem 0;
}
</style>
