import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import type { Finding, SubmittalAction } from './findings';

/** Where each reviewed submittal's action and findings are kept (one row per run). */
@Injectable()
export class SubmittalDecisionsService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async record(organizationSlug: string, runId: string, specSection: string, action: SubmittalAction, findings: Finding[]): Promise<void> {
    const { data, error } = await this.db.from('building', 'submittal_decisions').select('action').eq('run_id', runId);
    if (error) throw new Error(`Failed to read the submittal decision: ${error.message}`);
    const existing = (data as Array<{ action: string }>)[0];
    if (existing) {
      if (existing.action !== action) throw new Error(`Run ${runId} already recorded "${existing.action}", not "${action}"`);
      return;
    }
    const inserted = await this.db.from('building', 'submittal_decisions').insert({ run_id: runId, organization_slug: organizationSlug, spec_section: specSection, action, findings });
    if (inserted.error) throw new Error(`Failed to record the submittal decision: ${inserted.error.message}`);
  }
}
