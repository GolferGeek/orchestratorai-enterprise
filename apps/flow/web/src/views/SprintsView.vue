<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSprintsStore } from '@/stores/sprints.store';
import { useTasksStore } from '@/stores/tasks.store';
import { useTeamsStore } from '@/stores/teams.store';
import SprintCard from '@/components/sprints/SprintCard.vue';

const sprintsStore = useSprintsStore();
const tasksStore = useTasksStore();
const teamsStore = useTeamsStore();

const showCreateForm = ref(false);
const newName = ref('');
const newDesc = ref('');
const newStartDate = ref('');
const newEndDate = ref('');
const creating = ref(false);

onMounted(async () => {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await Promise.all([
    sprintsStore.loadSprints(teamId),
    tasksStore.loadSharedTasks(teamId),
  ]);
});

function sprintTaskCount(sprintId: string): number {
  return tasksStore.sharedTasks.filter((t) => t.sprintId === sprintId).length;
}

function sprintDoneCount(sprintId: string): number {
  return tasksStore.sharedTasks.filter((t) => t.sprintId === sprintId && t.status === 'done').length;
}

async function handleCreate() {
  const teamId = teamsStore.currentTeamId;
  if (!teamId || !newName.value.trim()) return;
  creating.value = true;
  try {
    await sprintsStore.createSprint(teamId, newName.value.trim(), {
      description: newDesc.value || undefined,
      startDate: newStartDate.value || undefined,
      endDate: newEndDate.value || undefined,
    });
    newName.value = '';
    newDesc.value = '';
    newStartDate.value = '';
    newEndDate.value = '';
    showCreateForm.value = false;
  } finally {
    creating.value = false;
  }
}

async function handleActivate(sprintId: string) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await sprintsStore.setActiveSprint(teamId, sprintId);
}

async function handleDelete(sprintId: string) {
  const teamId = teamsStore.currentTeamId;
  if (!teamId) return;
  await sprintsStore.deleteSprint(teamId, sprintId);
}

const selectedSprintId = ref<string | null>(null);
const selectedSprint = computed(() =>
  sprintsStore.sprints.find((s) => s.id === selectedSprintId.value) ?? null,
);
const sprintTasks = computed(() =>
  selectedSprintId.value
    ? tasksStore.sharedTasks.filter((t) => t.sprintId === selectedSprintId.value && !t.parentTaskId)
    : [],
);
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Sprints</h1>
          <p class="text-sm text-muted mt-1">{{ sprintsStore.sprints.length }} sprint{{ sprintsStore.sprints.length !== 1 ? 's' : '' }}</p>
        </div>
        <button class="btn btn-primary" @click="showCreateForm = !showCreateForm">
          + New Sprint
        </button>
      </div>
    </div>

    <div class="page-body">
      <!-- Create form -->
      <div v-if="showCreateForm" class="card mb-4">
        <h3 class="font-semibold mb-3">Create Sprint</h3>
        <div class="flex flex-col gap-3">
          <div>
            <label class="form-label">Sprint Name *</label>
            <input v-model="newName" class="form-input" style="width:100%;" placeholder="Sprint 1" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea v-model="newDesc" class="form-textarea" style="width:100%;" rows="2" placeholder="Optional goal" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label">Start Date</label>
              <input v-model="newStartDate" type="date" class="form-input" style="width:100%;" />
            </div>
            <div>
              <label class="form-label">End Date</label>
              <input v-model="newEndDate" type="date" class="form-input" style="width:100%;" />
            </div>
          </div>
          <div class="flex gap-2 justify-end">
            <button class="btn btn-ghost" @click="showCreateForm = false">Cancel</button>
            <button class="btn btn-primary" :disabled="creating || !newName.trim()" @click="handleCreate">
              {{ creating ? 'Creating...' : 'Create Sprint' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="sprintsStore.loading" class="empty-state">
        <div class="spinner" />
        <span>Loading sprints...</span>
      </div>

      <!-- Empty -->
      <div v-else-if="sprintsStore.sprints.length === 0" class="empty-state">
        <span style="font-size:28px;">◎</span>
        <div class="font-medium">No sprints yet</div>
        <button class="btn btn-primary btn-sm" @click="showCreateForm = true">Create first sprint</button>
      </div>

      <!-- Content: sprint list + task preview -->
      <div v-else style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;">
        <div class="flex flex-col gap-3">
          <SprintCard
            v-for="sprint in sprintsStore.sprints"
            :key="sprint.id"
            :sprint="sprint"
            :task-count="sprintTaskCount(sprint.id)"
            :done-count="sprintDoneCount(sprint.id)"
            :selected="selectedSprintId === sprint.id"
            @select="selectedSprintId = $event"
            @activate="handleActivate"
          />
        </div>

        <!-- Sprint tasks preview -->
        <div v-if="selectedSprint">
          <h3 class="font-semibold mb-3">{{ selectedSprint.name }} — Tasks</h3>
          <div v-if="sprintTasks.length === 0" class="empty-state" style="padding:24px;">
            <div class="text-sm">No tasks in this sprint</div>
          </div>
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="task in sprintTasks"
              :key="task.id"
              class="task-card"
            >
              <div class="flex items-center gap-2">
                <input type="checkbox" class="checkbox" :checked="task.isCompleted" disabled />
                <span class="text-sm flex-1 truncate" :style="{ textDecoration: task.isCompleted ? 'line-through' : 'none' }">{{ task.title }}</span>
                <span class="badge badge-secondary text-xs">{{ task.status.replace('_', ' ') }}</span>
              </div>
            </div>
          </div>
          <div class="mt-3">
            <button class="btn btn-outline btn-sm" @click="handleDelete(selectedSprint!.id)">
              Delete Sprint
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
