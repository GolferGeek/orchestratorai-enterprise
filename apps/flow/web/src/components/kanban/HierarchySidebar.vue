<script setup lang="ts">
import { ref, watch } from 'vue';
import type { EffortResponse, ProjectResponse, TaskResponse } from '@/types/flow';

const props = defineProps<{
  efforts: EffortResponse[];
  projects: ProjectResponse[];
  hierarchyTasks: TaskResponse[];
  selectedProjectId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-project', projectId: string | null): void;
  (e: 'add-effort', name: string): void;
  (e: 'add-project', effortId: string, name: string): void;
  (e: 'add-task', projectId: string, title: string): void;
  (e: 'rename-effort', effortId: string, name: string): void;
  (e: 'rename-project', projectId: string, name: string): void;
  (e: 'delete-effort', effortId: string): void;
  (e: 'delete-project', projectId: string): void;
  (e: 'drag-task-to-sprint', taskId: string): void;
}>();

// Expanded state
const expandedEfforts = ref<Set<string>>(new Set());
const expandedProjects = ref<Set<string>>(new Set());

// Inline editing state
const editingEffortId = ref<string | null>(null);
const editingEffortName = ref('');
const editingProjectId = ref<string | null>(null);
const editingProjectName = ref('');

// Add input state
const addingEffortName = ref('');
const addingProjectForEffort = ref<string | null>(null);
const addingProjectName = ref('');
const addingTaskForProject = ref<string | null>(null);
const addingTaskName = ref('');

// Auto-expand first effort when loaded
watch(
  () => props.efforts,
  (efforts) => {
    if (efforts.length > 0 && expandedEfforts.value.size === 0) {
      expandedEfforts.value.add(efforts[0].id);
    }
  },
  { immediate: true },
);

function projectsForEffort(effortId: string): ProjectResponse[] {
  return props.projects.filter((p) => p.effortId === effortId);
}

function tasksForProject(projectId: string): TaskResponse[] {
  return props.hierarchyTasks.filter((t) => t.projectId === projectId);
}

function toggleEffort(effortId: string) {
  if (expandedEfforts.value.has(effortId)) {
    expandedEfforts.value.delete(effortId);
  } else {
    expandedEfforts.value.add(effortId);
  }
}

function toggleProject(projectId: string) {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId);
  } else {
    expandedProjects.value.add(projectId);
  }
}

// Effort editing
function startEditEffort(effort: EffortResponse) {
  editingEffortId.value = effort.id;
  editingEffortName.value = effort.name;
}

function commitEditEffort(effortId: string) {
  const name = editingEffortName.value.trim();
  if (name) emit('rename-effort', effortId, name);
  editingEffortId.value = null;
}

// Project editing
function startEditProject(project: ProjectResponse) {
  editingProjectId.value = project.id;
  editingProjectName.value = project.name;
}

function commitEditProject(projectId: string) {
  const name = editingProjectName.value.trim();
  if (name) emit('rename-project', projectId, name);
  editingProjectId.value = null;
}

// Adding efforts
function handleAddEffort() {
  const name = addingEffortName.value.trim();
  if (!name) return;
  emit('add-effort', name);
  addingEffortName.value = '';
}

// Adding projects
function handleAddProject(effortId: string) {
  const name = addingProjectName.value.trim();
  if (!name) return;
  emit('add-project', effortId, name);
  addingProjectName.value = '';
  addingProjectForEffort.value = null;
}

// Adding tasks
function handleAddTask(projectId: string) {
  const name = addingTaskName.value.trim();
  if (!name) return;
  emit('add-task', projectId, name);
  addingTaskName.value = '';
  addingTaskForProject.value = null;
}

// Drag task to sprint
function handleTaskDragStart(e: DragEvent, taskId: string) {
  e.dataTransfer?.setData('text/plain', taskId);
  e.dataTransfer?.setData('source', 'hierarchy');
}
</script>

<template>
  <div
    style="
      width: 260px;
      flex-shrink: 0;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    "
  >
    <!-- Header -->
    <div
      style="
        padding: 12px 14px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      "
    >
      <span class="font-medium text-sm">Planning Hierarchy</span>
      <button
        v-if="selectedProjectId"
        class="btn btn-ghost btn-sm"
        style="font-size: 11px;"
        @click="emit('select-project', null)"
      >
        Show All
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="empty-state" style="padding: 24px;">
      <div class="spinner" />
    </div>

    <!-- Tree -->
    <div v-else style="flex: 1; overflow-y: auto; padding: 8px;">
      <div v-if="efforts.length === 0" class="text-xs text-muted" style="padding: 8px;">
        No efforts yet. Create one below.
      </div>

      <!-- Efforts -->
      <div v-for="effort in efforts" :key="effort.id" style="margin-bottom: 4px;">
        <!-- Effort row -->
        <div
          class="flex items-center gap-1"
          style="
            padding: 5px 6px;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.1s;
          "
          :style="{ background: expandedEfforts.has(effort.id) ? 'var(--color-bg-secondary)' : 'transparent' }"
          @mouseenter="(e) => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)'"
          @mouseleave="(e) => (e.currentTarget as HTMLElement).style.background = expandedEfforts.has(effort.id) ? 'var(--color-bg-secondary)' : 'transparent'"
        >
          <button
            class="btn btn-ghost btn-icon"
            style="padding: 2px; color: var(--color-text-muted); font-size: 11px;"
            @click="toggleEffort(effort.id)"
          >
            {{ expandedEfforts.has(effort.id) ? '▾' : '▸' }}
          </button>

          <!-- Editable name -->
          <input
            v-if="editingEffortId === effort.id"
            v-model="editingEffortName"
            class="form-input"
            style="flex: 1; font-size: 12px; padding: 2px 6px;"
            @keydown.enter="commitEditEffort(effort.id)"
            @keydown.escape="editingEffortId = null"
            @blur="commitEditEffort(effort.id)"
            autofocus
          />
          <span
            v-else
            class="flex-1 font-medium text-sm truncate"
            @dblclick="startEditEffort(effort)"
          >
            {{ effort.name }}
          </span>

          <!-- Effort actions -->
          <div class="flex gap-1" style="flex-shrink: 0;">
            <button
              class="btn btn-ghost btn-icon"
              style="padding: 2px; font-size: 11px; color: var(--color-text-muted);"
              title="Add project"
              @click.stop="addingProjectForEffort = effort.id; expandedEfforts.add(effort.id);"
            >
              +
            </button>
            <button
              class="btn btn-ghost btn-icon"
              style="padding: 2px; font-size: 10px; color: var(--color-text-muted);"
              title="Delete effort"
              @click.stop="emit('delete-effort', effort.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Projects -->
        <div
          v-if="expandedEfforts.has(effort.id)"
          style="margin-left: 18px; border-left: 1px solid var(--color-border); padding-left: 8px;"
        >
          <!-- Add project input -->
          <div v-if="addingProjectForEffort === effort.id" style="padding: 4px 0;">
            <div class="flex gap-1">
              <input
                v-model="addingProjectName"
                class="form-input"
                style="flex: 1; font-size: 12px; padding: 3px 6px;"
                placeholder="Project name..."
                autofocus
                @keydown.enter="handleAddProject(effort.id)"
                @keydown.escape="addingProjectForEffort = null"
              />
              <button class="btn btn-ghost btn-icon" style="padding: 3px;" @click="handleAddProject(effort.id)">✓</button>
              <button class="btn btn-ghost btn-icon" style="padding: 3px; color: var(--color-text-muted);" @click="addingProjectForEffort = null">✕</button>
            </div>
          </div>

          <div v-if="projectsForEffort(effort.id).length === 0 && addingProjectForEffort !== effort.id" class="text-xs text-muted" style="padding: 4px 0;">
            No projects
          </div>

          <div v-for="project in projectsForEffort(effort.id)" :key="project.id" style="margin-bottom: 2px;">
            <!-- Project row -->
            <div
              class="flex items-center gap-1"
              style="padding: 4px 5px; border-radius: 4px; cursor: pointer; transition: background 0.1s;"
              :style="{
                background: selectedProjectId === project.id
                  ? 'rgba(124, 106, 255, 0.15)'
                  : 'transparent',
                color: selectedProjectId === project.id ? 'var(--color-primary)' : 'inherit',
              }"
              @click="emit('select-project', project.id)"
            >
              <button
                class="btn btn-ghost btn-icon"
                style="padding: 2px; font-size: 10px; color: var(--color-text-muted);"
                @click.stop="toggleProject(project.id)"
              >
                {{ expandedProjects.has(project.id) ? '▾' : '▸' }}
              </button>

              <!-- Editable name -->
              <input
                v-if="editingProjectId === project.id"
                v-model="editingProjectName"
                class="form-input"
                style="flex: 1; font-size: 11px; padding: 2px 4px;"
                @keydown.enter="commitEditProject(project.id)"
                @keydown.escape="editingProjectId = null"
                @blur="commitEditProject(project.id)"
                @click.stop
                autofocus
              />
              <span
                v-else
                class="flex-1 text-sm truncate"
                @dblclick.stop="startEditProject(project)"
              >
                {{ project.name }}
              </span>

              <!-- Project actions -->
              <div class="flex gap-1" style="flex-shrink: 0;">
                <button
                  class="btn btn-ghost btn-icon"
                  style="padding: 2px; font-size: 11px; color: var(--color-text-muted);"
                  title="Add task"
                  @click.stop="addingTaskForProject = project.id; expandedProjects.add(project.id);"
                >
                  +
                </button>
                <button
                  class="btn btn-ghost btn-icon"
                  style="padding: 2px; font-size: 10px; color: var(--color-text-muted);"
                  title="Delete project"
                  @click.stop="emit('delete-project', project.id)"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Tasks under project -->
            <div
              v-if="expandedProjects.has(project.id)"
              style="margin-left: 16px; border-left: 1px solid var(--color-border); padding-left: 8px;"
            >
              <!-- Add task input -->
              <div v-if="addingTaskForProject === project.id" style="padding: 3px 0;">
                <div class="flex gap-1">
                  <input
                    v-model="addingTaskName"
                    class="form-input"
                    style="flex: 1; font-size: 11px; padding: 3px 6px;"
                    placeholder="Task title..."
                    autofocus
                    @keydown.enter="handleAddTask(project.id)"
                    @keydown.escape="addingTaskForProject = null"
                  />
                  <button class="btn btn-ghost btn-icon" style="padding: 3px;" @click="handleAddTask(project.id)">✓</button>
                  <button class="btn btn-ghost btn-icon" style="padding: 3px; color: var(--color-text-muted);" @click="addingTaskForProject = null">✕</button>
                </div>
              </div>

              <div v-if="tasksForProject(project.id).length === 0 && addingTaskForProject !== project.id" class="text-xs text-muted" style="padding: 3px 0;">
                No tasks
              </div>

              <div
                v-for="task in tasksForProject(project.id)"
                :key="task.id"
                class="flex items-center gap-1"
                style="
                  padding: 3px 5px;
                  border-radius: 4px;
                  cursor: grab;
                  font-size: 12px;
                  transition: background 0.1s;
                "
                draggable="true"
                @dragstart="handleTaskDragStart($event, task.id)"
                @mouseenter="(e) => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-secondary)'"
                @mouseleave="(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'"
              >
                <span style="color: var(--color-text-muted); font-size: 10px;">⠿</span>
                <span class="flex-1 truncate" :title="task.title">{{ task.title }}</span>
                <span v-if="task.isMilestone" class="text-xs" style="color: #f59e0b;" title="Milestone">★</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add effort input -->
      <div style="padding: 8px 4px 4px;">
        <div class="flex gap-1">
          <input
            v-model="addingEffortName"
            class="form-input"
            style="flex: 1; font-size: 12px; padding: 4px 8px;"
            placeholder="New effort..."
            @keydown.enter="handleAddEffort"
          />
          <button class="btn btn-ghost btn-icon" style="padding: 4px;" @click="handleAddEffort">+</button>
        </div>
      </div>
    </div>
  </div>
</template>
