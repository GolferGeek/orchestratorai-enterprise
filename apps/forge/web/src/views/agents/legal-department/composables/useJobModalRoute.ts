/**
 * useJobModalRoute — syncs the modal's open state with a `?jobId=…`
 * query param on the parent route. We use a query param (not a child
 * route) because Ionic Vue's IonRouterOutlet maintains a per-route view
 * stack, and reusing the same component for both `/document-onboarding`
 * and `/document-onboarding/jobs/:id` triggers a stale-view-item lookup
 * that fires `[@ionic/vue Warning]: ... does not have the required
 * <ion-page> component` plus a downstream TypeError in `isViewVisible`.
 * Staying on a single route avoids the entire transition.
 *
 * Deep links still work — `/document-onboarding?jobId=abc` opens the
 * modal on initial load. Browser back/forward also still work because
 * the query change is part of the history entry.
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
    const id = route.query.jobId;
    if (typeof id === 'string' && id.length > 0) return id;
    if (Array.isArray(id) && id.length > 0 && typeof id[0] === 'string') {
      return id[0];
    }
    return null;
  });

  function openJob(id: string): void {
    void router.push({
      path: route.path,
      query: { ...route.query, jobId: id },
    });
  }

  function closeJob(): void {
    // Use `replace` so the open-modal entry doesn't sit in history —
    // browser back from the list goes to the previous app page, not
    // bounces the modal back open.
    const next = { ...route.query };
    delete next.jobId;
    void router.replace({ path: route.path, query: next });
  }

  return { openJobId, openJob, closeJob };
}
