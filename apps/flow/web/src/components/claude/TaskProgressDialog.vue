<template>
  <Teleport to="body">
    <div v-if="open && taskId && taskTitle" class="task-progress-dialog__overlay" @click.self="close">
      <div class="task-progress-dialog__content" role="dialog" aria-modal="true" :aria-label="`Claude Code Progress: ${taskTitle}`">
        <!-- Dialog header -->
        <div class="task-progress-dialog__header">
          <div class="task-progress-dialog__heading">
            <span class="task-progress-dialog__heading-icon">&#128187;</span>
            <span>Claude Code Progress</span>
          </div>
          <p class="task-progress-dialog__description">{{ taskTitle }}</p>
          <button class="task-progress-dialog__close" @click="close" aria-label="Close">
            &#10005;
          </button>
        </div>

        <!-- Panel body -->
        <div class="task-progress-dialog__body">
          <TaskProgressPanel
            :task-id="taskId"
            :task-title="taskTitle"
            :expanded="true"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import TaskProgressPanel from './TaskProgressPanel.vue';

const props = defineProps<{
  open: boolean;
  taskId: string | null;
  taskTitle: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

function close() {
  emit('update:open', false);
}
</script>

<style scoped>
.task-progress-dialog__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.task-progress-dialog__content {
  background: var(--color-card, #ffffff);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-progress-dialog__header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  position: relative;
}

.task-progress-dialog__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-foreground, #1e293b);
}

.task-progress-dialog__heading-icon {
  color: #a855f7;
  font-size: 18px;
}

.task-progress-dialog__description {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-muted, #94a3b8);
  padding-right: 32px;
}

.task-progress-dialog__close {
  position: absolute;
  top: 14px;
  right: 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--color-muted, #94a3b8);
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}

.task-progress-dialog__close:hover {
  background: var(--color-border, #e2e8f0);
  color: var(--color-foreground, #1e293b);
}

.task-progress-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
}
</style>
