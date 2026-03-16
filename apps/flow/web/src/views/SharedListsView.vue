<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import SearchBar from '@/components/shared/SearchBar.vue';
import type { SharedTaskStatus } from '@/types/flow';

const tasksStore = useTasksStore();
const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const search = ref('');
const newTaskTitle = ref('');
const adding = ref(false);

onMounted(async () => {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  // Load all tasks (no userId filter = team-wide shared tasks)
  await tasksStore.loadSharedTasks(teamId);
});

// Shared pool: tasks with no user or assigned_to
const sharedTasks = computed(() => {
  let tasks = tasksStore.sharedTasks.filter((t) => !t.parentTaskId);
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    tasks = tasks.filter((t) => t.title.toLowerCase().includes(q));
  }
  return tasks;
});

const tasksByStatus = computed(() => {
  const groups: Record<SharedTaskStatus, typeof sharedTasks.value> = {
    projects: [],
    this_week: [],
    today: [],
    in_progress: [],
    done: [],
  };
  sharedTasks.value.forEach((t) => {
    if (groups[t.status]) groups[t.status].push(t);
  });
  return groups;
});

const statusColumns: { id: SharedTaskStatus; label: string }[] = [
  { id: 'this_week', label: 'This Week' },
  { id: 'today', label: 'Today' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

async function handleAddTask() {
  const title = newTaskTitle.value.trim();
  if (!title) return;
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  adding.value = true;
  try {
    await tasksStore.createSharedTask(teamId, title, 'today', {
      // No userId — goes into shared pool
    });
    newTaskTitle.value = '';
  } finally {
    adding.value = false;
  }
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

async function handleAssignToMe(taskId: string) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !authStore.user) return;
  await tasksStore.updateSharedTask(teamId, taskId, {
    userId: authStore.user.id,
    assignedTo: authStore.user.displayName ?? authStore.user.email,
  });
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Shared Lists</h1>
          <p class="text-sm text-muted mt-1">Team shared task pool — {{ sharedTasks.length }} tasks</p>
        </div>
      </div>
    </div>

    <div class="page-body">
      <!-- Add task -->
      <div class="flex gap-2 mb-4">
        <input
          v-model="newTaskTitle"
          class="form-input"
          style="flex:1;"
          placeholder="Add a shared task anyone can pick up..."
          @keydown.enter="handleAddTask"
        />
        <button class="btn btn-primary" :disabled="adding || !newTaskTitle.trim()" @click="handleAddTask">
          + Add
        </button>
      </div>

      <!-- Search -->
      <SearchBar v-model="search" placeholder="Search shared tasks..." class="mb-4" style="max-width:400px;" />

      <!-- Loading -->
      <div v-if="tasksStore.loadingShared" class="empty-state">
        <div class="spinner" />
        <span>Loading shared tasks...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="sharedTasks.length === 0" class="empty-state">
        <span style="font-size:28px;">⊞</span>
        <div class="font-medium">No shared tasks yet</div>
        <div class="text-sm">Add tasks that any team member can pick up</div>
      </div>

      <!-- Columnar view -->
      <div v-else style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div v-for="col in statusColumns" :key="col.id">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium text-sm">{{ col.label }}</span>
            <span class="badge badge-secondary">{{ tasksByStatus[col.id].length }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <div v-if="tasksByStatus[col.id].length === 0" class="text-xs text-muted" style="padding:8px 0;">
              Empty
            </div>
            <div
              v-for="task in tasksByStatus[col.id]"
              :key="task.id"
              class="task-card"
              style="position:relative;"
            >
              <div class="flex items-start gap-2">
                <input
                  type="checkbox"
                  class="checkbox"
                  :checked="task.isCompleted"
                  @change="handleToggle(task.id, task.isCompleted)"
                />
                <span
                  class="text-sm flex-1"
                  :style="{ textDecoration: task.isCompleted ? 'line-through' : 'none', color: task.isCompleted ? 'var(--color-text-muted)' : '' }"
                >
                  {{ task.title }}
                </span>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <span v-if="task.assignedTo" class="badge badge-secondary text-xs">{{ task.assignedTo }}</span>
                <span v-else>
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;" @click="handleAssignToMe(task.id)">
                    Assign to me
                  </button>
                </span>
                <button
                  class="btn btn-ghost btn-sm btn-icon"
                  style="padding:2px;margin-left:auto;color:var(--color-text-muted);"
                  @click="handleDelete(task.id)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
