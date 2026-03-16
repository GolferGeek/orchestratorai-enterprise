<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SharedTaskResponseDto } from '@/types/flow';
import { getUserColor } from '@/lib/user-colors';

const props = defineProps<{
  task: SharedTaskResponseDto;
  subtasks?: SharedTaskResponseDto[];
  isOwnBoard?: boolean;
  isCollaborated?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', task: SharedTaskResponseDto): void;
  (e: 'delete', taskId: string): void;
  (e: 'toggle', taskId: string, isCompleted: boolean): void;
}>();

const expanded = ref(false);

const subtaskCount = computed(() => props.subtasks?.length ?? 0);

const userColor = computed(() => {
  if (!props.task.userId && !props.task.assignedTo) return null;
  return getUserColor(props.task.userId, props.task.assignedTo);
});

const cardBorderStyle = computed(() => {
  if (!userColor.value) return {};
  return { borderLeft: `3px solid ${userColor.value.bg}` };
});

function formatDueDate(date: string): string {
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

function assignedLabel(task: SharedTaskResponseDto): string {
  const name = task.assignedTo ?? task.userId ?? '';
  if (!name) return '';
  return name.length > 12 ? name.slice(0, 12) + '...' : name;
}
</script>

<template>
  <div class="space-y-1">
    <div
      class="task-card"
      :class="{ completed: task.isCompleted }"
      :style="cardBorderStyle"
      @click="emit('click', task)"
    >
      <div class="flex items-start gap-2">
        <input
          type="checkbox"
          class="checkbox"
          :checked="task.isCompleted"
          style="margin-top: 2px; flex-shrink: 0;"
          @click.stop
          @change="emit('toggle', task.id, task.isCompleted)"
        />

        <div class="flex-1" style="min-width: 0;">
          <div
            class="font-medium text-sm"
            :style="{
              textDecoration: task.isCompleted ? 'line-through' : 'none',
              color: task.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text)',
            }"
          >
            {{ task.title }}
          </div>

          <div class="flex items-center gap-2 mt-1" style="flex-wrap: wrap;">
            <!-- Assigned user badge -->
            <span
              v-if="task.assignedTo || task.userId"
              class="badge text-xs"
              :style="userColor ? { background: userColor.bg, color: 'white' } : { background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }"
            >
              {{ assignedLabel(task) }}
            </span>

            <!-- Pomodoro count -->
            <span v-if="task.pomodoroCount > 0" class="text-xs" style="color: #ef4444;">
              🍅 {{ task.pomodoroCount }}
            </span>

            <!-- Subtask count -->
            <span v-if="subtaskCount > 0" class="text-xs text-muted">
              ↳ {{ subtaskCount }} subtask{{ subtaskCount !== 1 ? 's' : '' }}
            </span>

            <!-- Due date -->
            <span
              v-if="task.dueDate"
              class="text-xs"
              :style="{ color: dueDateColor(task.dueDate) }"
            >
              📅 {{ formatDueDate(task.dueDate) }}
            </span>

            <!-- Collaboration indicator -->
            <span
              v-if="isCollaborated"
              class="text-xs"
              style="color: var(--color-primary);"
              title="You are collaborating on this task"
            >
              ⟳ collab
            </span>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-1">
          <button
            v-if="subtaskCount > 0"
            class="btn btn-ghost btn-sm btn-icon"
            style="padding: 4px;"
            @click.stop="expanded = !expanded"
          >
            {{ expanded ? '▾' : '▸' }}
          </button>
          <button
            v-if="isOwnBoard"
            class="btn btn-ghost btn-sm btn-icon"
            style="padding: 4px; color: var(--color-text-muted);"
            @click.stop="emit('delete', task.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Inline subtasks -->
    <div
      v-if="expanded && subtaskCount > 0"
      style="margin-left: 24px; border-left: 2px solid var(--color-border); padding-left: 10px; display: flex; flex-direction: column; gap: 4px;"
    >
      <div
        v-for="subtask in subtasks"
        :key="subtask.id"
        class="flex items-center gap-2"
        style="padding: 6px 8px; background: var(--color-bg-secondary); border-radius: 6px; border: 1px solid var(--color-border);"
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
          :style="{
            textDecoration: subtask.isCompleted ? 'line-through' : 'none',
            color: subtask.isCompleted ? 'var(--color-text-muted)' : 'var(--color-text)',
          }"
        >
          {{ subtask.title }}
        </span>
        <span v-if="subtask.pomodoroCount > 0" class="text-xs" style="color: #ef4444;">
          🍅{{ subtask.pomodoroCount }}
        </span>
      </div>
    </div>
  </div>
</template>
