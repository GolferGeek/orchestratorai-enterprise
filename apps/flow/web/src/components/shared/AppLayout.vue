<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useTeamsStore } from '@/stores/teams.store';

const authStore = useAuthStore();
const teamsStore = useTeamsStore();
const route = useRoute();

const navItems = [
  { path: '/', label: 'Home', icon: '⌂' },
  { path: '/kanban', label: 'Kanban', icon: '▦' },
  { path: '/tasks', label: 'Tasks', icon: '✓' },
  { path: '/sprints', label: 'Sprints', icon: '◎' },
  { path: '/shared-lists', label: 'Shared Lists', icon: '⊞' },
  { path: '/teams', label: 'Teams', icon: '◈' },
  { path: '/files', label: 'Files', icon: '⬡' },
];

const currentPath = computed(() => route.path);

function isActive(path: string): boolean {
  if (path === '/') return currentPath.value === '/';
  return currentPath.value.startsWith(path);
}

function handleSignOut() {
  authStore.signOut();
  window.location.href = '/auth';
}
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="flex items-center gap-2">
          <div
            style="width:36px;height:36px;border-radius:10px;background:rgba(124,106,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;"
          >
            ⏱
          </div>
          <div>
            <div class="font-semibold" style="font-size:15px;">Orch-Flow</div>
            <div class="text-xs text-muted">{{ teamsStore.currentTeam?.name ?? 'No team' }}</div>
          </div>
        </div>
      </div>

      <!-- Team selector -->
      <div v-if="teamsStore.teams.length > 1" style="padding:8px;border-bottom:1px solid var(--color-border);">
        <select
          class="form-input"
          style="width:100%;font-size:12px;"
          :value="teamsStore.currentTeamId"
          @change="(e) => teamsStore.selectTeam((e.target as HTMLSelectElement).value)"
        >
          <option v-for="team in teamsStore.teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </option>
        </select>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <span style="font-size:14px;width:18px;text-align:center;">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>

      <div style="padding:12px 8px;border-top:1px solid var(--color-border);">
        <div class="text-xs text-muted" style="padding:4px 12px;margin-bottom:4px;">
          {{ authStore.user?.email }}
        </div>
        <button class="nav-item" @click="handleSignOut">
          <span style="font-size:14px;width:18px;text-align:center;">→</span>
          Sign Out
        </button>
      </div>
    </aside>

    <!-- Main -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>
