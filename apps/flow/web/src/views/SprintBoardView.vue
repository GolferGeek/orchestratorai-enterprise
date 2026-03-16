<script setup lang="ts">
/**
 * SprintBoardView — wrapper that mounts KanbanBoard
 * with the current team context.
 */
import { computed } from 'vue';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import KanbanBoard from '@/components/kanban/KanbanBoard.vue';

const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const teamId = computed(() => teamsStore.currentTeamId);
const userId = computed(() => authStore.user?.id ?? null);
const userName = computed(() => authStore.user?.displayName ?? authStore.user?.email ?? null);
</script>

<template>
  <KanbanBoard
    :team-id="teamId"
    :user-id="userId"
    :user-name="userName"
  />
</template>
