/**
 * useJobModalRoute — syncs the route param `:id` with the modal's open
 * state. The modal's lifecycle becomes a route, not a transient overlay,
 * so deep links and the browser back button work naturally.
 *
 * Usage:
 *   const { openJobId, openJob, closeJob } = useJobModalRoute();
 *   // Template: <JobDetailModal :open="!!openJobId" :job-id="openJobId" @close="closeJob" />
 *   // Click handler: openJob(row.id)
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useJobModalRoute() {
  const route = useRoute();
  const router = useRouter();

  const openJobId = computed<string | null>(() => {
    const id = route.params.id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (Array.isArray(id) && id.length > 0) return id[0]!;
    return null;
  });

  function openJob(id: string): void {
    // Navigate to the job-detail child route, preserving the current
    // page's parent path. We assume the parent route is the
    // capability page (e.g. document-onboarding) and the child is
    // `/jobs/:id` mounted underneath.
    void router.push({
      path: `${route.path.replace(/\/jobs\/[^/]+$/, '')}/jobs/${encodeURIComponent(id)}`,
    });
  }

  function closeJob(): void {
    // Go back to the parent path (strip any /jobs/:id suffix).
    void router.push({
      path: route.path.replace(/\/jobs\/[^/]+$/, ''),
    });
  }

  return { openJobId, openJob, closeJob };
}
