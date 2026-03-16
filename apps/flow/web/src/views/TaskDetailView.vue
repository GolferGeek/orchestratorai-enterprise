<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTasksStore } from '@/stores/tasks.store';
import { useTeamsStore } from '@/stores/teams.store';
import TaskStatusBadge from '@/components/tasks/TaskStatusBadge.vue';
import TaskCard from '@/components/tasks/TaskCard.vue';
import type { SharedTaskStatus } from '@/types/flow';

const route = useRoute();
const router = useRouter();
const tasksStore = useTasksStore();
const teamsStore = useTeamsStore();

const taskId = computed(() => route.params.taskId as string);
const task = computed(() => tasksStore.sharedTasks.find((t) => t.id === taskId.value) ?? null);
const subtasks = computed(() => tasksStore.subtasksFor(taskId.value));

const editing = ref(false);
const editTitle = ref('');
const editDescription = ref('');
const editStatus = ref<SharedTaskStatus>('today');

onMounted(async () => {
  if (!task.value && teamsStore.currentTeamId) {
    await tasksStore.loadSharedTasks(teamsStore.currentTeamId);
  }
  if (task.value) {
    editTitle.value = task.value.title;
    editDescription.value = task.value.description ?? '';
    editStatus.value = task.value.status;
  }
});

async function handleSave() {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !task.value) return;
  await tasksStore.updateSharedTask(teamId, task.value.id, {
    title: editTitle.value,
    description: editDescription.value || undefined,
    status: editStatus.value,
  });
  editing.value = false;
}

async function handleDelete() {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !task.value) return;
  await tasksStore.deleteSharedTask(teamId, task.value.id);
  router.push('/tasks');
}

async function handleToggle(subtaskId: string, isCompleted: boolean) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await tasksStore.toggleTask(teamId, subtaskId, isCompleted);
}

const statuses: SharedTaskStatus[] = ['this_week', 'today', 'in_progress', 'done'];
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" @click="router.push('/tasks')">← Back</button>
        <h1 class="text-xl font-semibold">Task Detail</h1>
      </div>
    </div>

    <div class="page-body" style="max-width:720px;">
      <div v-if="!task" class="empty-state">
        <div class="spinner" />
        <span>Loading task...</span>
      </div>

      <template v-else>
        <!-- View mode -->
        <div v-if="!editing" class="card">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div style="flex:1;">
              <h2 class="font-semibold" style="font-size:18px;">{{ task.title }}</h2>
              <div class="flex items-center gap-2 mt-2">
                <TaskStatusBadge :status="task.status" />
                <span v-if="task.assignedTo" class="badge badge-secondary">{{ task.assignedTo }}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-outline btn-sm" @click="editing = true">Edit</button>
              <button class="btn btn-destructive btn-sm" @click="handleDelete">Delete</button>
            </div>
          </div>

          <div v-if="task.description" class="mb-4">
            <div class="form-label">Description</div>
            <div class="text-sm" style="white-space:pre-wrap;">{{ task.description }}</div>
          </div>

          <div class="flex gap-6">
            <div v-if="task.dueDate">
              <div class="form-label">Due Date</div>
              <div class="text-sm">{{ new Date(task.dueDate).toLocaleDateString() }}</div>
            </div>
            <div>
              <div class="form-label">Pomodoros</div>
              <div class="text-sm">🍅 {{ task.pomodoroCount }}</div>
            </div>
          </div>
        </div>

        <!-- Edit mode -->
        <div v-else class="card">
          <h2 class="font-semibold mb-4">Edit Task</h2>
          <div class="flex flex-col gap-3">
            <div>
              <label class="form-label">Title</label>
              <input v-model="editTitle" class="form-input" style="width:100%;" />
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="editDescription" class="form-textarea" style="width:100%;" rows="3" />
            </div>
            <div>
              <label class="form-label">Status</label>
              <select v-model="editStatus" class="form-input" style="width:100%;">
                <option v-for="s in statuses" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
              </select>
            </div>
            <div class="flex gap-2 justify-end">
              <button class="btn btn-ghost" @click="editing = false">Cancel</button>
              <button class="btn btn-primary" @click="handleSave">Save</button>
            </div>
          </div>
        </div>

        <!-- Subtasks -->
        <div v-if="subtasks.length > 0" class="mt-4">
          <h3 class="font-semibold mb-3">Subtasks ({{ subtasks.length }})</h3>
          <div class="flex flex-col gap-2">
            <TaskCard
              v-for="subtask in subtasks"
              :key="subtask.id"
              :task="subtask"
              :is-own-board="true"
              @toggle="handleToggle"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
