<template>
  <div class="oai-table-wrapper">
    <!-- Header row -->
    <div
      class="oai-table__head"
      :style="gridTemplateColumns"
    >
      <div
        v-for="col in columns"
        :key="col.key"
        class="oai-table__th"
        :class="{ 'oai-table__th--sortable': col.sortable }"
        @click="col.sortable && emit('sort', col.key)"
      >
        {{ col.label }}
        <ion-icon
          v-if="col.sortable"
          :icon="chevronExpandOutline"
          class="oai-table__sort-icon"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="oai-table__loading">
      <ion-spinner name="crescent" class="oai-table__spinner" />
    </div>

    <!-- Empty state -->
    <div v-else-if="rows.length === 0" class="oai-table__empty">
      {{ emptyMessage }}
    </div>

    <!-- Data rows -->
    <template v-else>
      <div
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        class="oai-table__row"
        :style="gridTemplateColumns"
        @click="emit('rowClick', row)"
      >
        <div
          v-for="col in columns"
          :key="col.key"
          class="oai-table__td"
        >
          <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
            {{ row[col.key] }}
          </slot>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonSpinner, IonIcon } from '@ionic/vue';
import { chevronExpandOutline } from 'ionicons/icons';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
}

const props = withDefaults(defineProps<{
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyMessage?: string;
}>(), {
  loading: false,
  emptyMessage: 'No data to display',
});

const emit = defineEmits<{
  sort: [key: string];
  rowClick: [row: Record<string, unknown>];
}>();

const gridTemplateColumns = computed(() => {
  const cols = props.columns.map(c => c.width ?? '1fr').join(' ');
  return { gridTemplateColumns: cols };
});
</script>

<style scoped>
.oai-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--oai-border);
  border-radius: var(--oai-radius-lg);
  background: var(--oai-bg-surface);
}

.oai-table__head {
  display: grid;
  background: var(--oai-bg-surface-2);
  border-bottom: 1px solid var(--oai-border);
}

.oai-table__th {
  padding: var(--oai-space-3) var(--oai-space-4);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-xs);
  font-weight: var(--oai-font-weight-semibold);
  color: var(--oai-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: var(--oai-space-1);
  user-select: none;
}

.oai-table__th--sortable {
  cursor: pointer;
  transition: color var(--oai-transition);
}

.oai-table__th--sortable:hover {
  color: var(--oai-text-primary);
}

.oai-table__sort-icon {
  font-size: 14px;
  opacity: 0.5;
}

.oai-table__row {
  display: grid;
  border-bottom: 1px solid var(--oai-border-subtle);
  transition: background var(--oai-transition);
  cursor: pointer;
}

.oai-table__row:last-child {
  border-bottom: none;
}

.oai-table__row:hover {
  background: var(--oai-bg-surface-3);
}

.oai-table__td {
  padding: var(--oai-space-3) var(--oai-space-4);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
  color: var(--oai-text-primary);
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oai-table__loading,
.oai-table__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--oai-space-12) var(--oai-space-4);
  color: var(--oai-text-tertiary);
  font-family: var(--oai-font-family);
  font-size: var(--oai-font-size-sm);
}

.oai-table__spinner {
  color: var(--oai-text-accent);
  width: 28px;
  height: 28px;
}
</style>
