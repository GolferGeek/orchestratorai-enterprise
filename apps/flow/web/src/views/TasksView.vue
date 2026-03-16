<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import TaskCard from '@/components/tasks/TaskCard.vue';
import TaskForm from '@/components/tasks/TaskForm.vue';
import SearchBar from '@/components/shared/SearchBar.vue';
import TaskStatusBadge from '@/components/tasks/TaskStatusBadge.vue';
import type { SharedTaskResponseDto, SharedTaskStatus } from '@/types/flow';

const tasksStore = useTasksStore();
const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const search = ref('');
const showForm = ref(false);
const selectedStatus = ref<SharedTaskStatus | 'all'>('all');
const selectedTask = ref<SharedTaskResponseDto | null>(null);

const statuses: { value: SharedTaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'this_week', label: 'This Week' },
  { value: 'today', label: 'Today' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const filtered = computed(() => {
  let tasks = tasksStore.sharedTasks.filter((t) => !t.parentTaskId);

  if (selectedStatus.value !== 'all') {
    tasks = tasks.filter((t) => t.status === selectedStatus.value);
  }

  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    tasks = tasks.filter((t) => t.title.toLowerCase().includes(q));
  }

  return tasks;
});

onMounted(async () => {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await tasksStore.loadSharedTasks(teamId, { userId: authStore.user?.id });
});

async function handleCreateTask(data: { title: string; status: SharedTaskStatus; description?: string; dueDate?: string }) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await tasksStore.createSharedTask(teamId, data.title, data.status, {
    userId: authStore.user?.id,
    assignedTo: authStore.user?.displayName ?? authStore.user?.email,
  });
  showForm.value = false;
}

async function handleToggle(taskId: string, isCompleted: boolean) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await tasksStore.toggleTask(teamId, taskId, isCompleted);
}

async function handleDelete(taskId: string) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await tasksStore.deleteSharedTask(teamId, taskId);
}

function subtasksFor(taskId: string) {
  return tasksStore.subtasksFor(taskId);
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">My Tasks</h1>
          <p class="text-sm text-muted mt-1">{{ filtered.length }} task{{ filtered.length !== 1 ? 's' : '' }}</p>
        </div>
        <button class="btn btn-primary" @click="showForm = !showForm">
          + New Task
        </button>
      </div>
    </div>

    <div class="page-body">
      <!-- Create form -->
      <div v-if="showForm" class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <span class="font-medium">New Task</span>
          <button class="btn btn-ghost btn-sm" @click="showForm = false">✕</button>
        </div>
        <TaskForm :default-status="selectedStatus === 'all' ? 'today' : selectedStatus" @submit="handleCreateTask" @cancel="showForm = false" />
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap;">
        <SearchBar v-model="search" placeholder="Search tasks..." style="flex:1;min-width:200px;" />
        <div class="tabs" style="flex-shrink:0;">
          <button
            v-for="s in statuses"
            :key="s.value"
            class="tab"
            :class="{ active: selectedStatus === s.value }"
            @click="selectedStatus = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="tasksStore.loadingShared" class="empty-state">
        <div class="spinner" />
        <span>Loading tasks...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="filtered.length === 0" class="empty-state">
        <span style="font-size:28px;">✓</span>
        <div class="font-medium">No tasks found</div>
        <div class="text-sm">Create a task to get started</div>
        <button class="btn btn-primary btn-sm" @click="showForm = true">+ New Task</button>
      </div>

      <!-- Task list -->
      <div v-else class="flex flex-col gap-2">
        <TaskCard
          v-for="task in filtered"
          :key="task.id"
          :task="task"
          :subtasks="subtasksFor(task.id)"
          :is-own-board="true"
          :show-status="selectedStatus === 'all'"
          @click="selectedTask = task"
          @delete="handleDelete"
          @toggle="handleToggle"
        />
      </div>
    </div>

    <!-- Task detail modal -->
    <div v-if="selectedTask" class="modal-overlay" @click.self="selectedTask = null">
      <div class="modal">
        <div class="modal-header">
          <h2 class="font-semibold">Task Detail</h2>
          <button class="btn btn-ghost btn-icon" @click="selectedTask = null">✕</button>
        </div>
        <div class="flex flex-col gap-3">
          <div>
            <div class="form-label">Title</div>
            <div class="font-medium">{{ selectedTask.title }}</div>
          </div>
          <div v-if="selectedTask.description">
            <div class="form-label">Description</div>
            <div class="text-sm">{{ selectedTask.description }}</div>
          </div>
          <div class="flex gap-3">
            <div>
              <div class="form-label">Status</div>
              <TaskStatusBadge :status="selectedTask.status" />
            </div>
            <div v-if="selectedTask.assignedTo">
              <div class="form-label">Assigned To</div>
              <div class="text-sm">{{ selectedTask.assignedTo }}</div>
            </div>
          </div>
          <div v-if="selectedTask.dueDate">
            <div class="form-label">Due Date</div>
            <div class="text-sm">{{ new Date(selectedTask.dueDate).toLocaleDateString() }}</div>
          </div>
          <div>
            <div class="form-label">Pomodoros</div>
            <div class="text-sm">🍅 {{ selectedTask.pomodoroCount }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
