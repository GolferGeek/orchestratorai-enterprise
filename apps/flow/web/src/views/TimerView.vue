<script setup lang="ts">
/**
 * TimerView — SyncFocus pomodoro timer page.
 *
 * Primary productivity view: timer on the left, personal task panel on the right.
 * When timer completes a focus session, increments pomodoro count on all
 * in-progress tasks.
 */
import { computed, ref } from 'vue';
import { useTasksStore } from '@/stores/tasks.store';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';
import TimerWidget from '@/components/timer/TimerWidget.vue';
import TaskPanel from '@/components/tasks/TaskPanel.vue';
import OnlineUsers from '@/components/teams/OnlineUsers.vue';
import NotificationBell from '@/components/notifications/NotificationBell.vue';

const tasksStore = useTasksStore();
const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const teamId = computed(() => teamsStore.currentTeamId);
const showTaskPanel = ref(true);
</script>

<template>
  <div class="timer-view">
    <!-- Timer section -->
    <div class="timer-view__main">
      <div class="timer-view__header">
        <h1 class="text-xl font-semibold">SyncFocus</h1>
        <div class="flex items-center gap-3">
          <OnlineUsers v-if="teamId" :team-id="teamId" />
          <NotificationBell v-if="teamId" :team-id="teamId" />
          <button
            class="btn btn-ghost btn-sm"
            @click="showTaskPanel = !showTaskPanel"
          >
            {{ showTaskPanel ? '◁ Hide Tasks' : '▷ Show Tasks' }}
          </button>
        </div>
      </div>

      <div class="timer-view__center">
        <TimerWidget :team-id="teamId" />
      </div>
    </div>

    <!-- Task panel (right side) -->
    <div v-if="showTaskPanel" class="timer-view__panel">
      <TaskPanel />
    </div>
  </div>
</template>

<style scoped>
.timer-view {
  display: flex;
  height: 100%;
  gap: 1px;
  background: var(--color-border, #334155);
}

.timer-view__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #0f172a);
  min-width: 0;
}

.timer-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border, #334155);
}

.timer-view__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.timer-view__panel {
  width: 360px;
  flex-shrink: 0;
  background: var(--color-bg, #0f172a);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .timer-view {
    flex-direction: column;
  }
  .timer-view__panel {
    width: 100%;
    max-height: 40vh;
  }
}
</style>
