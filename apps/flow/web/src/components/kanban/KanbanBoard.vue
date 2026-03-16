<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { useSharedTasks } from '@/composables/useSharedTasks';
import { useHierarchy } from '@/composables/useHierarchy';
import { useSprintsStore } from '@/stores/sprints.store';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import KanbanColumn from './KanbanColumn.vue';
import KanbanCard from './KanbanCard.vue';
import SprintColumn from './SprintColumn.vue';
import HierarchySidebar from './HierarchySidebar.vue';
import TaskDetailDialog from './TaskDetailDialog.vue';
import type { SharedTaskResponseDto, SharedTaskStatus } from '@/types/flow';

// ─── Stores ───────────────────────────────────────────────────────────────────

const teamsStore = useTeamsStore();
const authStore = useAuthStore();
const sprintsStore = useSprintsStore();

// ─── Reactive team ID ─────────────────────────────────────────────────────────

const teamId = computed(() => teamsStore.currentTeamId);

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type BoardTab = 'planning' | 'doing';
const activeTab = ref<BoardTab>('doing');

// ─── Shared tasks composable ──────────────────────────────────────────────────

const filterUserId = computed(() => showSharedPool.value ? null : (authStore.user?.id ?? null));
const includeCollaborated = ref(true);
const filterProjectId = ref<string | null>(null);

const {
  sharedTasks,
  loading,
  tasksByStatus,
  sharedPoolTasks,
  addTask,
  updateTaskStatus,
  toggleTask,
  deleteTask,
  assignTask,
  updateTaskSprint,
  updateTaskDueDate,
  reload,
} = useSharedTasks({ teamId, filterUserId, includeCollaborated, filterProjectId });

// ─── Hierarchy composable ─────────────────────────────────────────────────────

const {
  efforts,
  projects,
  hierarchyTasks,
  loading: hierarchyLoading,
  addEffort,
  addProject,
  addTask: addHierarchyTask,
  updateEffort,
  updateProject,
  deleteEffort,
  deleteProject,
} = useHierarchy(teamId);

// ─── Sprint state ─────────────────────────────────────────────────────────────

const selectedSprint = ref(sprintsStore.activeSprint);
const sprintNewTaskTitle = ref('');

// Keep selectedSprint in sync with store
watch(
  () => sprintsStore.activeSprint,
  (active) => {
    if (active && !selectedSprint.value) {
      selectedSprint.value = active;
    }
  },
);

watch(teamId, async (id) => {
  if (id) {
    await sprintsStore.loadSprints(id);
    if (!selectedSprint.value) {
      selectedSprint.value = sprintsStore.activeSprint ?? (sprintsStore.sprints[0] ?? null);
    }
  }
}, { immediate: true });

// ─── Shared pool toggle ───────────────────────────────────────────────────────

const showSharedPool = ref(false);

// ─── Task detail dialog ───────────────────────────────────────────────────────

const selectedTask = ref<SharedTaskResponseDto | null>(null);

function openTask(task: SharedTaskResponseDto) {
  selectedTask.value = task;
}

// ─── Subtasks lookup ──────────────────────────────────────────────────────────

function subtasksFor(taskId: string): SharedTaskResponseDto[] {
  return sharedTasks.value.filter((t) => t.parentTaskId === taskId);
}

// ─── Add task inputs ──────────────────────────────────────────────────────────

const newTaskInputs = ref<Record<string, string>>({
  this_week: '',
  today: '',
  in_progress: '',
  done: '',
});

// ─── Doing mode columns ────────────────────────────────────────────────────────

const doingColumns: { id: SharedTaskStatus; title: string }[] = [
  { id: 'this_week', title: 'This Week' },
  { id: 'today', title: 'Today' },
  { id: 'in_progress', title: 'In Progress' },
];

const dragOverColumn = ref<string | null>(null);

// ─── Add task handlers ────────────────────────────────────────────────────────

async function handleAddTask(status: SharedTaskStatus) {
  const title = newTaskInputs.value[status]?.trim();
  if (!title) return;
  await addTask(title, status, {
    userId: authStore.user?.id,
    assignedTo: authStore.user?.displayName ?? authStore.user?.email,
    sprintId: selectedSprint.value?.id,
  });
  newTaskInputs.value[status] = '';
}

async function handleAddSprintTask(title: string) {
  if (!title.trim()) return;
  await addTask(title.trim(), 'this_week', {
    userId: authStore.user?.id,
    assignedTo: authStore.user?.displayName ?? authStore.user?.email,
    sprintId: selectedSprint.value?.id,
  });
  sprintNewTaskTitle.value = '';
}

// ─── Toggle / Delete ──────────────────────────────────────────────────────────

async function handleToggle(taskId: string, isCompleted: boolean) {
  await toggleTask(taskId, isCompleted);
  if (selectedTask.value?.id === taskId) {
    const updated = sharedTasks.value.find((t) => t.id === taskId);
    if (updated) selectedTask.value = updated;
  }
}

async function handleDelete(taskId: string) {
  await deleteTask(taskId);
  if (selectedTask.value?.id === taskId) selectedTask.value = null;
}

// ─── Drag and drop ────────────────────────────────────────────────────────────

// Track the item being dragged for VueDraggable cross-list updates
function onDragEnd(status: SharedTaskStatus, tasks: SharedTaskResponseDto[]) {
  // After drag, sync each task's status to the column it landed in
  tasks.forEach(async (task) => {
    if (task.status !== status) {
      await updateTaskStatus(task.id, status);
    }
  });
}

// Native drag support for hierarchy tasks → sprint column
function handleSprintDrop(e: DragEvent) {
  const taskId = e.dataTransfer?.getData('text/plain');
  const source = e.dataTransfer?.getData('source');
  if (!taskId || source !== 'hierarchy') return;
  updateTaskSprint(taskId, selectedSprint.value?.id ?? null);
}

// ─── Done column tasks ────────────────────────────────────────────────────────

const doneTasks = computed(() => tasksByStatus.value['done'] ?? []);

// ─── Sprint tasks (filtered by selected sprint) ───────────────────────────────

const sprintTasks = computed(() => {
  if (!selectedSprint.value) return [];
  return sharedTasks.value.filter(
    (t) => t.sprintId === selectedSprint.value!.id && !t.parentTaskId,
  );
});

// ─── Detail dialog handlers ───────────────────────────────────────────────────

async function handleAddSubtask(parentId: string, title: string) {
  await addTask(title, 'today', {
    userId: authStore.user?.id,
    assignedTo: authStore.user?.displayName ?? authStore.user?.email,
    parentTaskId: parentId,
  });
  await reload();
}

async function handleAssignToMe() {
  if (!selectedTask.value) return;
  await assignTask(
    selectedTask.value.id,
    authStore.user?.id ?? '',
    authStore.user?.displayName ?? authStore.user?.email ?? '',
  );
  await reload();
  const updated = sharedTasks.value.find((t) => t.id === selectedTask.value?.id);
  if (updated) selectedTask.value = updated;
}

async function handleUnassign() {
  if (!selectedTask.value) return;
  await assignTask(selectedTask.value.id, '', '');
  await reload();
}

async function handleUpdateDueDate(taskId: string, dueDate: string | null) {
  await updateTaskDueDate(taskId, dueDate);
}

// ─── Sprint management ────────────────────────────────────────────────────────

async function handleCreateSprint(name: string, startDate?: string, endDate?: string) {
  if (!teamId.value) return;
  const sprint = await sprintsStore.createSprint(teamId.value, name, { startDate, endDate });
  selectedSprint.value = sprint;
}

// ─── Hierarchy handlers ───────────────────────────────────────────────────────

async function handleAddEffort(name: string) {
  await addEffort(name);
}

async function handleAddProject(effortId: string, name: string) {
  await addProject(effortId, name);
}

async function handleAddHierarchyTask(projectId: string, title: string) {
  await addHierarchyTask(projectId, title);
}

async function handleRenameEffort(effortId: string, name: string) {
  await updateEffort(effortId, { name });
}

async function handleRenameProject(projectId: string, name: string) {
  await updateProject(projectId, { name });
}

async function handleDeleteEffort(effortId: string) {
  await deleteEffort(effortId);
}

async function handleDeleteProject(projectId: string) {
  await deleteProject(projectId);
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
    <!-- Header bar -->
    <div class="page-header" style="margin-bottom: 12px; flex-shrink: 0;">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Kanban Board</h1>
          <p class="text-sm text-muted mt-1">
            {{ selectedSprint ? `Sprint: ${selectedSprint.name}` : 'No sprint selected' }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Shared pool toggle -->
          <button
            class="btn btn-outline btn-sm"
            :style="showSharedPool ? 'border-color: var(--color-primary); color: var(--color-primary);' : ''"
            @click="showSharedPool = !showSharedPool"
          >
            ⊞ Shared Pool ({{ sharedPoolTasks.length }})
          </button>

          <!-- Tab switcher -->
          <div class="tabs">
            <button
              class="tab"
              :class="{ active: activeTab === 'planning' }"
              @click="activeTab = 'planning'"
            >
              Planning
            </button>
            <button
              class="tab"
              :class="{ active: activeTab === 'doing' }"
              @click="activeTab = 'doing'"
            >
              Doing
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Shared pool strip -->
    <div
      v-if="showSharedPool"
      style="
        margin: 0 24px 12px;
        padding: 12px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        overflow-x: auto;
        flex-shrink: 0;
      "
    >
      <div class="font-medium text-sm mb-2">Shared Pool — Unassigned Tasks</div>
      <div class="flex gap-3">
        <div v-if="sharedPoolTasks.length === 0" class="text-sm text-muted">
          No shared tasks yet
        </div>
        <button
          v-for="task in sharedPoolTasks"
          :key="task.id"
          class="task-card"
          style="min-width: 180px; text-align: left;"
          @click="openTask(task)"
        >
          <div class="text-sm truncate">{{ task.title }}</div>
          <div v-if="task.pomodoroCount > 0" class="text-xs" style="color: #ef4444; margin-top: 4px;">
            🍅 {{ task.pomodoroCount }}
          </div>
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="empty-state" style="flex: 1;">
      <div class="spinner" />
      <span>Loading tasks...</span>
    </div>

    <!-- Board content -->
    <div v-else style="flex: 1; overflow: hidden; padding: 0 24px 24px;">

      <!-- ── PLANNING MODE ──────────────────────────────────────── -->
      <div
        v-if="activeTab === 'planning'"
        style="display: flex; gap: 16px; height: 100%;"
      >
        <!-- Hierarchy sidebar -->
        <HierarchySidebar
          :efforts="efforts"
          :projects="projects"
          :hierarchy-tasks="hierarchyTasks"
          :selected-project-id="filterProjectId"
          :loading="hierarchyLoading"
          @select-project="(id) => filterProjectId = id"
          @add-effort="handleAddEffort"
          @add-project="handleAddProject"
          @add-task="handleAddHierarchyTask"
          @rename-effort="handleRenameEffort"
          @rename-project="handleRenameProject"
          @delete-effort="handleDeleteEffort"
          @delete-project="handleDeleteProject"
        />

        <!-- Sprint column in planning mode -->
        <SprintColumn
          :sprints="sprintsStore.sprints"
          :selected-sprint="selectedSprint"
          v-model:new-task-title="sprintNewTaskTitle"
          style="flex: 1;"
          @select-sprint="(s) => selectedSprint = s"
          @add-task="handleAddSprintTask"
          @create-sprint="handleCreateSprint"
          @dragover.prevent
          @drop="handleSprintDrop"
        >
          <div v-if="sprintTasks.length === 0" class="empty-state" style="padding: 20px;">
            <span class="text-xs text-muted">No tasks in this sprint. Drag tasks from the hierarchy or add above.</span>
          </div>
          <KanbanCard
            v-for="task in sprintTasks"
            :key="task.id"
            :task="task"
            :subtasks="subtasksFor(task.id)"
            :is-own-board="task.userId === authStore.user?.id || !task.userId"
            @click="openTask"
            @toggle="handleToggle"
            @delete="handleDelete"
          />
        </SprintColumn>
      </div>

      <!-- ── DOING MODE ─────────────────────────────────────────── -->
      <div
        v-else
        class="kanban-wrap"
        style="height: 100%;"
      >
        <!-- Sprint column -->
        <SprintColumn
          :sprints="sprintsStore.sprints"
          :selected-sprint="selectedSprint"
          v-model:new-task-title="sprintNewTaskTitle"
          @select-sprint="(s) => selectedSprint = s"
          @add-task="handleAddSprintTask"
          @create-sprint="handleCreateSprint"
        >
          <div v-if="sprintTasks.length === 0" class="empty-state" style="padding: 20px;">
            <span class="text-xs text-muted">No tasks in sprint</span>
          </div>
          <KanbanCard
            v-for="task in sprintTasks"
            :key="task.id"
            :task="task"
            :subtasks="subtasksFor(task.id)"
            :is-own-board="task.userId === authStore.user?.id || !task.userId"
            @click="openTask"
            @toggle="handleToggle"
            @delete="handleDelete"
          />
        </SprintColumn>

        <!-- Status columns: This Week / Today / In Progress -->
        <KanbanColumn
          v-for="col in doingColumns"
          :key="col.id"
          :id="col.id"
          :title="col.title"
          :task-count="tasksByStatus[col.id]?.length ?? 0"
          :is-drag-over="dragOverColumn === col.id"
          @dragover.prevent="dragOverColumn = col.id"
          @dragleave="dragOverColumn = null"
          @drop.stop="dragOverColumn = null"
        >
          <!-- Add task input -->
          <div style="padding: 8px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;">
            <div class="flex gap-1">
              <input
                v-model="newTaskInputs[col.id]"
                class="form-input"
                style="flex: 1; font-size: 12px; padding: 5px 8px;"
                placeholder="Add task..."
                @keydown.enter="handleAddTask(col.id)"
              />
              <button
                class="btn btn-ghost btn-icon"
                style="padding: 5px;"
                @click="handleAddTask(col.id)"
              >
                +
              </button>
            </div>
          </div>

          <!-- Draggable task list -->
          <VueDraggable
            :model-value="tasksByStatus[col.id] ?? []"
            group="kanban-tasks"
            item-key="id"
            class="kanban-col-body"
            style="min-height: 60px;"
            @end="(evt) => onDragEnd(col.id, tasksByStatus[col.id] ?? [])"
          >
            <template #item="{ element: task }">
              <KanbanCard
                :task="task"
                :subtasks="subtasksFor(task.id)"
                :is-own-board="task.userId === authStore.user?.id || !task.userId"
                @click="openTask"
                @toggle="handleToggle"
                @delete="handleDelete"
              />
            </template>
            <template #empty>
              <div class="empty-state" style="padding: 20px;">
                <span class="text-xs text-muted">No tasks</span>
              </div>
            </template>
          </VueDraggable>
        </KanbanColumn>

        <!-- Done column -->
        <KanbanColumn
          id="done"
          title="Done"
          :task-count="doneTasks.length"
          :is-drag-over="dragOverColumn === 'done'"
          @dragover.prevent="dragOverColumn = 'done'"
          @dragleave="dragOverColumn = null"
          @drop.stop="dragOverColumn = null"
        >
          <!-- Add task input -->
          <div style="padding: 8px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;">
            <div class="flex gap-1">
              <input
                v-model="newTaskInputs['done']"
                class="form-input"
                style="flex: 1; font-size: 12px; padding: 5px 8px;"
                placeholder="Add task..."
                @keydown.enter="handleAddTask('done')"
              />
              <button
                class="btn btn-ghost btn-icon"
                style="padding: 5px;"
                @click="handleAddTask('done')"
              >
                +
              </button>
            </div>
          </div>

          <VueDraggable
            :model-value="doneTasks"
            group="kanban-tasks"
            item-key="id"
            class="kanban-col-body"
            style="min-height: 60px;"
            @end="() => onDragEnd('done', doneTasks)"
          >
            <template #item="{ element: task }">
              <KanbanCard
                :task="task"
                :subtasks="subtasksFor(task.id)"
                :is-own-board="task.userId === authStore.user?.id || !task.userId"
                @click="openTask"
                @toggle="handleToggle"
                @delete="handleDelete"
              />
            </template>
            <template #empty>
              <div class="empty-state" style="padding: 20px;">
                <span class="text-xs text-muted">No completed tasks</span>
              </div>
            </template>
          </VueDraggable>
        </KanbanColumn>
      </div>
    </div>

    <!-- Task detail dialog -->
    <TaskDetailDialog
      :task="selectedTask"
      :open="!!selectedTask"
      :current-user-id="authStore.user?.id"
      :current-user-name="authStore.user?.displayName ?? authStore.user?.email"
      :team-id="teamId"
      @close="selectedTask = null"
      @toggle="handleToggle"
      @delete="handleDelete"
      @add-subtask="handleAddSubtask"
      @assign-to-me="handleAssignToMe"
      @unassign="handleUnassign"
      @update-due-date="handleUpdateDueDate"
    />
  </div>
</template>
