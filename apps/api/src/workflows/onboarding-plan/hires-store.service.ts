import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;

export interface NewHire {
  id: string;
  fullName: string;
  roleTitle: string;
  team: string;
  managerName: string;
  location: string;
  employmentType: 'full-time' | 'part-time' | 'contractor';
  startDate: string;
  notes: string | null;
  onboardingRunId: string | null;
  createdAt: string;
}

export type NewHireFields = Omit<NewHire, 'id' | 'onboardingRunId' | 'createdAt'>;

const toHire = (r: Row): NewHire => ({
  id: String(r.id),
  fullName: String(r.full_name),
  roleTitle: String(r.role_title),
  team: String(r.team),
  managerName: String(r.manager_name),
  location: String(r.location),
  employmentType: r.employment_type as NewHire['employmentType'],
  startDate: r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date).slice(0, 10),
  notes: typeof r.notes === 'string' ? r.notes : null,
  onboardingRunId: typeof r.onboarding_run_id === 'string' ? r.onboarding_run_id : null,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

/** HR's new hires. Recording one starts their onboarding plan (ambient database trigger). */
@Injectable()
export class HiresStoreService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async list(organizationSlug: string): Promise<NewHire[]> {
    const { data, error } = await this.db.from('hr', 'new_hires').select('*').eq('organization_slug', organizationSlug).order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(`Failed to read new hires: ${error.message}`);
    return (data as Row[]).map(toHire);
  }

  async get(organizationSlug: string, id: string): Promise<NewHire | null> {
    const { data, error } = await this.db.from('hr', 'new_hires').select('*').eq('organization_slug', organizationSlug).eq('id', id);
    if (error) throw new Error(`Failed to read new hire ${id}: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? toHire(row) : null;
  }

  /** Record a hire. With `runId`, the hire belongs to that run and the trigger does not start another plan. */
  async add(organizationSlug: string, hire: NewHireFields, userId: string, runId: string | null = null): Promise<NewHire> {
    const { data, error } = await this.db.from('hr', 'new_hires').insert({
      organization_slug: organizationSlug,
      full_name: hire.fullName,
      role_title: hire.roleTitle,
      team: hire.team,
      manager_name: hire.managerName,
      location: hire.location,
      employment_type: hire.employmentType,
      start_date: hire.startDate,
      notes: hire.notes,
      created_by: userId,
      onboarding_run_id: runId,
    }).select('*');
    if (error) throw new Error(`Failed to record the new hire: ${error.message}`);
    return toHire((data as Row[])[0]!);
  }

  /** The hire a run recorded, if it did (a retry must not record them twice). */
  async byRun(organizationSlug: string, runId: string): Promise<NewHire | null> {
    const { data, error } = await this.db.from('hr', 'new_hires').select('*').eq('organization_slug', organizationSlug).eq('onboarding_run_id', runId);
    if (error) throw new Error(`Failed to read the new hire of run ${runId}: ${error.message}`);
    const row = (data as Row[])[0];
    return row ? toHire(row) : null;
  }

  /** Link the hire to the run planning their onboarding (a hire has one plan). */
  async attachRun(organizationSlug: string, id: string, runId: string): Promise<void> {
    const hire = await this.get(organizationSlug, id);
    if (!hire) throw new Error(`HR has no new hire ${id}`);
    if (hire.onboardingRunId && hire.onboardingRunId !== runId) throw new Error(`${hire.fullName} already has an onboarding plan (run ${hire.onboardingRunId})`);
    if (hire.onboardingRunId === runId) return;
    const { error } = await this.db.from('hr', 'new_hires').update({ onboarding_run_id: runId }).eq('id', id);
    if (error) throw new Error(`Failed to link the onboarding run: ${error.message}`);
  }
}
