/**
 * useChannelMessages
 *
 * Loads channels and messages for a team. Polls channels every 5 seconds
 * and messages every 5 seconds when a channel is selected.
 * Supports authenticated users and guests.
 */
import { ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ChannelResponse,
  ChannelMessageResponse,
  CreateChannelDto,
} from '@/types/flow';

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  created_by_user_id: string | null;
  created_by_guest: string | null;
  created_at: string;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  content: string;
  user_id: string | null;
  guest_name: string | null;
  created_at: string;
  profile?: {
    display_name: string;
  };
}

function mapChannel(api: ChannelResponse): Channel {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    created_by_user_id: api.createdByUserId,
    created_by_guest: api.createdByGuest,
    created_at: api.createdAt,
  };
}

function mapChannelMessage(api: ChannelMessageResponse): ChannelMessage {
  return {
    id: api.id,
    channel_id: api.channelId,
    content: api.content,
    user_id: api.userId,
    guest_name: api.guestName,
    created_at: api.createdAt,
  };
}

const POLL_INTERVAL_MS = 5_000;

export function useChannelMessages(teamId: Ref<string | null>) {
  const authStore = useAuthStore();

  const channels = ref<Channel[]>([]);
  const messages = ref<ChannelMessage[]>([]);
  const selectedChannel = ref<string | null>(null);
  const loading = ref(true);

  let channelTimer: ReturnType<typeof setInterval> | null = null;
  let messageTimer: ReturnType<typeof setInterval> | null = null;

  function stopChannelPolling() {
    if (channelTimer !== null) {
      clearInterval(channelTimer);
      channelTimer = null;
    }
  }

  function stopMessagePolling() {
    if (messageTimer !== null) {
      clearInterval(messageTimer);
      messageTimer = null;
    }
  }

  async function fetchChannels() {
    const tid = teamId.value;
    if (!tid) {
      channels.value = [];
      loading.value = false;
      return;
    }
    const data = await flowApiService.getChannels(tid);
    const mapped = data.map(mapChannel);
    channels.value = mapped;
    if (mapped.length > 0 && !selectedChannel.value) {
      selectedChannel.value = mapped[0].id;
    }
    loading.value = false;
  }

  async function fetchMessages() {
    const tid = teamId.value;
    const channelId = selectedChannel.value;
    if (!tid || !channelId) {
      messages.value = [];
      return;
    }

    const messagesData = await flowApiService.getChannelMessages(tid, channelId);

    // Fetch display names for user messages
    const userIds = [...new Set(messagesData.filter((m) => m.userId).map((m) => m.userId as string))];
    let profilesMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const profiles = await flowApiService.getProfiles(userIds);
      profilesMap = (profiles ?? []).reduce<Record<string, string>>((acc, p) => {
        acc[p.id] = p.displayName ?? '';
        return acc;
      }, {});
    }

    messages.value = messagesData.map((m) => {
      const mapped = mapChannelMessage(m);
      return {
        ...mapped,
        profile:
          mapped.user_id && profilesMap[mapped.user_id]
            ? { display_name: profilesMap[mapped.user_id] }
            : undefined,
      };
    });
  }

  function startChannelPolling() {
    stopChannelPolling();
    if (!teamId.value) return;
    fetchChannels();
    channelTimer = setInterval(fetchChannels, POLL_INTERVAL_MS);
  }

  function startMessagePolling() {
    stopMessagePolling();
    if (!teamId.value || !selectedChannel.value) return;
    fetchMessages();
    messageTimer = setInterval(fetchMessages, POLL_INTERVAL_MS);
  }

  watch(teamId, () => {
    selectedChannel.value = null;
    loading.value = true;
    startChannelPolling();
    startMessagePolling();
  }, { immediate: true });

  watch(selectedChannel, () => {
    messages.value = [];
    startMessagePolling();
  });

  onUnmounted(() => {
    stopChannelPolling();
    stopMessagePolling();
  });

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function createChannel(name: string, description?: string): Promise<Channel | null> {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot create channel: teamId is required');
      return null;
    }
    const dto: CreateChannelDto = {
      name: name.trim(),
      description: description?.trim() ?? null,
    };
    const data = await flowApiService.createChannel(tid, dto);
    return mapChannel(data);
  }

  async function deleteChannel(channelId: string): Promise<void> {
    const tid = teamId.value;
    if (!tid) {
      console.error('Cannot delete channel: teamId is required');
      return;
    }
    await flowApiService.deleteChannel(tid, channelId);
    // Polling will refresh the channel list
  }

  async function sendMessage(content: string, guestName?: string): Promise<void> {
    const tid = teamId.value;
    const channelId = selectedChannel.value;
    if (!tid || !channelId || !content.trim()) return;

    const user = authStore.user;
    const trimmedContent = content.trim();

    // Optimistic update
    const optimistic: ChannelMessage = {
      id: `optimistic-${Date.now()}`,
      channel_id: channelId,
      content: trimmedContent,
      user_id: user?.id ?? null,
      guest_name: !user ? (guestName ?? 'Guest') : null,
      created_at: new Date().toISOString(),
      profile: user
        ? { display_name: user.displayName ?? 'You' }
        : undefined,
    };
    messages.value = [...messages.value, optimistic];

    await flowApiService.createChannelMessage(tid, channelId, {
      content: trimmedContent,
      userId: user?.id ?? null,
      guestName: !user ? (guestName ?? 'Guest') : null,
    });
    // Next poll replaces optimistic message with the server response
  }

  return {
    channels,
    messages,
    selectedChannel,
    loading,
    createChannel,
    deleteChannel,
    sendMessage,
  };
}
