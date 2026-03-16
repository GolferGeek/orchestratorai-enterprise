/**
 * useNotifications
 *
 * Loads notifications for a team. Polls every 10 seconds.
 * Supports authenticated users and guests (via guestName parameter).
 */
import { ref, computed, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import { useAuthStore } from '@/stores/auth.store';
import type { NotificationResponseDto } from '@/types/flow';

export interface Notification {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  type: string;
  task_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

function mapNotification(dto: NotificationResponseDto): Notification {
  return {
    id: dto.id,
    user_id: dto.userId,
    guest_name: dto.guestName,
    type: dto.type,
    task_id: dto.taskId,
    message: dto.message,
    is_read: dto.isRead,
    created_at: dto.createdAt,
  };
}

const POLL_INTERVAL_MS = 10_000;

export function useNotifications(teamId: Ref<string | null>, guestName?: Ref<string | undefined>) {
  const authStore = useAuthStore();

  const notifications = ref<Notification[]>([]);
  const loading = ref(false);

  const unreadCount = computed(() => notifications.value.filter((n) => !n.is_read).length);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function fetchNotifications() {
    const tid = teamId.value;
    if (!tid) {
      notifications.value = [];
      return;
    }
    loading.value = true;
    const data = await flowApiService.getNotifications(tid, guestName?.value);
    notifications.value = data.map(mapNotification);
    loading.value = false;
  }

  function startPolling() {
    stopPolling();
    if (!teamId.value) return;
    fetchNotifications();
    pollTimer = setInterval(fetchNotifications, POLL_INTERVAL_MS);
  }

  watch(teamId, () => startPolling(), { immediate: true });

  onUnmounted(() => stopPolling());

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function markRead(id: string): Promise<void> {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot mark notification as read: teamId is required');
      return;
    }
    await flowApiService.markNotificationsRead(tid, [id], guestName?.value);
    notifications.value = notifications.value.map((n) =>
      n.id === id ? { ...n, is_read: true } : n
    );
  }

  async function markAllRead(): Promise<void> {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot mark notifications as read: teamId is required');
      return;
    }
    const ids = notifications.value.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await flowApiService.markNotificationsRead(tid, ids, guestName?.value);
    notifications.value = notifications.value.map((n) => ({ ...n, is_read: true }));
  }

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
  };
}
