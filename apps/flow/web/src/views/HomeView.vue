<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useTeamsStore } from '@/stores/teams.store';

const authStore = useAuthStore();
const teamsStore = useTeamsStore();

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
});

const quickLinks = [
  { path: '/timer', label: 'SyncFocus Timer', icon: '⏱', desc: 'Pomodoro focus timer synced with your team' },
  { path: '/kanban', label: 'Kanban Board', icon: '▦', desc: 'Drag tasks through your workflow' },
  { path: '/tasks', label: 'My Tasks', icon: '✓', desc: 'View and manage all your tasks' },
  { path: '/sprints', label: 'Sprints', icon: '◎', desc: 'Plan and track sprint progress' },
  { path: '/shared-lists', label: 'Shared Lists', icon: '⊞', desc: 'Team shared task pools' },
  { path: '/files', label: 'Files', icon: '⬡', desc: 'Team documents and files' },
  { path: '/teams', label: 'Teams', icon: '◈', desc: 'Manage team members' },
];
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="text-2xl font-semibold">
        {{ greeting }}, {{ authStore.user?.displayName ?? authStore.user?.email?.split('@')[0] }}
      </h1>
      <p class="text-sm text-muted mt-1">
        {{ teamsStore.currentTeam ? `Working in ${teamsStore.currentTeam.name}` : 'Select a team to get started' }}
      </p>
    </div>

    <div class="page-body">
      <div class="grid-3" style="max-width:900px;">
        <RouterLink
          v-for="link in quickLinks"
          :key="link.path"
          :to="link.path"
          class="card"
          style="text-decoration:none;display:block;transition:all 0.15s;"
        >
          <div style="font-size:24px;margin-bottom:10px;">{{ link.icon }}</div>
          <div class="font-semibold mb-1">{{ link.label }}</div>
          <div class="text-xs text-muted">{{ link.desc }}</div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
