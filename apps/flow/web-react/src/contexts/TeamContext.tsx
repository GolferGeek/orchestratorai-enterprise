/* eslint-disable react-refresh/only-export-components -- context pattern exports both provider and hook */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTeams, Team, TeamMember } from '@/hooks/useTeams';
import { useAuth } from '@/hooks/useAuth';
import type { UserContext } from '@/services/teamsApiService';

interface TeamContextType {
  teams: Team[];
  availableTeams: Team[];
  teamMembers: TeamMember[];
  currentTeam: Team | null;
  currentTeamMembers: TeamMember[];
  currentTeamId: string | null;
  setCurrentTeamId: (teamId: string | null) => void;
  loading: boolean;
  userContext: UserContext | null;
  currentOrgSlug: string;
  setCurrentOrgSlug: (orgSlug: string) => void;
  createTeam: (name: string, description?: string) => Promise<{ data: Team | null; error: Error | null }>;
  joinTeam: (teamId: string, passcode?: string) => Promise<{ error: Error | null }>;
  leaveTeam: (teamId: string) => Promise<{ error: Error | null }>;
  updateTeam: (id: string, updates: { name?: string; description?: string; is_public?: boolean; join_passcode?: string | null }) => Promise<{ error: Error | null }>;
  deleteTeam: (id: string) => Promise<{ error: Error | null }>;
  getTeamMembers: (teamId: string) => TeamMember[];
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const {
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
  } = useTeams();

  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

  // Auto-select first team if none selected
  useEffect(() => {
    if (!loading && teams.length > 0 && !currentTeamId) {
      // Try to load from localStorage
      const savedTeamId = localStorage.getItem(`selectedTeam_${user?.id}`);
      if (savedTeamId && teams.some(t => t.id === savedTeamId)) {
        setCurrentTeamId(savedTeamId);
      } else {
        setCurrentTeamId(teams[0].id);
      }
    }
  }, [loading, teams, currentTeamId, user?.id]);

  // Save selected team to localStorage
  useEffect(() => {
    if (currentTeamId && user?.id) {
      localStorage.setItem(`selectedTeam_${user.id}`, currentTeamId);
    }
  }, [currentTeamId, user?.id]);

  const currentTeam = teams.find(t => t.id === currentTeamId) || null;
  const currentTeamMembers = currentTeamId ? getTeamMembers(currentTeamId) : [];

  return (
    <TeamContext.Provider
      value={{
        teams,
        availableTeams,
        teamMembers,
        currentTeam,
        currentTeamMembers,
        currentTeamId,
        setCurrentTeamId,
        loading,
        userContext,
        currentOrgSlug,
        setCurrentOrgSlug,
        createTeam: createTeam as unknown as TeamContextType['createTeam'],
        joinTeam: joinTeam as unknown as TeamContextType['joinTeam'],
        leaveTeam: leaveTeam as unknown as TeamContextType['leaveTeam'],
        updateTeam: updateTeam as unknown as TeamContextType['updateTeam'],
        deleteTeam: deleteTeam as unknown as TeamContextType['deleteTeam'],
        getTeamMembers,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeamContext() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeamContext must be used within a TeamProvider');
  }
  return context;
}
