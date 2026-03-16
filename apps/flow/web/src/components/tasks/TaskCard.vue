<script setup lang="ts">
import { ref } from 'vue';
import type { SharedTaskResponseDto } from '@/types/flow';
import TaskStatusBadge from './TaskStatusBadge.vue';

const props = defineProps<{
  task: SharedTaskResponseDto;
  subtasks?: SharedTaskResponseDto[];
  isOwnBoard?: boolean;
  showStatus?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', task: SharedTaskResponseDto): void;
  (e: 'delete', taskId: string): void;
  (e: 'toggle', taskId: string, isCompleted: boolean): void;
}>();

const expanded = ref(false);

const hasSubtasks = () => (props.subtasks?.length ?? 0) > 0;

function formatDate(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);

  if (days < 0) return `Overdue (${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function dueDateColor(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return 'var(--color-destructive)';
  if (days === 0) return '#f97316';
  if (days === 1) return '#eab308';
  return 'var(--color-text-muted)';
}

function getUserColor(userId: string | null, assignedTo: string | null): string {
  const seed = userId ?? assignedTo ?? '';
  const colors = ['#7c6aff', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash += seed.charCodeAt(i);
  return colors[hash % colors.length];
}
</script>

<template>
  <div class="space-y-1">
    <div
      class="task-card"
      :class="{ completed: task.isCompleted }"
      :style="{ borderLeft: task.assignedTo ? `3px solid ${getUserColor(task.userId, task.assignedTo)}` : '' }"
      @click="emit('click', task)"
    >
      <div class="flex items-start gap-2">
        <input
          type="checkbox"
          class="checkbox"
          :checked="task.isCompleted"
          style="margin-top:2px;"
          @click.stop
          @change="emit('toggle', task.id, task.isCompleted)"
        />

        <div class="flex-1" style="min-width:0;">
          <div
            class="font-medium text-sm"
            :style="{ textDecoration: task.isCompleted ? 'line-through' : 'none', color: task.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text)' }"
          >
            {{ task.title }}
          </div>

          <div class="flex items-center gap-2 mt-1" style="flex-wrap:wrap;">
            <TaskStatusBadge v-if="showStatus" :status="task.status" />

            <span
              v-if="task.assignedTo"
              class="badge badge-default text-xs"
              :style="{ background: getUserColor(task.userId, task.assignedTo) }"
            >
              {{ task.assignedTo }}
            </span>

            <span v-if="task.pomodoroCount > 0" class="text-xs" style="color:#ef4444;">
              🍅 {{ task.pomodoroCount }}
            </span>

            <span
              v-if="task.dueDate"
              class="text-xs"
              :style="{ color: dueDateColor(task.dueDate) }"
            >
              📅 {{ formatDate(task.dueDate) }}
            </span>

            <span v-if="hasSubtasks()" class="text-xs text-muted">
              ↳ {{ subtasks!.length }} subtask{{ subtasks!.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-if="hasSubtasks()"
            class="btn btn-ghost btn-sm btn-icon"
            style="padding:4px;"
            @click.stop="expanded = !expanded"
          >
            {{ expanded ? '▾' : '▸' }}
          </button>
          <button
            v-if="isOwnBoard"
            class="btn btn-ghost btn-sm btn-icon"
            style="padding:4px;color:var(--color-text-muted);"
            @click.stop="emit('delete', task.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Subtasks -->
    <div
      v-if="expanded && hasSubtasks()"
      style="margin-left:24px;border-left:2px solid var(--color-border);padding-left:10px;display:flex;flex-direction:column;gap:4px;"
    >
      <div
        v-for="subtask in subtasks"
        :key="subtask.id"
        class="flex items-center gap-2"
        style="padding:6px 8px;background:var(--color-bg-secondary);border-radius:6px;border:1px solid var(--color-border);"
        :class="{ completed: subtask.isCompleted }"
      >
        <input
          type="checkbox"
          class="checkbox"
          :checked="subtask.isCompleted"
          @change="emit('toggle', subtask.id, subtask.isCompleted)"
        />
        <span
          class="text-sm flex-1 truncate"
          :style="{ textDecoration: subtask.isCompleted ? 'line-through' : 'none', color: subtask.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text)' }"
        >
          {{ subtask.title }}
        </span>
        <span v-if="subtask.pomodoroCount > 0" class="text-xs" style="color:#ef4444;">
          🍅{{ subtask.pomodoroCount }}
        </span>
      </div>
    </div>
  </div>
</template>
