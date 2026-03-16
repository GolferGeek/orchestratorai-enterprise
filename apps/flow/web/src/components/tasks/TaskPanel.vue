<template>
  <!-- Toggle button when panel is closed -->
  <button
    v-if="!isOpen"
    class="fixed right-0 top-1/2 -translate-y-1/2 bg-white hover:bg-gray-100 border border-gray-200 rounded-l-lg p-3 shadow-lg transition-all z-50"
    @click="isOpen = true"
  >
    <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
  </button>

  <!-- Side panel -->
  <div
    :class="[
      'fixed right-0 top-0 h-full w-80 sm:w-96 bg-white border-l border-gray-200 shadow-xl transition-transform duration-300 z-40 flex flex-col',
      isOpen ? 'translate-x-0' : 'translate-x-full',
    ]"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h2 class="font-semibold text-gray-900">My Tasks</h2>
      </div>
      <button
        class="p-1 hover:bg-gray-100 rounded transition-colors"
        @click="isOpen = false"
      >
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Add task form -->
    <form class="p-4 border-b border-gray-200 space-y-3" @submit.prevent="handleSubmit">
      <input
        v-model="newTaskTitle"
        type="text"
        placeholder="What are you working on?"
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      />
      <div class="flex gap-2">
        <input
          v-model="assignedTo"
          type="text"
          placeholder="Assign to (optional)"
          class="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        />
        <button
          type="submit"
          :disabled="!newTaskTitle.trim()"
          class="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </form>

    <!-- Tasks list -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading skeletons -->
      <div v-if="tasksStore.loadingShared" class="p-4 space-y-3">
        <div v-for="i in 3" :key="i" class="h-16 bg-gray-100 rounded-lg animate-pulse" />
      </div>

      <template v-else>
        <!-- Active tasks -->
        <div v-if="activeTasks.length > 0" class="p-4">
          <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            In Progress ({{ activeTasks.length }})
          </h3>
          <div class="space-y-2">
            <TaskItem
              v-for="task in activeTasks"
              :key="task.id"
              :task="task"
              :subtasks="subtasksFor(task.id)"
              :all-tasks="allTasks"
              @toggle="handleToggle"
              @delete="handleDelete"
            />
          </div>
        </div>

        <!-- Completed tasks -->
        <div v-if="completedTasks.length > 0" class="p-4 border-t border-gray-200">
          <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Done ({{ completedTasks.length }})
          </h3>
          <div class="space-y-2">
            <TaskItem
              v-for="task in completedTasks"
              :key="task.id"
              :task="task"
              :subtasks="subtasksFor(task.id)"
              :all-tasks="allTasks"
              @toggle="handleToggle"
              @delete="handleDelete"
            />
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="activeTasks.length === 0 && completedTasks.length === 0"
          class="p-8 text-center text-gray-500"
        >
          <svg
            class="w-12 h-12 mx-auto mb-3 opacity-40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="font-medium">No tasks yet</p>
          <p class="text-sm">Add a task to get started</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import { flowApiService } from '@/services/flow-api.service';
import type { SharedTaskResponseDto } from '@/types/flow';
import TaskItem from './TaskItem.vue';

const tasksStore = useTasksStore();
const isOpen = ref(true);
const newTaskTitle = ref('');
const assignedTo = ref('');

// Load my tasks on mount and poll every 5 seconds
async function loadMyTasks() {
  try {
    const data = await flowApiService.getMyTasks(['in_progress', 'today', 'done']);
    tasksStore.myTasks = data;
  } catch (error) {
    console.error('Error fetching my tasks:', error);
  }
}

let pollInterval: ReturnType<typeof setInterval>;

onMounted(() => {
  loadMyTasks();
  pollInterval = setInterval(loadMyTasks, 5000);
});

// Derived task lists — root tasks only
const allTasks = computed(() => tasksStore.myTasks);

const rootTasks = computed(() =>
  tasksStore.myTasks.filter((t) => !t.parentTaskId),
);

const activeTasks = computed(() =>
  rootTasks.value.filter((t) => t.status === 'in_progress' || t.status === 'today'),
);

const completedTasks = computed(() =>
  rootTasks.value.filter((t) => t.status === 'done'),
);

function subtasksFor(parentId: string): SharedTaskResponseDto[] {
  return tasksStore.myTasks.filter((t) => t.parentTaskId === parentId);
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function handleToggle(id: string, isCompleted: boolean) {
  const task = tasksStore.myTasks.find((t) => t.id === id);
  if (!task?.teamId) return;

  const newStatus = !isCompleted ? 'done' : 'today';
  // Optimistic update
  const idx = tasksStore.myTasks.findIndex((t) => t.id === id);
  if (idx !== -1) {
    tasksStore.myTasks[idx] = {
      ...tasksStore.myTasks[idx],
      isCompleted: !isCompleted,
      status: newStatus as SharedTaskResponseDto['status'],
    };
  }

  try {
    await flowApiService.updateSharedTask(task.teamId, id, {
      isCompleted: !isCompleted,
      status: newStatus as SharedTaskResponseDto['status'],
    });
  } catch (error) {
    console.error('Error toggling task:', error);
    await loadMyTasks();
  }
}

async function handleDelete(id: string) {
  const task = tasksStore.myTasks.find((t) => t.id === id);
  if (!task?.teamId) return;

  tasksStore.myTasks = tasksStore.myTasks.filter((t) => t.id !== id);

  try {
    await flowApiService.deleteSharedTask(task.teamId, id);
  } catch (error) {
    console.error('Error deleting task:', error);
    await loadMyTasks();
  }
}

async function handleSubmit() {
  if (!newTaskTitle.value.trim()) return;

  const teamId = tasksStore.myTasks.find((t) => t.teamId)?.teamId;
  if (!teamId) return;

  try {
    await flowApiService.createSharedTask(teamId, {
      title: newTaskTitle.value.trim(),
      status: 'in_progress',
      assignedTo: assignedTo.value.trim() || undefined,
    });
    newTaskTitle.value = '';
    assignedTo.value = '';
    await loadMyTasks();
  } catch (error) {
    console.error('Error adding task:', error);
  }
}
</script>
