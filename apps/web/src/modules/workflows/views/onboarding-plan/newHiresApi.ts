import { apiFetch } from '@/modules/workflows/services/workflows-api.service';

/** A type (not an interface) so it is plain JSON for a run's input. */
export type NewHireFields = {
  fullName: string;
  roleTitle: string;
  team: string;
  managerName: string;
  location: string;
  employmentType: 'full-time' | 'part-time' | 'contractor';
  startDate: string;
  notes: string | null;
};

export type NewHire = NewHireFields & {
  id: string;
  onboardingRunId: string | null;
  createdAt: string;
};

const base = '/workflows/onboarding-plan/new-hires';

/** HR's new hires in the current organization. Recording one starts its plan. */
export const newHiresApi = {
  list: () => apiFetch<NewHire[]>(base),
  add: (hire: NewHireFields) => apiFetch<NewHire>(base, { method: 'POST', body: JSON.stringify(hire) }),
};
