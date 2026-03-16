<template>
  <div class="notification-bell" ref="bellRef">
    <!-- Trigger button -->
    <button
      class="bell-btn"
      :class="{ 'has-unread': unreadCount > 0 }"
      @click="toggleOpen"
      :aria-label="`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span v-if="unreadCount > 0" class="badge">
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <!-- Dropdown -->
    <div v-if="open" class="dropdown">
      <!-- Header -->
      <div class="dropdown-header">
        <h3 class="dropdown-title">Notifications</h3>
        <button
          v-if="unreadCount > 0"
          class="mark-all-btn"
          @click="markAllRead"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="17 1 21 5 13 13" />
            <polyline points="8 1 12 5 4 13" />
          </svg>
          Mark all read
        </button>
      </div>

      <!-- List -->
      <div class="notification-list">
        <div v-if="notifications.length === 0" class="empty-state">
          No notifications yet
        </div>

        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="notification-item"
          :class="{ unread: !notification.is_read }"
          @click="handleMarkRead(notification.id)"
        >
          <span class="notif-icon">{{ getIcon(notification.type) }}</span>
          <div class="notif-body">
            <p class="notif-message" :class="{ 'font-medium': !notification.is_read }">
              {{ notification.message }}
            </p>
            <p class="notif-time">{{ timeAgo(notification.created_at) }}</p>
          </div>
          <div v-if="!notification.is_read" class="unread-dot" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { useNotifications } from '@/composables/useNotifications';
import { useNotificationSound } from '@/composables/useNotificationSound';

const props = defineProps<{
  teamId?: string | null;
  guestName?: string;
}>();

const teamIdRef = computed(() => props.teamId ?? null);
const guestNameRef = computed(() => props.guestName);

const { notifications, unreadCount, markRead, markAllRead } = useNotifications(
  teamIdRef,
  guestNameRef
);

const { playNotificationSound } = useNotificationSound();

const open = ref(false);
const bellRef = ref<HTMLElement | null>(null);

// Play sound when new unread notifications arrive
let previousUnreadCount = 0;
watch(unreadCount, (newCount) => {
  if (newCount > previousUnreadCount) {
    playNotificationSound();
  }
  previousUnreadCount = newCount;
});

function toggleOpen() {
  open.value = !open.value;
}

function handleMarkRead(id: string) {
  markRead(id);
}

// Close on outside click
function handleOutsideClick(event: MouseEvent) {
  if (bellRef.value && !bellRef.value.contains(event.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});

const ICON_MAP: Record<string, string> = {
  task_completed: '\u2705',
  update_request: '\uD83D\uDCDD',
  collaborator_joined: '\uD83D\uDC4B',
  subtask_added: '\uD83D\uDCCB',
};

function getIcon(type: string): string {
  return ICON_MAP[type] ?? '\uD83D\uDD14';
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
</script>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-block;
}

.bell-btn {
  position: relative;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #fff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text, #111827);
  transition: background 0.15s;
}

.bell-btn:hover {
  background: var(--color-secondary, #f3f4f6);
}

.bell-btn svg {
  width: 1rem;
  height: 1rem;
}

.badge {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: 9999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.25rem;
}

/* Dropdown */
.dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 20rem;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.dropdown-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.mark-all-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--color-muted, #6b7280);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.mark-all-btn:hover {
  background: var(--color-secondary, #f3f4f6);
  color: var(--color-text, #111827);
}

.mark-all-btn svg {
  width: 0.75rem;
  height: 0.75rem;
}

.notification-list {
  max-height: 20rem;
  overflow-y: auto;
}

.empty-state {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-muted, #6b7280);
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item:hover {
  background: color-mix(in srgb, var(--color-secondary, #f3f4f6) 50%, transparent);
}

.notification-item.unread {
  background: color-mix(in srgb, var(--color-primary, #6366f1) 5%, transparent);
}

.notif-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  line-height: 1;
  margin-top: 0.125rem;
}

.notif-body {
  flex: 1;
  min-width: 0;
}

.notif-message {
  font-size: 0.875rem;
  margin: 0;
  line-height: 1.4;
}

.notif-message.font-medium {
  font-weight: 500;
}

.notif-time {
  font-size: 0.75rem;
  color: var(--color-muted, #9ca3af);
  margin: 0.25rem 0 0;
}

.unread-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--color-primary, #6366f1);
  flex-shrink: 0;
  margin-top: 0.375rem;
}
</style>
