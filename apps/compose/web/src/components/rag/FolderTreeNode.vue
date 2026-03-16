<template>
  <div class="tree-node" :class="{ 'is-folder': node.type === 'folder' }">
    <div class="node-row" :style="{ paddingLeft: `${depth * 1.25}rem` }">
      <!-- Expand/Collapse for folders -->
      <ion-icon
        v-if="node.type === 'folder'"
        :icon="node.expanded ? chevronDownOutline : chevronForwardOutline"
        class="expand-icon"
        @click="$emit('toggle-expand', node)"
      />
      <span v-else class="expand-placeholder" />

      <!-- Checkbox -->
      <ion-checkbox
        :checked="isChecked"
        :indeterminate="isIndeterminate"
        @ionChange="$emit('toggle', node)"
        class="node-checkbox"
      />

      <!-- Icon -->
      <ion-icon
        :icon="node.type === 'folder' ? folderOutline : documentOutline"
        :class="['node-icon', node.type === 'folder' ? 'folder-icon' : 'file-icon']"
      />

      <!-- Name -->
      <span class="node-name" :class="{ 'folder-name': node.type === 'folder' }">
        {{ node.name }}
      </span>

      <!-- File count for folders -->
      <span v-if="node.type === 'folder'" class="file-count">
        ({{ childFileCount }} files)
      </span>

      <!-- Processing status -->
      <span v-if="status" class="status-indicator">
        <ion-spinner v-if="status.status === 'processing'" name="crescent" />
        <ion-icon v-else-if="status.status === 'success'" :icon="checkmarkCircleOutline" class="success-icon" />
        <ion-icon v-else-if="status.status === 'error'" :icon="alertCircleOutline" class="error-icon" />
      </span>
    </div>

    <!-- Children -->
    <div v-if="node.type === 'folder' && node.expanded && node.children" class="node-children">
      <FolderTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-paths="selectedPaths"
        :batch-upload-items="batchUploadItems"
        :depth="depth + 1"
        @toggle="$emit('toggle', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonCheckbox, IonIcon, IonSpinner } from '@ionic/vue';
import {
  chevronDownOutline,
  chevronForwardOutline,
  folderOutline,
  documentOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import type { FileNode } from './FolderTreeSelector.vue';
import type { BatchUploadItem } from '@/stores/ragStore';

const props = withDefaults(defineProps<{
  node: FileNode;
  selectedPaths: Set<string>;
  batchUploadItems?: BatchUploadItem[];
  depth?: number;
}>(), {
  depth: 0,
  batchUploadItems: () => [],
});

defineEmits<{
  (e: 'toggle', node: FileNode): void;
  (e: 'toggle-expand', node: FileNode): void;
}>();

// Get all file paths under this node
const getAllFilePaths = (node: FileNode): string[] => {
  if (node.type === 'file') return [node.path];
  if (!node.children) return [];
  return node.children.flatMap(child => getAllFilePaths(child));
};

// Computed properties
const childFilePaths = computed(() => getAllFilePaths(props.node));
const childFileCount = computed(() => childFilePaths.value.length);

const isChecked = computed(() => {
  if (props.node.type === 'file') {
    return props.selectedPaths.has(props.node.path);
  }
  // Folder: all children selected
  return childFilePaths.value.length > 0 &&
         childFilePaths.value.every(p => props.selectedPaths.has(p));
});

const isIndeterminate = computed(() => {
  if (props.node.type === 'file') return false;
  const selectedCount = childFilePaths.value.filter(p => props.selectedPaths.has(p)).length;
  return selectedCount > 0 && selectedCount < childFilePaths.value.length;
});

const status = computed(() => {
  if (!props.batchUploadItems) return null;
  return props.batchUploadItems.find(item => item.path === props.node.path);
});
</script>

<style scoped>
.tree-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.node-row:hover {
  background-color: var(--ion-color-light);
}

.expand-icon {
  font-size: 1rem;
  color: var(--ion-color-medium);
  cursor: pointer;
  flex-shrink: 0;
}

.expand-placeholder {
  width: 1rem;
  flex-shrink: 0;
}

.node-checkbox {
  --size: 18px;
  flex-shrink: 0;
}

.node-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.folder-icon {
  color: var(--ion-color-warning);
}

.file-icon {
  color: var(--ion-color-medium);
}

.node-name {
  flex: 1;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-name {
  font-weight: 500;
}

.file-count {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

.status-indicator {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.status-indicator ion-spinner {
  width: 16px;
  height: 16px;
}

.success-icon {
  color: var(--ion-color-success);
  font-size: 1.1rem;
}

.error-icon {
  color: var(--ion-color-danger);
  font-size: 1.1rem;
}

.node-children {
  /* Children are indented via paddingLeft */
}
</style>
