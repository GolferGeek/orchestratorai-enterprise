import { ref, onMounted } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { LearningProgressResponse } from '@/types/flow';

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

export function useLearningProgress() {
  const progress = ref<LearningProgressResponse[]>([]);
  const loading = ref(true);

  async function fetchProgress(): Promise<void> {
    loading.value = true;
    try {
      progress.value = await flowApiService.getLearningProgress();
    } finally {
      loading.value = false;
    }
  }

  function isMilestoneCompleted(milestoneKey: string): boolean {
    return progress.value.some(
      (p) => p.milestoneKey === milestoneKey && p.completedAt !== null,
    );
  }

  function getMilestone(milestoneKey: string): LearningProgressResponse | undefined {
    return progress.value.find((p) => p.milestoneKey === milestoneKey);
  }

  async function markComplete(milestoneKey: string, orgSlug: string, notes?: string): Promise<void> {
    const existing = getMilestone(milestoneKey);
    await flowApiService.createOrUpdateLearningProgress({
      organizationSlug: orgSlug,
      milestoneKey,
      completedAt: new Date().toISOString(),
      notes: notes ?? existing?.notes ?? undefined,
    });
    await fetchProgress();
  }

  async function update(milestoneKey: string, orgSlug: string, notes?: string, completedAt?: string): Promise<void> {
    await flowApiService.createOrUpdateLearningProgress({
      organizationSlug: orgSlug,
      milestoneKey,
      completedAt,
      notes,
    });
    await fetchProgress();
  }

  onMounted(() => {
    fetchProgress();
  });

  return {
    progress,
    loading,
    fetchProgress,
    isMilestoneCompleted,
    getMilestone,
    markComplete,
    update,
    MILESTONE_KEYS,
  };
}
