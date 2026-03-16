<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTeamsStore } from '@/stores/teams.store';
import { useTasksStore } from '@/stores/tasks.store';
import MemberAvatar from '@/components/teams/MemberAvatar.vue';
import TaskCard from '@/components/tasks/TaskCard.vue';

const route = useRoute();
const router = useRouter();
const teamsStore = useTeamsStore();
const tasksStore = useTasksStore();

const teamId = computed(() => route.params.teamId as string);
const team = computed(() => teamsStore.teams.find((t) => t.id === teamId.value) ?? teamsStore.currentTeam);

onMounted(async () => {
  await teamsStore.selectTeam(teamId.value);
  await tasksStore.loadSharedTasks(teamId.value);
});

const teamTasks = computed(() =>
  tasksStore.sharedTasks.filter((t) => t.teamId === teamId.value && !t.parentTaskId),
);

async function handleToggle(taskId: string, isCompleted: boolean) {
  await tasksStore.toggleTask(teamId.value, taskId, isCompleted);
}

async function handleDelete(taskId: string) {
  await tasksStore.deleteSharedTask(teamId.value, taskId);
}
</script>

<template>
  <div>
    <div class="page-header">
      <div class="flex items-center gap-3 mb-2">
        <button class="btn btn-ghost btn-sm" @click="router.push('/teams')">← Teams</button>
      </div>
      <div v-if="team">
        <h1 class="text-xl font-semibold">{{ team.name }}</h1>
        <p v-if="team.description" class="text-sm text-muted mt-1">{{ team.description }}</p>
      </div>
      <div v-else class="text-muted">Loading team...</div>
    </div>

    <div class="page-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;">
        <!-- Members panel -->
        <div>
          <h2 class="font-semibold mb-3">Members ({{ teamsStore.members.length }})</h2>
          <div v-if="teamsStore.membersLoading" class="empty-state" style="padding:24px;">
            <div class="spinner" />
          </div>
          <div v-else-if="teamsStore.members.length === 0" class="empty-state" style="padding:24px;">
            <div class="text-sm">No members found</div>
          </div>
          <div v-else class="card" style="padding:0;overflow:hidden;">
            <div
              v-for="member in teamsStore.members"
              :key="member.id"
              class="flex items-center gap-3"
              style="padding:12px 16px;border-bottom:1px solid var(--color-border);"
            >
              <MemberAvatar :user-id="member.userId" :display-name="member.displayName" :size="36" />
              <div style="flex:1;min-width:0;">
                <div class="font-medium text-sm">{{ member.displayName ?? member.email }}</div>
                <div class="text-xs text-muted">{{ member.email }}</div>
              </div>
              <span class="badge badge-secondary">{{ member.role }}</span>
            </div>
          </div>
        </div>

        <!-- Tasks panel -->
        <div>
          <h2 class="font-semibold mb-3">Team Tasks ({{ teamTasks.length }})</h2>
          <div v-if="tasksStore.loadingShared" class="empty-state" style="padding:24px;">
            <div class="spinner" />
          </div>
          <div v-else-if="teamTasks.length === 0" class="empty-state" style="padding:24px;">
            <div class="text-sm">No tasks for this team</div>
          </div>
          <div v-else class="flex flex-col gap-2">
            <TaskCard
              v-for="task in teamTasks"
              :key="task.id"
              :task="task"
              :subtasks="tasksStore.subtasksFor(task.id)"
              :show-status="true"
              @toggle="handleToggle"
              @delete="handleDelete"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
