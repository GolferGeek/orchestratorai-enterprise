/**
 * useTeamPresence
 *
 * Sends a heartbeat every 30 seconds to mark the current user as online.
 * Polls the online user list every 15 seconds.
 * Returns onlineUserIds (a reactive Set wrapped in a ref) and a helper
 * isOnline(userId) to check individual users.
 */
import { ref, onUnmounted } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import { useAuthStore } from '@/stores/auth.store';

export function useTeamPresence() {
  const authStore = useAuthStore();
  const onlineUserIds = ref<Set<string>>(new Set());

  function isOnline(userId: string): boolean {
    return onlineUserIds.value.has(userId);
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────────

  function sendHeartbeat() {
    if (!authStore.user) return;
    flowApiService.sendHeartbeat().catch((err) => {
      console.error('Heartbeat failed:', err);
    });
  }

  sendHeartbeat();
  const heartbeatInterval = setInterval(sendHeartbeat, 30_000);

  // ── Online user polling ──────────────────────────────────────────────────────

  async function fetchOnlineUsers() {
    if (!authStore.user) return;
    try {
      const userIds = await flowApiService.getOnlineUsers();
      onlineUserIds.value = new Set(userIds);
    } catch (err) {
      console.error('Failed to fetch online users:', err);
    }
  }

  fetchOnlineUsers();
  const pollInterval = setInterval(fetchOnlineUsers, 15_000);

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  onUnmounted(() => {
    clearInterval(heartbeatInterval);
    clearInterval(pollInterval);
  });

  return {
    onlineUserIds,
    isOnline,
  };
}
