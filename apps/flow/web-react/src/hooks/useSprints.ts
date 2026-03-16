import { useState, useEffect, useCallback, useRef } from 'react';
import { flowApiService, SprintResponse } from '@/services/flowApiService';

export interface Sprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  team_id: string | null;
}

// Helper to map API response to hook interface
function mapSprintResponse(api: SprintResponse): Sprint {
  return {
    id: api.id,
    name: api.name,
    start_date: api.startDate || '',
    end_date: api.endDate || '',
    is_active: api.isActive,
    created_at: api.createdAt,
    team_id: api.teamId || null,
  };
}

export function useSprints(teamId?: string | null) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const [loading, setLoading] = useState(true);
  const activeSprintIdRef = useRef<string | null>(null);

  // Keep ref in sync with activeSprint
  useEffect(() => {
    activeSprintIdRef.current = activeSprint?.id ?? null;
  }, [activeSprint]);

  useEffect(() => {
    if (!teamId) {
      setSprints([]);
      setActiveSprint(null);
      setLoading(false);
      return;
    }

    const fetchSprints = async () => {
      try {
        const data = await flowApiService.getSprints(teamId);
        const mappedSprints = data.map(mapSprintResponse);
        setSprints(mappedSprints);
        const active = mappedSprints.find(s => s.is_active);
        setActiveSprint(active || null);
      } catch (error) {
        console.error('Error fetching sprints:', error);
        setSprints([]);
        setActiveSprint(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSprints();
    // Note: Realtime subscriptions removed - using API instead of direct Supabase
    // Can add polling or websockets later if needed
  }, [teamId]);

  const createSprint = useCallback(async (name: string, startDate: string, endDate: string) => {
    if (!teamId) {
      console.error('Error creating sprint: teamId is required');
      return null;
    }

    try {
      // Deactivate other sprints for this team first
      const existingSprints = await flowApiService.getSprints(teamId);
      const activeSprints = existingSprints.filter(s => s.isActive);
      for (const sprint of activeSprints) {
        await flowApiService.updateSprint(teamId, sprint.id, { isActive: false });
      }

      const data = await flowApiService.createSprint(teamId, {
        name,
        startDate,
        endDate,
        isActive: true,
      });
      return mapSprintResponse(data);
    } catch (error) {
      console.error('Error creating sprint:', error);
      return null;
    }
  }, [teamId]);

  const updateSprint = useCallback(async (id: string, updates: Partial<Pick<Sprint, 'name' | 'start_date' | 'end_date'>>) => {
    if (!teamId) {
      console.error('Error updating sprint: teamId is required');
      return;
    }

    // Optimistic update
    setSprints(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (activeSprint?.id === id) {
      setActiveSprint(prev => prev ? { ...prev, ...updates } : prev);
    }
    
    try {
      await flowApiService.updateSprint(teamId, id, {
        name: updates.name,
        startDate: updates.start_date,
        endDate: updates.end_date,
      });
    } catch (error) {
      console.error('Error updating sprint:', error);
      // Revert optimistic update on error
      const fetchSprints = async () => {
        try {
          const data = await flowApiService.getSprints(teamId);
          const mappedSprints = data.map(mapSprintResponse);
          setSprints(mappedSprints);
          const active = mappedSprints.find(s => s.is_active);
          setActiveSprint(active || null);
        } catch (err) {
          console.error('Error refetching sprints:', err);
        }
      };
      fetchSprints();
    }
  }, [teamId, activeSprint?.id]);

  const setActiveSprintById = useCallback(async (id: string) => {
    if (!teamId) {
      console.error('Error activating sprint: teamId is required');
      return;
    }

    try {
      // Deactivate all sprints
      const existingSprints = await flowApiService.getSprints(teamId);
      const activeSprints = existingSprints.filter(s => s.isActive);
      for (const sprint of activeSprints) {
        await flowApiService.updateSprint(teamId, sprint.id, { isActive: false });
      }

      // Activate the selected sprint
      await flowApiService.updateSprint(teamId, id, { isActive: true });

      // Refresh sprints
      const data = await flowApiService.getSprints(teamId);
      const mappedSprints = data.map(mapSprintResponse);
      setSprints(mappedSprints);
      const active = mappedSprints.find(s => s.is_active);
      setActiveSprint(active || null);
    } catch (error) {
      console.error('Error activating sprint:', error);
    }
  }, [teamId]);

  const deleteSprint = useCallback(async (id: string) => {
    if (!teamId) {
      console.error('Error deleting sprint: teamId is required');
      return;
    }

    try {
      await flowApiService.deleteSprint(teamId, id);
      // Refresh sprints
      const data = await flowApiService.getSprints(teamId);
      const mappedSprints = data.map(mapSprintResponse);
      setSprints(mappedSprints);
      const active = mappedSprints.find(s => s.is_active);
      setActiveSprint(active || null);
    } catch (error) {
      console.error('Error deleting sprint:', error);
    }
  }, [teamId]);

  return {
    sprints,
    activeSprint,
    loading,
    createSprint,
    updateSprint,
    setActiveSprintById,
    deleteSprint,
  };
}
