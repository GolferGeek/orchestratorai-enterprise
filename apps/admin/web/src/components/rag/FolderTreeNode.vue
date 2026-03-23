<template>
  <div class="tree-node-wrapper">
    <div
      class="tree-node"
      :style="{ paddingLeft: `${(depth ?? 0) * 20 + 8}px` }"
    >
      <!-- Expand/Collapse chevron for folders, spacer for files -->
      <button
        v-if="node.type === 'folder'"
        class="chevron-btn"
        @click="emit('toggle-expand', node)"
      >
        <ion-icon
          :icon="node.expanded ? chevronDownOutline : chevronForwardOutline"
          class="chevron-icon"
        />
      </button>
      <span v-else class="chevron-spacer" />

      <!-- Checkbox -->
      <input
        type="checkbox"
        class="node-checkbox"
        :checked="isChecked"
        :indeterminate="isIndeterminate"
        @change="emit('toggle', node)"
      />

      <!-- Folder / File icon -->
      <ion-icon
        :icon="node.type === 'folder' ? folderOutline : documentOutline"
        class="node-icon"
        :class="node.type === 'folder' ? 'icon-folder' : 'icon-file'"
      />

      <!-- Name -->
      <span class="node-name" :class="{ 'node-name--folder': node.type === 'folder' }">
        {{ node.name }}
      </span>

      <!-- File count for folders -->
      <span v-if="node.type === 'folder'" class="node-count">
        ({{ folderFileCount }})
      </span>

      <!-- Status indicator from batch upload items -->
      <template v-if="node.type === 'file' && uploadStatus">
        <ion-spinner v-if="uploadStatus === 'processing'" name="dots" class="node-status-spinner" />
        <ion-icon
          v-else-if="uploadStatus === 'success'"
          :icon="checkmarkCircleOutline"
          class="node-status-icon status-success"
        />
        <ion-icon
          v-else-if="uploadStatus === 'error'"
          :icon="alertCircleOutline"
          class="node-status-icon status-error"
        />
      </template>
    </div>

    <!-- Recursive children when folder is expanded -->
    <template v-if="node.type === 'folder' && node.expanded && node.children">
      <FolderTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-paths="selectedPaths"
        :batch-upload-items="batchUploadItems"
        :depth="(depth ?? 0) + 1"
        @toggle="(n) => emit('toggle', n)"
        @toggle-expand="(n) => emit('toggle-expand', n)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon, IonSpinner } from '@ionic/vue';
import {
  chevronDownOutline,
  chevronForwardOutline,
  folderOutline,
  documentOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import type { BatchUploadItem } from '@/stores/rag.store';
import type { FileNode } from './FolderTreeSelector.vue';

const props = defineProps<{
  node: FileNode;
  selectedPaths: Set<string>;
  batchUploadItems?: BatchUploadItem[];
  depth?: number;
}>();

const emit = defineEmits<{
  (e: 'toggle', node: FileNode): void;
  (e: 'toggle-expand', node: FileNode): void;
}>();

const collectFilePaths = (nodes: FileNode[]): string[] => {
  const paths: string[] = [];
  const traverse = (list: FileNode[]) => {
    for (const n of list) {
      if (n.type === 'file') {
        paths.push(n.path);
      } else if (n.children) {
        traverse(n.children);
      }
    }
  };
  traverse(nodes);
  return paths;
};

const folderFileCount = computed(() => {
  if (props.node.type !== 'folder' || !props.node.children) return 0;
  return collectFilePaths(props.node.children).length;
});

const isChecked = computed(() => {
  if (props.node.type === 'file') {
    return props.selectedPaths.has(props.node.path);
  }
  if (props.node.children) {
    const paths = collectFilePaths(props.node.children);
    return paths.length > 0 && paths.every((p) => props.selectedPaths.has(p));
  }
  return false;
});

const isIndeterminate = computed(() => {
  if (props.node.type !== 'folder' || !props.node.children) return false;
  const paths = collectFilePaths(props.node.children);
  const selectedCount = paths.filter((p) => props.selectedPaths.has(p)).length;
  return selectedCount > 0 && selectedCount < paths.length;
});

const uploadStatus = computed(() => {
  if (props.node.type !== 'file' || !props.batchUploadItems) return null;
  const item = props.batchUploadItems.find((i) => i.path === props.node.path);
  return item?.status ?? null;
});
</script>

<style scoped>
.tree-node-wrapper {
  width: 100%;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  padding-right: 0.75rem;
  cursor: default;
  transition: background 0.1s;
}

.tree-node:hover {
  background: var(--ion-color-light-tint);
}

.chevron-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--ion-color-medium);
  flex-shrink: 0;
}

.chevron-icon {
  font-size: 0.85rem;
}

.chevron-spacer {
  display: inline-block;
  width: 1rem;
  flex-shrink: 0;
}

.node-checkbox {
  cursor: pointer;
  flex-shrink: 0;
}

.node-icon {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.icon-folder {
  color: #d97706;
}

.icon-file {
  color: var(--ion-color-medium);
}

.node-name {
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  color: var(--ion-text-color);
}

.node-name--folder {
  font-weight: 600;
}

.node-count {
  font-size: 0.78rem;
  color: var(--ion-color-medium);
  white-space: nowrap;
  flex-shrink: 0;
}

.node-status-spinner {
  --color: var(--ion-color-primary);
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.node-status-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.status-success {
  color: #10b981;
}

.status-error {
  color: #ef4444;
}
</style>
