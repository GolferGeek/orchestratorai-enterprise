<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SprintResponse } from '@/types/flow';

const props = defineProps<{
  sprints: SprintResponse[];
  selectedSprint: SprintResponse | null;
  newTaskTitle?: string;
}>();

const emit = defineEmits<{
  (e: 'select-sprint', sprint: SprintResponse): void;
  (e: 'add-task', title: string): void;
  (e: 'create-sprint', name: string, startDate?: string, endDate?: string): void;
  (e: 'update:newTaskTitle', value: string): void;
}>();

const showSprintManager = ref(false);
const newSprintName = ref('');
const newSprintStart = ref('');
const newSprintEnd = ref('');
const localNewTaskTitle = ref('');

const taskTitle = computed({
  get: () => props.newTaskTitle ?? localNewTaskTitle.value,
  set: (v) => {
    localNewTaskTitle.value = v;
    emit('update:newTaskTitle', v);
  },
});

function daysRemaining(sprint: SprintResponse): number | null {
  if (!sprint.endDate) return null;
  const end = new Date(sprint.endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

function sprintDateLabel(sprint: SprintResponse): string {
  if (!sprint.startDate && !sprint.endDate) return 'No dates set';
  const parts: string[] = [];
  if (sprint.startDate) parts.push(new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  if (sprint.endDate) parts.push(new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  return parts.join(' – ');
}

function daysRemainingColor(days: number | null): string {
  if (days === null) return 'var(--color-text-muted)';
  if (days < 0) return 'var(--color-destructive)';
  if (days <= 2) return '#f97316';
  if (days <= 5) return '#eab308';
  return 'var(--color-success)';
}

function handleAddTask() {
  const title = taskTitle.value.trim();
  if (!title) return;
  emit('add-task', title);
  taskTitle.value = '';
}

function handleCreateSprint() {
  const name = newSprintName.value.trim();
  if (!name) return;
  emit('create-sprint', name, newSprintStart.value || undefined, newSprintEnd.value || undefined);
  newSprintName.value = '';
  newSprintStart.value = '';
  newSprintEnd.value = '';
}

function generateNextSprints() {
  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const start = new Date(today);
    start.setDate(start.getDate() + i * 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    const name = `Sprint ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    emit(
      'create-sprint',
      name,
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    );
  }
}

const remaining = computed(() => {
  if (!props.selectedSprint) return null;
  return daysRemaining(props.selectedSprint);
});
</script>

<template>
  <div class="kanban-col" style="min-width: 300px;">
    <!-- Sprint selector header -->
    <div class="kanban-col-header" style="flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px;">
      <div class="flex items-center justify-between w-full">
        <span class="font-medium text-sm">Sprint</span>
        <button
          class="btn btn-ghost btn-sm"
          style="font-size: 11px;"
          @click="showSprintManager = true"
        >
          Manage
        </button>
      </div>

      <!-- Sprint dropdown -->
      <select
        v-if="sprints.length > 0"
        :value="selectedSprint?.id ?? ''"
        class="form-input"
        style="font-size: 12px; padding: 4px 8px; width: 100%;"
        @change="(e) => { const s = sprints.find(x => x.id === (e.target as HTMLSelectElement).value); if (s) emit('select-sprint', s); }"
      >
        <option value="" disabled>Select sprint...</option>
        <option v-for="s in sprints" :key="s.id" :value="s.id">
          {{ s.name }}{{ s.isActive ? ' (active)' : '' }}
        </option>
      </select>
      <div v-else class="text-xs text-muted">No sprints yet</div>

      <!-- Sprint date + days remaining -->
      <div v-if="selectedSprint" class="flex items-center gap-2 text-xs">
        <span class="text-muted">{{ sprintDateLabel(selectedSprint) }}</span>
        <span
          v-if="remaining !== null"
          :style="{ color: daysRemainingColor(remaining) }"
        >
          {{ remaining < 0 ? 'Overdue' : remaining === 0 ? 'Ends today' : `${remaining}d left` }}
        </span>
      </div>
    </div>

    <!-- Add task input -->
    <div style="padding: 8px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;">
      <div class="flex gap-1">
        <input
          v-model="taskTitle"
          class="form-input"
          style="flex: 1; font-size: 12px; padding: 5px 8px;"
          placeholder="Add task to sprint..."
          :disabled="!selectedSprint"
          @keydown.enter="handleAddTask"
        />
        <button
          class="btn btn-ghost btn-icon"
          style="padding: 5px;"
          :disabled="!selectedSprint"
          @click="handleAddTask"
        >
          +
        </button>
      </div>
    </div>

    <!-- Task cards slot -->
    <div class="kanban-col-body">
      <div v-if="!selectedSprint" class="empty-state" style="padding: 20px;">
        <span class="text-xs text-muted">Select a sprint to see tasks</span>
      </div>
      <slot v-else />
    </div>
  </div>

  <!-- Sprint Manager Dialog -->
  <div v-if="showSprintManager" class="modal-overlay" @click.self="showSprintManager = false">
    <div class="modal" style="width: 520px;">
      <div class="modal-header">
        <h2 class="font-semibold">Sprint Manager</h2>
        <button class="btn btn-ghost btn-icon" @click="showSprintManager = false">✕</button>
      </div>

      <!-- Existing sprints list -->
      <div class="mb-4">
        <div class="form-label">Sprints</div>
        <div v-if="sprints.length === 0" class="text-sm text-muted">No sprints yet.</div>
        <div
          v-for="s in sprints"
          :key="s.id"
          class="flex items-center justify-between"
          style="padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--radius); margin-bottom: 6px;"
        >
          <div>
            <span class="font-medium text-sm">{{ s.name }}</span>
            <span v-if="s.isActive" class="badge badge-success ml-2" style="font-size: 10px;">active</span>
          </div>
          <span class="text-xs text-muted">{{ sprintDateLabel(s) }}</span>
        </div>
      </div>

      <div class="divider" />

      <!-- Create sprint form -->
      <div class="form-group">
        <div class="form-label">Create New Sprint</div>
        <input
          v-model="newSprintName"
          class="form-input mb-2"
          placeholder="Sprint name..."
          @keydown.enter="handleCreateSprint"
        />
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="text-xs text-muted" style="display: block; margin-bottom: 4px;">Start date</label>
            <input v-model="newSprintStart" type="date" class="form-input w-full" style="font-size: 12px;" />
          </div>
          <div class="flex-1">
            <label class="text-xs text-muted" style="display: block; margin-bottom: 4px;">End date</label>
            <input v-model="newSprintEnd" type="date" class="form-input w-full" style="font-size: 12px;" />
          </div>
        </div>
        <button
          class="btn btn-primary btn-sm mt-2"
          :disabled="!newSprintName.trim()"
          @click="handleCreateSprint"
        >
          Create Sprint
        </button>
      </div>

      <div class="divider" />

      <!-- Generate next 4 sprints -->
      <div>
        <button class="btn btn-outline btn-sm" @click="generateNextSprints">
          Generate next 4 bi-weekly sprints
        </button>
        <p class="text-xs text-muted mt-1">Creates 4 x 2-week sprints starting from today.</p>
      </div>
    </div>
  </div>
</template>
