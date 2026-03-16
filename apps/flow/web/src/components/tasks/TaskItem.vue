<template>
  <div :class="depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-2' : ''">
    <div
      :class="[
        'group flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 transition-all',
        task.isCompleted ? 'opacity-60' : '',
      ]"
    >
      <!-- Expand/collapse button or spacer -->
      <button
        v-if="hasSubtasks"
        class="p-0.5 hover:bg-gray-200 rounded mt-0.5 flex-shrink-0"
        @click="expanded = !expanded"
      >
        <svg
          :class="['w-4 h-4 text-gray-400 transition-transform', expanded ? 'rotate-90' : '']"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div v-else class="w-5 flex-shrink-0" />

      <!-- Checkbox -->
      <input
        type="checkbox"
        :checked="task.isCompleted"
        class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
        @change="emit('toggle', task.id, task.isCompleted)"
      />

      <!-- Task content -->
      <div class="flex-1 min-w-0">
        <p
          :class="[
            'text-sm font-medium leading-tight',
            task.isCompleted ? 'line-through text-gray-400' : 'text-gray-900',
          ]"
        >
          {{ task.title }}
        </p>
        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
          <span v-if="task.assignedTo" class="text-xs text-gray-500">
            {{ task.assignedTo }}
          </span>
          <span v-if="task.pomodoroCount > 0" class="text-xs text-red-500">
            {{ task.pomodoroCount }}
          </span>
          <span v-if="task.teamId" class="text-xs text-gray-400 italic">
            team task
          </span>
          <span
            v-if="hasSubtasks && !expanded"
            class="text-xs text-gray-400"
          >
            ({{ subtasks.length }} subtask{{ subtasks.length !== 1 ? 's' : '' }})
          </span>
        </div>
      </div>

      <!-- Delete button -->
      <button
        class="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all flex-shrink-0"
        @click="emit('delete', task.id)"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>

    <!-- Subtasks -->
    <div v-if="hasSubtasks && expanded" class="mt-1 space-y-1">
      <TaskItem
        v-for="subtask in subtasks"
        :key="subtask.id"
        :task="subtask"
        :subtasks="childSubtasksFor(subtask.id)"
        :all-tasks="allTasks"
        :depth="depth + 1"
        @toggle="emit('toggle', $event[0], $event[1])"
        @delete="emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SharedTaskResponseDto } from '@/types/flow';

const props = defineProps<{
  task: SharedTaskResponseDto;
  subtasks: SharedTaskResponseDto[];
  allTasks: SharedTaskResponseDto[];
  depth?: number;
}>();

const emit = defineEmits<{
  (e: 'toggle', id: string, isCompleted: boolean): void;
  (e: 'delete', id: string): void;
}>();

const expanded = ref(false);
const hasSubtasks = computed(() => props.subtasks.length > 0);

function childSubtasksFor(parentId: string): SharedTaskResponseDto[] {
  return props.allTasks.filter((t) => t.parentTaskId === parentId);
}
</script>
