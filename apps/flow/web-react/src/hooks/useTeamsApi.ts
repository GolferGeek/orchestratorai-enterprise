import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  teamsApiService,
  UserContext,
  UserTeam,
  ApiTeamMember,
} from '@/services/teamsApiService';

// Keep the same interface as the old useTeams for compatibility
export interface Team {
  id: string;
  name: string;
  description: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  join_passcode: string | null;
  org_slug?: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name?: string;
  is_online?: boolean;
  email?: string;
}

// Convert API response to legacy format
function userTeamToTeam(userTeam: UserTeam): Team {
  return {
    id: userTeam.id,
    name: userTeam.name,
    description: userTeam.description || null,
    created_by_user_id: null, // Not available in userTeam
    created_at: userTeam.joinedAt,
    updated_at: userTeam.joinedAt,
    is_public: true, // Default, actual value from API if needed
    join_passcode: null,
    org_slug: userTeam.orgSlug,
  };
}

function apiMemberToTeamMember(
  member: ApiTeamMember,
  teamId: string
): TeamMember {
  return {
    id: member.id,
    team_id: teamId,
    user_id: member.userId,
    role: member.role,
    joined_at: member.joinedAt,
    display_name: member.displayName || member.email,
    email: member.email,
    is_online: false, // Would need presence system
  };
}

export function useTeamsApi() {
  const { user } = useAuth();
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentOrgSlug, setCurrentOrgSlug] = useState<string>('demo-org');

  // Fetch user context (orgs and teams)
  const fetchUserContext = useCallback(async () => {
    if (!user) {
      setUserContext(null);
      setTeams([]);
      setTeamMembers([]);
      setLoading(false);
      return;
    }

    try {
      const context = await teamsApiService.getUserContext();
      setUserContext(context);

      // Convert user teams to legacy Team format
      const userTeams = context.teams.map(userTeamToTeam);
      setTeams(userTeams);

      // Set default org if available
      if (context.organizations.length > 0) {
        const defaultOrg = context.organizations.find((o) => !o.isGlobal);
        if (defaultOrg) {
          setCurrentOrgSlug(defaultOrg.slug);
        }
      }

      // Fetch members for all teams
      const allMembers: TeamMember[] = [];
      for (const team of context.teams) {
        try {
          const members = await teamsApiService.getTeamMembers(team.id);
          allMembers.push(
            ...members.map((m) => apiMemberToTeamMember(m, team.id))
          );
        } catch (err) {
          console.error(`Error fetching members for team ${team.id}:`, err);
        }
      }
      setTeamMembers(allMembers);
    } catch (err) {
      console.error('Error fetching user context:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch available teams in current org (teams user can join)
  const fetchAvailableTeams = useCallback(async () => {
    if (!user || !currentOrgSlug) {
      setAvailableTeams([]);
      return;
    }

    try {
      const orgTeams = await teamsApiService.getTeamsByOrg(currentOrgSlug);

      // Filter out teams user is already a member of
      const userTeamIds = new Set(teams.map((t) => t.id));
      const available = orgTeams
        .filter((t) => !userTeamIds.has(t.id))
        .map(
          (t): Team => ({
            id: t.id,
            name: t.name,
            description: t.description || null,
            created_by_user_id: t.createdBy || null,
            created_at: t.createdAt,
            updated_at: t.updatedAt,
            is_public: true,
            join_passcode: null,
            org_slug: t.orgSlug,
          })
        );

      setAvailableTeams(available);
    } catch (err) {
      console.error('Error fetching available teams:', err);
    }
  }, [user, currentOrgSlug, teams]);

  useEffect(() => {
    fetchUserContext();
  }, [fetchUserContext]);

  useEffect(() => {
    if (!loading && teams.length >= 0) {
      fetchAvailableTeams();
    }
  }, [loading, teams, fetchAvailableTeams]);

  const createTeam = useCallback(
    async (name: string, description?: string) => {
      if (!user) return { data: null, error: new Error('Not authenticated') };

      try {
        const team = await teamsApiService.createTeam(
          currentOrgSlug,
          name,
          description
        );

        // The creator is automatically added as admin by the API
        // Refresh to get updated data
        await fetchUserContext();

        return {
          data: {
            id: team.id,
            name: team.name,
            description: team.description || null,
            created_by_user_id: team.createdBy || null,
            created_at: team.createdAt,
            updated_at: team.updatedAt,
            is_public: true,
            join_passcode: null,
          } as Team,
          error: null,
        };
      } catch (err) {
        console.error('Error creating team:', err);
        return { data: null, error: err as Error };
      }
    },
    [user, currentOrgSlug, fetchUserContext]
  );

  const joinTeam = useCallback(
    async (teamId: string, _passcode?: string) => {
      if (!user) return { error: new Error('Not authenticated') };

      try {
        // Note: The new API doesn't support passcode-based joining
        // This is handled differently now (admin adds members)
        await teamsApiService.addTeamMember(teamId, user.id, 'member');
        await fetchUserContext();
        return { error: null };
      } catch (err) {
        console.error('Error joining team:', err);
        return { error: err as Error };
      }
    },
    [user, fetchUserContext]
  );

  const leaveTeam = useCallback(
    async (teamId: string) => {
      if (!user) return { error: new Error('Not authenticated') };

      try {
        await teamsApiService.removeTeamMember(teamId, user.id);
        await fetchUserContext();
        return { error: null };
      } catch (err) {
        console.error('Error leaving team:', err);
        return { error: err as Error };
      }
    },
    [user, fetchUserContext]
  );

  const updateTeam = useCallback(
    async (
      id: string,
      updates: {
        name?: string;
        description?: string;
        is_public?: boolean;
        join_passcode?: string | null;
      }
    ) => {
      try {
        // Note: is_public and join_passcode are not supported in new API
        await teamsApiService.updateTeam(id, {
          name: updates.name,
          description: updates.description,
        });
        await fetchUserContext();
        return { error: null };
      } catch (err) {
        console.error('Error updating team:', err);
        return { error: err as Error };
      }
    },
    [fetchUserContext]
  );

  const deleteTeam = useCallback(
    async (id: string) => {
      try {
        await teamsApiService.deleteTeam(id);
        await fetchUserContext();
        return { error: null };
      } catch (err) {
        console.error('Error deleting team:', err);
        return { error: err as Error };
      }
    },
    [fetchUserContext]
  );

  const getTeamMembers = useCallback(
    (teamId: string) => {
      return teamMembers.filter((m) => m.team_id === teamId);
    },
    [teamMembers]
  );

  return {
    teams,
    availableTeams,
    teamMembers,
    loading,
    userContext,
    currentOrgSlug,
    setCurrentOrgSlug,
    createTeam,
    joinTeam,
    leaveTeam,
    updateTeam,
    deleteTeam,
    getTeamMembers,
    refetch: fetchUserContext,
    refetchAvailable: fetchAvailableTeams,
  };
}
