<script setup lang="ts">
import { ref } from 'vue';
import type { SharedTaskStatus } from '@/types/flow';

const props = defineProps<{
  defaultStatus?: SharedTaskStatus;
  projectId?: string | null;
  sprintId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'submit', data: { title: string; status: SharedTaskStatus; description?: string; dueDate?: string }): void;
  (e: 'cancel'): void;
}>();

const title = ref('');
const status = ref<SharedTaskStatus>(props.defaultStatus ?? 'today');
const description = ref('');
const dueDate = ref('');

const statuses: { value: SharedTaskStatus; label: string }[] = [
  { value: 'this_week', label: 'This Week' },
  { value: 'today', label: 'Today' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

function handleSubmit() {
  if (!title.value.trim()) return;
  emit('submit', {
    title: title.value.trim(),
    status: status.value,
    description: description.value || undefined,
    dueDate: dueDate.value || undefined,
  });
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  if (e.key === 'Escape') emit('cancel');
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="flex flex-col gap-3">
    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Title *</label>
      <input
        v-model="title"
        class="form-input"
        style="width:100%;"
        placeholder="Task title"
        autofocus
        @keydown="handleKeyDown"
      />
    </div>

    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Status</label>
      <select v-model="status" class="form-input" style="width:100%;">
        <option v-for="s in statuses" :key="s.value" :value="s.value">
          {{ s.label }}
        </option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Description</label>
      <textarea
        v-model="description"
        class="form-textarea"
        style="width:100%;"
        placeholder="Optional description"
        rows="2"
      />
    </div>

    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Due Date</label>
      <input v-model="dueDate" type="date" class="form-input" style="width:100%;" />
    </div>

    <div class="flex gap-2 justify-end">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="!title.trim()">
        Create Task
      </button>
    </div>
  </form>
</template>
