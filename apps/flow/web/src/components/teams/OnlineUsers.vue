<template>
  <div v-if="onlineMembers.length > 0" class="flex items-center gap-1">
    <span class="text-xs text-gray-500 mr-1 hidden sm:block">Online:</span>

    <!-- Count badge -->
    <span
      class="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-green-100 text-green-700 text-xs font-medium"
    >
      {{ onlineMembers.length }}
    </span>

    <!-- Avatar stack (up to 5) -->
    <div class="flex -space-x-2 ml-1">
      <div
        v-for="member in displayedMembers"
        :key="member.id"
        class="relative"
        :title="member.displayName"
      >
        <div
          :style="{ backgroundColor: getAvatarColor(member.id) }"
          class="h-7 w-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-medium"
        >
          {{ getInitials(member.displayName) }}
        </div>
        <!-- Online green dot -->
        <span class="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white rounded-full" />
      </div>

      <!-- Overflow badge -->
      <div
        v-if="onlineMembers.length > 5"
        class="h-7 w-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium"
        :title="`${onlineMembers.length - 5} more online`"
      >
        +{{ onlineMembers.length - 5 }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTeamPresence } from '@/composables/useTeamPresence';
import { useTeamsStore } from '@/stores/teams.store';

const { isOnline } = useTeamPresence();
const teamsStore = useTeamsStore();

interface MemberDisplay {
  id: string;
  displayName: string;
}

/**
 * Filters the currently-loaded team members down to those who are online.
 * The teams store loads members for the selected team via selectTeam/loadMembers.
 */
const onlineMembers = computed<MemberDisplay[]>(() =>
  teamsStore.members
    .filter((m) => isOnline(m.userId))
    .map((m) => ({
      id: m.userId,
      displayName: m.displayName ?? m.email ?? 'Unknown',
    })),
);

const displayedMembers = computed(() => onlineMembers.value.slice(0, 5));

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic color derived from userId
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
</script>
