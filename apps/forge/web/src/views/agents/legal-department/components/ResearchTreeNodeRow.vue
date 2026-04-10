<template>
  <div class="tree-node-row">
    <button
      class="node-button"
      :class="[
        `confidence-${node.confidence ?? 'none'}`,
        `status-${node.status}`,
        { selected: !selectable && selectedId === node.id },
        { 'selectable-checked': selectable && isChecked },
        { 'selectable-mode': selectable },
      ]"
      :style="{ paddingLeft: `${depth * 20 + 10}px` }"
      @click="toggle"
    >
      <!-- Expand/collapse indicator for nodes with children (when not selectable) -->
      <span class="expand-icon" v-if="hasChildren && !selectable">
        <ion-icon :icon="expanded ? chevronDownOutline : chevronForwardOutline" />
      </span>
      <span class="expand-icon placeholder" v-else-if="!selectable" />

      <!-- Checkbox (multi-select / deepen mode) -->
      <span v-if="selectable && multiSelect" class="select-control">
        <input
          type="checkbox"
          :checked="isChecked"
          class="node-checkbox"
          tabindex="-1"
          @click.stop="onCheckboxClick"
        />
      </span>

      <!-- Radio (single-select / redirect mode) -->
      <span v-else-if="selectable && !multiSelect" class="select-control">
        <input
          type="radio"
          :checked="isChecked"
          class="node-radio"
          tabindex="-1"
          @click.stop="onCheckboxClick"
        />
      </span>

      <!-- Status dot -->
      <span class="status-dot" :class="`dot-${node.status}`" />

      <!-- Question text -->
      <span class="node-text">{{ node.question }}</span>

      <!-- Unverified citation warning -->
      <ion-badge
        v-if="hasUnverifiedCitations"
        color="warning"
        class="unverified-badge"
        title="Contains unverified citations"
      >
        !
      </ion-badge>

      <!-- Confidence badge -->
      <ion-badge
        v-if="node.confidence"
        :color="confidenceColor(node.confidence)"
        class="confidence-badge"
      >
        {{ node.confidence }}
      </ion-badge>
    </button>

    <!-- Recursive children -->
    <template v-if="expanded && hasChildren">
      <ResearchTreeNodeRow
        v-for="childId in node.childIds"
        :key="childId"
        :node="childNode(childId)"
        :all-nodes="allNodes"
        :selected-id="selectedId"
        :checked-ids="checkedIds"
        :selectable="selectable"
        :multi-select="multiSelect"
        :depth="depth + 1"
        @select="$emit('select', $event)"
        @check="$emit('check', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonIcon, IonBadge } from '@ionic/vue';
import { chevronDownOutline, chevronForwardOutline } from 'ionicons/icons';
import type { ResearchTreeNode } from './research-types';

const props = defineProps<{
  node: ResearchTreeNode;
  allNodes: Map<string, ResearchTreeNode>;
  selectedId: string | null;
  depth: number;
  /** When true, show selection controls instead of detail-panel click behaviour. */
  selectable?: boolean;
  /** Multi-select (checkboxes) vs single-select (radio). Only used when selectable=true. */
  multiSelect?: boolean;
  /** Set of node IDs that are currently checked — controlled externally. */
  checkedIds?: string[];
}>();

const emit = defineEmits<{
  (e: 'select', node: ResearchTreeNode): void;
  (e: 'check', nodeId: string): void;
}>();

const expanded = ref(props.depth === 0);

const hasChildren = computed(() => props.node.childIds.length > 0);

const hasUnverifiedCitations = computed(() =>
  (props.node.citations ?? []).some((c) => !c.verified),
);

const isChecked = computed(() =>
  (props.checkedIds ?? []).includes(props.node.id),
);

function childNode(id: string): ResearchTreeNode {
  const found = props.allNodes.get(id);
  if (!found) {
    // Return a placeholder node when a referenced child isn't in the tree yet
    return {
      id,
      parentId: props.node.id,
      question: `(loading: ${id})`,
      depth: props.depth + 1,
      status: 'pending',
      childIds: [],
    };
  }
  return found;
}

function toggle(): void {
  if (props.selectable) {
    onCheckboxClick();
    return;
  }
  if (hasChildren.value) {
    expanded.value = !expanded.value;
  }
  emit('select', props.node);
}

function onCheckboxClick(): void {
  emit('check', props.node.id);
}

function confidenceColor(confidence: ResearchTreeNode['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'success';
    case 'medium':
      return 'warning';
    case 'low':
      return 'danger';
    default:
      return 'medium';
  }
}
</script>

<style scoped>
.tree-node-row {
  display: flex;
  flex-direction: column;
}

.node-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 0.88em;
  color: var(--ion-color-dark);
  transition: background 0.15s;
  line-height: 1.4;
}

.node-button:hover {
  background: var(--ion-color-step-100);
}

.node-button.selected {
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-contrast);
}

/* Confidence color-coding via left border */
.node-button.confidence-high {
  border-left: 3px solid var(--ion-color-success);
}

.node-button.confidence-medium {
  border-left: 3px solid var(--ion-color-warning);
}

.node-button.confidence-low {
  border-left: 3px solid var(--ion-color-danger);
}

.node-button.confidence-none,
.node-button.status-pending,
.node-button.status-skipped {
  border-left: 3px solid var(--ion-color-step-200);
}

.expand-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 0.85em;
  color: var(--ion-color-medium);
  width: 16px;
}

.expand-icon.placeholder {
  width: 16px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-answered {
  background: var(--ion-color-success);
}

.dot-researching {
  background: var(--ion-color-primary);
}

.dot-pending {
  background: var(--ion-color-medium);
}

.dot-skipped {
  background: var(--ion-color-step-300);
}

.node-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unverified-badge {
  flex-shrink: 0;
  font-size: 0.75em;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.confidence-badge {
  flex-shrink: 0;
  font-size: 0.72em;
}

/* ── Selectable mode ── */
.node-button.selectable-mode {
  cursor: pointer;
}

.node-button.selectable-checked {
  background: color-mix(in srgb, var(--ion-color-primary) 12%, transparent);
  border-left: 3px solid var(--ion-color-primary);
}

.select-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: 2px;
}

.node-checkbox,
.node-radio {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--ion-color-primary);
}
</style>
