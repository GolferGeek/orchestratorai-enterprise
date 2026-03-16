<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  SharedTaskResponseDto,
  TaskCollaboratorResponse,
  TaskWatcherResponse,
} from '@/types/flow';
import { flowApiService } from '@/services/flow-api.service';

const props = defineProps<{
  task: SharedTaskResponseDto | null;
  open: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  teamId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggle', taskId: string, isCompleted: boolean): void;
  (e: 'delete', taskId: string): void;
  (e: 'add-subtask', parentId: string, title: string): void;
  (e: 'assign-to-me'): void;
  (e: 'unassign'): void;
  (e: 'update-due-date', taskId: string, dueDate: string | null): void;
}>();

const newSubtaskTitle = ref('');
const guestName = ref('');
const showGuestInput = ref(false);
const collaborators = ref<TaskCollaboratorResponse[]>([]);
const watchers = ref<TaskWatcherResponse[]>([]);
const loadingCollab = ref(false);
const dueDateValue = ref('');

// Sync due date input when task changes
watch(
  () => props.task,
  (task) => {
    dueDateValue.value = task?.dueDate ? task.dueDate.slice(0, 10) : '';
    if (task && props.open) {
      loadCollaboration(task.id);
    }
  },
  { immediate: true },
);

watch(
  () => props.open,
  (open) => {
    if (open && props.task) {
      loadCollaboration(props.task.id);
    }
  },
);

async function loadCollaboration(taskId: string) {
  if (!props.teamId) return;
  loadingCollab.value = true;
  try {
    const [collabs, watchs] = await Promise.all([
      flowApiService.getTaskCollaborators(props.teamId, taskId),
      flowApiService.getTaskWatchers(props.teamId, taskId),
    ]);
    collaborators.value = collabs;
    watchers.value = watchs;
  } finally {
    loadingCollab.value = false;
  }
}

function handleAddSubtask() {
  const title = newSubtaskTitle.value.trim();
  if (!title || !props.task) return;
  emit('add-subtask', props.task.id, title);
  newSubtaskTitle.value = '';
}

function handleDueDateChange(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  dueDateValue.value = value;
  if (props.task) {
    emit('update-due-date', props.task.id, value || null);
  }
}

async function handleAddCollaborator() {
  if (!props.task || !props.teamId) return;
  const userId = showGuestInput.value ? null : (props.currentUserId ?? null);
  const guest = showGuestInput.value ? guestName.value.trim() || null : null;
  if (!userId && !guest) return;
  const collab = await flowApiService.createTaskCollaborator(props.teamId, props.task.id, {
    userId,
    guestName: guest,
  });
  collaborators.value.push(collab);
  guestName.value = '';
  showGuestInput.value = false;
}

async function handleRemoveCollaborator(collabId: string) {
  if (!props.teamId) return;
  await flowApiService.deleteTaskCollaborator(props.teamId, collabId);
  collaborators.value = collaborators.value.filter((c) => c.id !== collabId);
}

async function handleAddWatcher() {
  if (!props.task || !props.teamId) return;
  const userId = showGuestInput.value ? null : (props.currentUserId ?? null);
  const guest = showGuestInput.value ? guestName.value.trim() || null : null;
  if (!userId && !guest) return;
  const watcher = await flowApiService.createTaskWatcher(props.teamId, props.task.id, {
    userId,
    guestName: guest,
  });
  watchers.value.push(watcher);
  guestName.value = '';
  showGuestInput.value = false;
}

async function handleRemoveWatcher(watcherId: string) {
  if (!props.teamId) return;
  await flowApiService.deleteTaskWatcher(props.teamId, watcherId);
  watchers.value = watchers.value.filter((w) => w.id !== watcherId);
}

function collabLabel(c: TaskCollaboratorResponse): string {
  return c.guestName ?? c.userId ?? 'Unknown';
}

function watcherLabel(w: TaskWatcherResponse): string {
  return w.guestName ?? w.userId ?? 'Unknown';
}

function statusLabel(status: string): string {
  return status.replace('_', ' ');
}

function statusColor(status: string): string {
  switch (status) {
    case 'in_progress': return 'var(--color-primary)';
    case 'done': return 'var(--color-success)';
    case 'today': return '#f97316';
    case 'this_week': return '#eab308';
    default: return 'var(--color-text-muted)';
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && task"
      class="modal-overlay"
      @click.self="emit('close')"
    >
      <div class="modal" style="width: 520px;">
        <!-- Header -->
        <div class="modal-header">
          <h2 class="font-semibold" style="font-size: 16px;">Task Detail</h2>
          <button class="btn btn-ghost btn-icon" @click="emit('close')">✕</button>
        </div>

        <!-- Title -->
        <div class="mb-3">
          <div class="font-medium" style="font-size: 15px;">{{ task.title }}</div>
          <div v-if="task.description" class="text-sm text-muted mt-1">{{ task.description }}</div>
        </div>

        <!-- Status + assigned badges -->
        <div class="flex items-center gap-2 mb-3" style="flex-wrap: wrap;">
          <span
            class="badge"
            :style="{ background: statusColor(task.status), color: 'white' }"
          >
            {{ statusLabel(task.status) }}
          </span>
          <span v-if="task.assignedTo" class="badge badge-secondary">
            Assigned: {{ task.assignedTo }}
          </span>
          <span v-if="task.pomodoroCount > 0" class="text-xs" style="color: #ef4444;">
            🍅 {{ task.pomodoroCount }}
          </span>
        </div>

        <!-- Due date -->
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input
            type="date"
            class="form-input"
            style="width: auto;"
            :value="dueDateValue"
            @change="handleDueDateChange"
          />
          <button
            v-if="dueDateValue"
            class="btn btn-ghost btn-sm"
            style="margin-left: 8px; color: var(--color-text-muted);"
            @click="dueDateValue = ''; emit('update-due-date', task.id, null)"
          >
            Clear
          </button>
        </div>

        <!-- Completion + assignment actions -->
        <div class="flex items-center gap-2 mb-3">
          <label class="flex items-center gap-2 text-sm" style="cursor: pointer;">
            <input
              type="checkbox"
              class="checkbox"
              :checked="task.isCompleted"
              @change="emit('toggle', task.id, task.isCompleted)"
            />
            Mark complete
          </label>
          <button
            v-if="!task.userId || task.userId !== currentUserId"
            class="btn btn-outline btn-sm"
            @click="emit('assign-to-me')"
          >
            Assign to me
          </button>
          <button
            v-if="task.userId"
            class="btn btn-ghost btn-sm"
            @click="emit('unassign')"
          >
            Unassign
          </button>
        </div>

        <div class="divider" />

        <!-- Subtasks -->
        <div class="form-group">
          <div class="form-label">Subtasks</div>
          <div class="flex gap-1 mb-2">
            <input
              v-model="newSubtaskTitle"
              class="form-input"
              style="flex: 1; font-size: 12px; padding: 5px 8px;"
              placeholder="Add subtask..."
              @keydown.enter="handleAddSubtask"
            />
            <button class="btn btn-ghost btn-icon" style="padding: 5px;" @click="handleAddSubtask">+</button>
          </div>
          <p class="text-xs text-muted">Subtasks appear in the parent card's task view.</p>
        </div>

        <div class="divider" />

        <!-- Collaboration section -->
        <div class="form-group">
          <div class="form-label">Collaboration</div>

          <!-- Add collaborator/watcher controls -->
          <div class="flex gap-2 mb-2" style="flex-wrap: wrap;">
            <button
              v-if="!showGuestInput"
              class="btn btn-outline btn-sm"
              @click="handleAddCollaborator"
            >
              + Add me as collaborator
            </button>
            <button
              v-if="!showGuestInput"
              class="btn btn-outline btn-sm"
              @click="handleAddWatcher"
            >
              + Watch task
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click="showGuestInput = !showGuestInput"
            >
              {{ showGuestInput ? 'Cancel' : 'Add guest...' }}
            </button>
          </div>

          <!-- Guest name input -->
          <div v-if="showGuestInput" class="flex gap-1 mb-2">
            <input
              v-model="guestName"
              class="form-input"
              style="flex: 1; font-size: 12px; padding: 5px 8px;"
              placeholder="Guest name..."
              @keydown.enter="handleAddCollaborator"
            />
            <button class="btn btn-outline btn-sm" @click="handleAddCollaborator">Collab</button>
            <button class="btn btn-outline btn-sm" @click="handleAddWatcher">Watch</button>
          </div>

          <!-- Loading indicator -->
          <div v-if="loadingCollab" class="text-xs text-muted">Loading...</div>

          <!-- Collaborators list -->
          <div v-if="collaborators.length > 0" class="mb-2">
            <div class="text-xs text-muted mb-1">Collaborators</div>
            <div class="flex items-center gap-1" style="flex-wrap: wrap;">
              <span
                v-for="c in collaborators"
                :key="c.id"
                class="badge badge-secondary"
                style="gap: 4px;"
              >
                {{ collabLabel(c) }}
                <button
                  style="background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: 10px; padding: 0 2px;"
                  @click="handleRemoveCollaborator(c.id)"
                >
                  ✕
                </button>
              </span>
            </div>
          </div>

          <!-- Watchers list -->
          <div v-if="watchers.length > 0">
            <div class="text-xs text-muted mb-1">Watchers</div>
            <div class="flex items-center gap-1" style="flex-wrap: wrap;">
              <span
                v-for="w in watchers"
                :key="w.id"
                class="badge badge-secondary"
                style="gap: 4px;"
              >
                {{ watcherLabel(w) }}
                <button
                  style="background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: 10px; padding: 0 2px;"
                  @click="handleRemoveWatcher(w.id)"
                >
                  ✕
                </button>
              </span>
            </div>
          </div>
        </div>

        <div class="divider" />

        <!-- Delete -->
        <div class="flex justify-between items-center">
          <button
            class="btn btn-destructive btn-sm"
            @click="emit('delete', task.id); emit('close')"
          >
            Delete Task
          </button>
          <button class="btn btn-outline btn-sm" @click="emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
