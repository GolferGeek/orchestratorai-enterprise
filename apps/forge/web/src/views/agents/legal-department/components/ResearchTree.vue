<template>
  <div class="research-tree">
    <div v-if="rootNodes.length === 0" class="tree-empty">
      <ion-icon :icon="gitNetworkOutline" size="large" color="medium" />
      <p>No research tree available yet.</p>
    </div>

    <template v-else>
      <!-- Selected node detail panel (shown only in normal non-selectable mode) -->
      <div v-if="!selectable && selectedNode" class="node-detail-panel">
        <div class="panel-header">
          <strong>Node detail</strong>
          <ion-button size="small" fill="clear" @click="selectedNode = null">
            <ion-icon :icon="closeOutline" slot="icon-only" />
          </ion-button>
        </div>
        <ResearchNodeDetail :node="selectedNode" />
      </div>

      <!-- Tree nodes -->
      <div class="tree-nodes">
        <ResearchTreeNodeRow
          v-for="node in rootNodes"
          :key="node.id"
          :node="node"
          :all-nodes="nodeMap"
          :selected-id="selectedNode?.id ?? null"
          :checked-ids="checkedIds"
          :selectable="selectable"
          :multi-select="multiSelect"
          :depth="0"
          @select="onSelect"
          @check="onCheck"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonIcon, IonButton } from '@ionic/vue';
import { gitNetworkOutline, closeOutline } from 'ionicons/icons';
import type { ResearchTreeNode } from './research-types';
import ResearchNodeDetail from './ResearchNodeDetail.vue';
import ResearchTreeNodeRow from './ResearchTreeNodeRow.vue';

const props = defineProps<{
  researchTree: ResearchTreeNode[];
  /** When true, nodes render with selection controls instead of a detail panel. */
  selectable?: boolean;
  /** When selectable=true, allow multiple nodes to be checked (deepen mode).
   *  When false, only one node can be selected at a time (redirect mode). */
  multiSelect?: boolean;
  /** Controlled list of checked node IDs — used when selectable=true. */
  checkedIds?: string[];
}>();

const emit = defineEmits<{
  (e: 'node-selected', nodeId: string): void;
}>();

const selectedNode = ref<ResearchTreeNode | null>(null);

/** Index all nodes by id for O(1) child lookup. */
const nodeMap = computed(() => {
  const map = new Map<string, ResearchTreeNode>();
  for (const node of props.researchTree) {
    map.set(node.id, node);
  }
  return map;
});

/** Root nodes are those with no parentId. */
const rootNodes = computed(() =>
  props.researchTree.filter((n) => n.parentId === null),
);

/** Normalised checkedIds — defaults to empty array when prop is not provided. */
const checkedIds = computed(() => props.checkedIds ?? []);

function onSelect(node: ResearchTreeNode): void {
  if (props.selectable) {
    // In selectable mode, row clicks are handled via the checkbox/radio
    // mechanism — nothing to do at this level.
    return;
  }
  selectedNode.value = node.id === selectedNode.value?.id ? null : node;
}

function onCheck(nodeId: string): void {
  emit('node-selected', nodeId);
}
</script>

<style scoped>
.research-tree {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--ion-color-medium);
  text-align: center;
}

.tree-empty p {
  margin: 0;
  font-size: 0.9em;
}

.node-detail-panel {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 8px;
  background: var(--ion-background-color);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--ion-color-step-100);
  border-bottom: 1px solid var(--ion-color-step-150);
  font-size: 0.85em;
}

.tree-nodes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
