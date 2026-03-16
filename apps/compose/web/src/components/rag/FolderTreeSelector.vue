<template>
  <div class="folder-tree-selector">
    <!-- Select All Header -->
    <div class="tree-header">
      <ion-checkbox
        :checked="allSelected"
        :indeterminate="someSelected && !allSelected"
        @ionChange="toggleAll"
      />
      <span class="header-label">
        {{ selectedCount }} of {{ totalFileCount }} files selected
      </span>
    </div>

    <!-- Tree View -->
    <div class="tree-container">
      <FolderTreeNode
        v-for="node in treeData"
        :key="node.path"
        :node="node"
        :selected-paths="selectedPaths"
        :batch-upload-items="batchUploadItems"
        @toggle="toggleNode"
        @toggle-expand="toggleExpand"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { IonCheckbox } from '@ionic/vue';
import FolderTreeNode from './FolderTreeNode.vue';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: File;
  children?: FileNode[];
  expanded?: boolean;
}

// Import BatchUploadItem type from store
import type { BatchUploadItem } from '@/stores/ragStore';

const props = defineProps<{
  files: File[];
  batchUploadItems?: BatchUploadItem[];
}>();

const emit = defineEmits<{
  (e: 'update:selectedFiles', files: File[]): void;
}>();

// Build tree structure from flat file list
const treeData = ref<FileNode[]>([]);
const selectedPaths = ref<Set<string>>(new Set());

const _buildTree = (files: File[]): FileNode[] => {
  const root: Record<string, FileNode> = {};

  for (const file of files) {
    // Handle files that might not have webkitRelativePath (fallback to filename)
    const relativePath = file.webkitRelativePath || file.name;
    const pathParts = relativePath.split('/');
    let current = root;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isFile = i === pathParts.length - 1;
      const currentPath = pathParts.slice(0, i + 1).join('/');

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          file: isFile ? file : undefined,
          children: isFile ? undefined : [],
          expanded: true, // Start expanded
        };
      }

      if (!isFile) {
        // Move into the folder's children
        const folder = current[part];
        if (!folder.children) folder.children = [];
        // Convert children array to record for next iteration
        const childRecord: Record<string, FileNode> = {};
        for (const child of folder.children) {
          childRecord[child.name] = child;
        }
        current = childRecord;
        // Update the actual children array
        folder.children = Object.values(childRecord);
      }
    }
  }

  // Convert root record to array and rebuild properly
  return rebuildTree(files);
};

const rebuildTree = (files: File[]): FileNode[] => {
  const root: Map<string, FileNode> = new Map();

  for (const file of files) {
    // Handle files that might not have webkitRelativePath (fallback to filename)
    const relativePath = file.webkitRelativePath || file.name;
    const pathParts = relativePath.split('/');

    // Ensure all folders exist
    for (let i = 0; i < pathParts.length; i++) {
      const currentPath = pathParts.slice(0, i + 1).join('/');
      const parentPath = i > 0 ? pathParts.slice(0, i).join('/') : null;
      const isFile = i === pathParts.length - 1;

      if (!root.has(currentPath)) {
        const node: FileNode = {
          name: pathParts[i],
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          file: isFile ? file : undefined,
          children: isFile ? undefined : [],
          expanded: true,
        };
        root.set(currentPath, node);

        // Add to parent's children
        if (parentPath) {
          const parent = root.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(node);
          }
        }
      }
    }
  }

  // Return only top-level nodes
  const topLevel: FileNode[] = [];
  for (const [path, node] of root) {
    if (!path.includes('/') || path.split('/').length === 1) {
      topLevel.push(node);
    }
  }

  return topLevel;
};

// Get all file paths from tree
const getAllFilePaths = (nodes: FileNode[]): string[] => {
  const paths: string[] = [];
  const traverse = (nodeList: FileNode[]) => {
    for (const node of nodeList) {
      if (node.type === 'file') {
        paths.push(node.path);
      } else if (node.children) {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return paths;
};

// Computed properties
const totalFileCount = computed(() => getAllFilePaths(treeData.value).length);
const selectedCount = computed(() => {
  return getAllFilePaths(treeData.value).filter(p => selectedPaths.value.has(p)).length;
});
const allSelected = computed(() => selectedCount.value === totalFileCount.value && totalFileCount.value > 0);
const someSelected = computed(() => selectedCount.value > 0);

// Select all files
const selectAllFiles = () => {
  const allPaths = getAllFilePaths(treeData.value);
  selectedPaths.value = new Set(allPaths);
  emitSelectedFiles();
};

// Toggle all
const toggleAll = () => {
  if (allSelected.value) {
    selectedPaths.value = new Set();
  } else {
    selectAllFiles();
  }
  emitSelectedFiles();
};

// Toggle a node (file or folder)
const toggleNode = (node: FileNode) => {
  if (node.type === 'file') {
    if (selectedPaths.value.has(node.path)) {
      selectedPaths.value.delete(node.path);
    } else {
      selectedPaths.value.add(node.path);
    }
  } else {
    // Folder: toggle all children
    const childPaths = getAllFilePaths(node.children || []);
    const allChildrenSelected = childPaths.every(p => selectedPaths.value.has(p));

    if (allChildrenSelected) {
      // Deselect all children
      for (const path of childPaths) {
        selectedPaths.value.delete(path);
      }
    } else {
      // Select all children
      for (const path of childPaths) {
        selectedPaths.value.add(path);
      }
    }
  }
  selectedPaths.value = new Set(selectedPaths.value); // Trigger reactivity
  emitSelectedFiles();
};

// Toggle folder expansion
const toggleExpand = (node: FileNode) => {
  node.expanded = !node.expanded;
};

// Emit selected files
const emitSelectedFiles = () => {
  const selectedFiles: File[] = [];
  const findFiles = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file' && node.file && selectedPaths.value.has(node.path)) {
        selectedFiles.push(node.file);
      } else if (node.children) {
        findFiles(node.children);
      }
    }
  };
  findFiles(treeData.value);
  emit('update:selectedFiles', selectedFiles);
};

// Watch for file changes and rebuild tree (must be after selectAllFiles and emitSelectedFiles)
watch(() => props.files, (files) => {
  if (files.length > 0) {
    try {
      treeData.value = rebuildTree(files);
      // Select all by default
      selectAllFiles();
    } catch (error) {
      console.error('Error building folder tree:', error);
      treeData.value = [];
      selectedPaths.value = new Set();
      // Emit empty array to clear selections
      emit('update:selectedFiles', []);
    }
  } else {
    treeData.value = [];
    selectedPaths.value = new Set();
    emit('update:selectedFiles', []);
  }
}, { immediate: true });

// Expose for parent to get processing status
defineExpose({
  selectedPaths,
  treeData,
});
</script>

<style scoped>
.folder-tree-selector {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  overflow: hidden;
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--ion-color-light);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.header-label {
  font-size: 0.9rem;
  color: var(--ion-color-medium-shade);
}

.tree-container {
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
}
</style>
