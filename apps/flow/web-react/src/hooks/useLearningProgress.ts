import { useState, useEffect, useCallback } from 'react';
import { flowApiService } from '@/services/flowApiService';
import { useAuth } from './useAuth';

export interface LearningProgress {
  id: string;
  user_id: string;
  organization_slug: string;
  milestone_key: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

// Predefined milestone keys for the onboarding journey
export const MILESTONE_KEYS = {
  // Hardware & Setup
  HARDWARE_SETUP: 'hardware_setup',
  LOCAL_ENV_CONFIGURED: 'local_env_configured',

  // First Steps
  FIRST_CONVERSATION: 'first_conversation',
  FIRST_AGENT_CREATED: 'first_agent_created',
  FIRST_AGENT_TESTED: 'first_agent_tested',

  // Integration
  API_INTEGRATION: 'api_integration',
  WEBHOOK_CONFIGURED: 'webhook_configured',

  // Production
  STAGING_DEPLOYED: 'staging_deployed',
  PRODUCTION_DEPLOYED: 'production_deployed',
  MONITORING_CONFIGURED: 'monitoring_configured',
} as const;

// Map API response to LearningProgress interface
function mapLearningProgressResponse(api: {
  id: string;
  userId: string;
  organizationSlug: string;
  milestoneKey: string;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}): LearningProgress {
  return {
    id: api.id,
    user_id: api.userId,
    organization_slug: api.organizationSlug,
    milestone_key: api.milestoneKey,
    completed_at: api.completedAt,
    notes: api.notes,
    created_at: api.createdAt,
  };
}

export function useLearningProgress() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<LearningProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!user) {
      setProgress([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await flowApiService.getLearningProgress();
      setProgress(data.map(mapLearningProgressResponse));
      setError(null);
    } catch (err) {
      console.error('Error fetching learning progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Check if a milestone is completed
  const isMilestoneCompleted = useCallback((milestoneKey: string) => {
    return progress.some(
      p => p.milestone_key === milestoneKey && p.completed_at !== null
    );
  }, [progress]);

  // Get progress for a specific milestone
  const getMilestone = useCallback((milestoneKey: string) => {
    return progress.find(p => p.milestone_key === milestoneKey);
  }, [progress]);

  // Mark a milestone as completed
  const completeMilestone = useCallback(async (
    milestoneKey: string,
    organizationSlug: string,
    notes?: string
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      const existing = getMilestone(milestoneKey);
      await flowApiService.createOrUpdateLearningProgress({
        organizationSlug,
        milestoneKey,
        completedAt: new Date().toISOString(),
        notes: notes || existing?.notes || undefined,
      });
      await fetchProgress();
    } catch (err) {
      console.error('Error completing milestone:', err);
      throw err;
    }
  }, [user, getMilestone, fetchProgress]);

  // Add notes to a milestone without completing it
  const addMilestoneNotes = useCallback(async (
    milestoneKey: string,
    organizationSlug: string,
    notes: string
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      await flowApiService.createOrUpdateLearningProgress({
        organizationSlug,
        milestoneKey,
        notes,
      });
      await fetchProgress();
    } catch (err) {
      console.error('Error adding milestone notes:', err);
      throw err;
    }
  }, [user, fetchProgress]);

  // Get completion percentage
  const getCompletionPercentage = useCallback((milestoneKeys: string[]) => {
    if (milestoneKeys.length === 0) return 0;

    const completed = milestoneKeys.filter(key => isMilestoneCompleted(key)).length;
    return Math.round((completed / milestoneKeys.length) * 100);
  }, [isMilestoneCompleted]);

  useEffect(() => {
    if (user) {
      fetchProgress();
    }
  }, [user, fetchProgress]);

  return {
    progress,
    loading,
    error,
    fetchProgress,
    isMilestoneCompleted,
    getMilestone,
    completeMilestone,
    addMilestoneNotes,
    getCompletionPercentage,
    MILESTONE_KEYS,
  };
}
