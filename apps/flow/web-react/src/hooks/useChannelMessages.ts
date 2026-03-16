import { useState, useEffect } from 'react';
import { flowApiService } from '@/services/flowApiService';
import { useAuth } from './useAuth';

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

// Map API response to Channel interface
function mapChannelResponse(api: { id: string; name: string; description: string | null; createdByUserId: string | null; createdByGuest: string | null; createdAt: string }): Channel {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    created_by_user_id: api.createdByUserId,
    created_by_guest: api.createdByGuest,
    created_at: api.createdAt,
  };
}

// Map API response to ChannelMessage interface
function mapChannelMessageResponse(api: { id: string; channelId: string; content: string; userId: string | null; guestName: string | null; createdAt: string }): ChannelMessage {
  return {
    id: api.id,
    channel_id: api.channelId,
    content: api.content,
    user_id: api.userId,
    guest_name: api.guestName,
    created_at: api.createdAt,
  };
}

export const useChannelMessages = (teamId?: string | null) => {
  const { user, profile } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch channels
  useEffect(() => {
    if (!teamId) {
      setChannels([]);
      setLoading(false);
      return;
    }

    const fetchChannels = async () => {
      try {
        const data = await flowApiService.getChannels(teamId);
        const mappedChannels = data.map(mapChannelResponse);
        setChannels(mappedChannels);
        if (mappedChannels.length > 0 && !activeChannelId) {
          setActiveChannelId(mappedChannels[0].id);
        }
      } catch (error) {
        console.error('Error fetching channels:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();

    // Poll for channel updates every 5 seconds (realtime subscriptions removed)
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeChannelId intentionally excluded to prevent infinite loop
  }, [teamId]);

  // Fetch messages for active channel
  useEffect(() => {
    if (!activeChannelId || !teamId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const messagesData = await flowApiService.getChannelMessages(teamId, activeChannelId);
        
        // Fetch profiles separately for user_ids
        const userIds = [...new Set(messagesData.filter(m => m.userId).map(m => m.userId))];
        let profilesMap: Record<string, string> = {};
        
        if (userIds.length > 0) {
          try {
            const profiles = await flowApiService.getProfiles(userIds);
            profilesMap = (profiles || []).reduce((acc, p) => {
              acc[p.id] = p.displayName || '';
              return acc;
            }, {} as Record<string, string>);
          } catch (error) {
            console.error('Error fetching profiles for messages:', error);
          }
        }

        const messagesWithProfiles = messagesData.map(m => {
          const mapped = mapChannelMessageResponse(m);
          return {
            ...mapped,
            profile: mapped.user_id && profilesMap[mapped.user_id] ? { display_name: profilesMap[mapped.user_id] } : undefined,
          };
        });

        setMessages(messagesWithProfiles);
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();

    // Poll for message updates every 2 seconds (realtime subscriptions removed)
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [activeChannelId, teamId]);

  const sendMessage = async (content: string, guestName?: string) => {
    if (!activeChannelId || !content.trim() || !teamId) return;

    const trimmedContent = content.trim();
    const senderName = user ? (profile?.display_name || 'You') : (guestName || 'Guest');

    // Optimistic: add message to UI immediately
    const optimisticMessage: ChannelMessage = {
      id: `optimistic-${Date.now()}`,
      channel_id: activeChannelId,
      content: trimmedContent,
      user_id: user?.id || null,
      guest_name: !user ? (guestName || 'Guest') : null,
      created_at: new Date().toISOString(),
      profile: user ? { display_name: senderName } : undefined,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      await flowApiService.createChannelMessage(teamId, activeChannelId, {
        content: trimmedContent,
        userId: user?.id || null,
        guestName: !user ? (guestName || 'Guest') : null,
      });
      // Next poll will replace optimistic with real message
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
    }
  };

  const createChannel = async (name: string, description?: string) => {
    if (!teamId) {
      console.error('Cannot create channel: teamId is required');
      return null;
    }

    try {
      const data = await flowApiService.createChannel(teamId, {
        name: name.trim(),
        description: description?.trim() || null,
      });
      return mapChannelResponse(data);
    } catch (error) {
      console.error('Error creating channel:', error);
      return null;
    }
  };

  const deleteChannel = async (channelId: string) => {
    if (!teamId) {
      console.error('Cannot delete channel: teamId is required');
      return;
    }

    try {
      await flowApiService.deleteChannel(teamId, channelId);
      // Channels will be refreshed by polling
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  return {
    channels,
    messages,
    activeChannelId,
    setActiveChannelId,
    loading,
    sendMessage,
    createChannel,
    deleteChannel,
  };
};
