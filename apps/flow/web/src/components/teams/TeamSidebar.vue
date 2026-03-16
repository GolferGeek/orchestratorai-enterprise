<template>
  <div class="team-sidebar">
    <div class="sidebar-header">
      <div class="header-title">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>Team Members</span>
      </div>
    </div>

    <div v-if="membersLoading" class="loading-state">
      Loading members...
    </div>

    <div v-else-if="members.length === 0" class="empty-state">
      No members in this team.
    </div>

    <div v-else class="members-list">
      <!-- "All members" option -->
      <button
        class="member-item"
        :class="{ active: selectedUserId === null }"
        @click="handleSelectMember(null)"
      >
        <div class="member-avatar all-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <span class="member-name">All Members</span>
      </button>

      <!-- Individual members -->
      <button
        v-for="member in members"
        :key="member.id"
        class="member-item"
        :class="{ active: selectedUserId === member.userId }"
        @click="handleSelectMember(member.userId)"
      >
        <div class="member-avatar-wrapper">
          <div class="member-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <!-- Online indicator — no live presence in this app, but shows the slot -->
          <div class="online-dot" />
        </div>
        <div class="member-info">
          <span class="member-name">
            {{ member.displayName || member.email }}
            <span v-if="member.userId === currentUserId" class="you-label">(you)</span>
          </span>
          <span class="member-role">{{ member.role }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTeamsStore } from '@/stores/teams.store';
import { useAuthStore } from '@/stores/auth.store';

const props = defineProps<{
  selectedUserId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-member', userId: string | null): void;
}>();

const teamsStore = useTeamsStore();
const authStore = useAuthStore();

const members = computed(() => teamsStore.members);
const membersLoading = computed(() => teamsStore.membersLoading);
const currentUserId = computed(() => authStore.user?.id ?? null);

function handleSelectMember(userId: string | null) {
  emit('select-member', userId);
}
</script>

<style scoped>
.team-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--color-surface, #fff);
  border-right: 1px solid var(--color-border, #e5e7eb);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
}

.icon {
  width: 1.125rem;
  height: 1.125rem;
  color: var(--color-primary, #6366f1);
}

.loading-state,
.empty-state {
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--color-muted, #6b7280);
  text-align: center;
}

.members-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s;
  font-size: 0.8125rem;
}

.member-item:hover {
  background: var(--color-secondary, #f3f4f6);
}

.member-item.active {
  background: color-mix(in srgb, var(--color-primary, #6366f1) 10%, transparent);
  color: var(--color-primary, #6366f1);
}

.member-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.member-avatar {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  background: var(--color-secondary, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-avatar svg {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--color-muted, #9ca3af);
}

.all-avatar svg {
  width: 1rem;
  height: 1rem;
}

.online-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background: #22c55e;
  border: 2px solid var(--color-surface, #fff);
}

.member-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.member-name {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.you-label {
  color: var(--color-muted, #9ca3af);
  font-size: 0.75rem;
}

.member-role {
  font-size: 0.6875rem;
  color: var(--color-muted, #9ca3af);
  text-transform: capitalize;
}
</style>
