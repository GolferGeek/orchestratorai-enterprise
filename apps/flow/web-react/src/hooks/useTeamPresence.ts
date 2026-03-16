import { useState, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { flowApiService } from '@/services/flowApiService';
import { teamsApiService } from '@/services/teamsApiService';

export interface TeamMember {
  id: string;
  display_name: string;
  is_online: boolean;
}

export function useTeamPresence(teamId?: string | null) {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const onlineUserIdsRef = useRef(onlineUserIds);

  // Keep ref in sync with state
  useEffect(() => {
    onlineUserIdsRef.current = onlineUserIds;
  }, [onlineUserIds]);

  // Global heartbeat: send every 30 seconds regardless of team
  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = () => {
      flowApiService.sendHeartbeat().catch((err) => {
        console.error('Heartbeat failed:', err);
      });
    };

    // Send immediately on mount
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Global online user polling: fetch every 15 seconds regardless of team
  useEffect(() => {
    if (!user) return;

    const fetchOnline = async () => {
      try {
        const userIds = await flowApiService.getOnlineUsers();
        setOnlineUserIds(new Set(userIds));
      } catch (err) {
        console.error('Failed to fetch online users:', err);
      }
    };

    fetchOnline();
    const interval = setInterval(fetchOnline, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch team members for display (still needs teamId for member list)
  useEffect(() => {
    if (!user || !teamId) {
      setTeamMembers([]);
      return;
    }

    const fetchTeamMembers = async () => {
      try {
        const members = await teamsApiService.getTeamMembers(teamId);
        const userIds = members.map(m => m.userId).filter(Boolean);

        if (userIds.length === 0) {
          setTeamMembers([]);
          return;
        }

        const profiles = await flowApiService.getProfiles(userIds);
        const profileMap = new Map(profiles.map(p => [p.id, p]));

        setTeamMembers(
          members.map((member) => {
            const memberProfile = profileMap.get(member.userId);
            return {
              id: member.userId,
              display_name: memberProfile?.displayName || member.displayName || member.email || 'Unknown',
              is_online: onlineUserIdsRef.current.has(member.userId),
            };
          })
        );
      } catch (error) {
        console.error('Error fetching team members:', error);
        setTeamMembers([]);
      }
    };

    fetchTeamMembers();
    const interval = setInterval(fetchTeamMembers, 30000);
    return () => clearInterval(interval);
  }, [user, teamId]);

  // Re-compute is_online when onlineUserIds changes
  useEffect(() => {
    setTeamMembers(prev =>
      prev.map(m => ({
        ...m,
        is_online: onlineUserIds.has(m.id),
      }))
    );
  }, [onlineUserIds]);

  return { teamMembers, onlineUserIds };
}
