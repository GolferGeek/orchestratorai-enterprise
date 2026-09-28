import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  ISSUE_TRANSITIONS,
  type DatabaseService,
  type IssueSeverity,
  type IssueStatus,
  type JsonValue,
  type LedgerIssue,
} from '@orchestrator-ai/transport-types';

/** An issue as a stage raises it. */
export interface RaisedIssue {
  /** Stable and content-derived (e.g. `dimension:security`), never a list index. */
  issueKey: string;
  source: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  finding: string;
  recommendedAction?: string;
  subject?: JsonValue;
  /** How the stage raises it: identified (the default) or report_only. */
  status?: 'identified' | 'report_only';
}

export interface IssueStatusChange {
  stageSlug: string;
  issueKey: string;
  status: IssueStatus;
  rationale?: string;
}

/** A change names an issue the run does not have. */
export class IssueNotFoundError extends Error {
  constructor(stageSlug: string, issueKey: string) {
    super(`No issue "${issueKey}" in stage "${stageSlug}" of this run`);
    this.name = 'IssueNotFoundError';
  }
}

/** A change the status model does not allow. */
export class IssueTransitionError extends Error {
  constructor(issueKey: string, from: IssueStatus, to: IssueStatus) {
    super(`Issue "${issueKey}" cannot go from ${from} to ${to}`);
    this.name = 'IssueTransitionError';
  }
}

type Row = Record<string, unknown>;
const T = 'issue_ledger';
const EVENTS = 'issue_ledger_events';

function toIssue(row: Row, lastChange: LedgerIssue['lastChange']): LedgerIssue {
  const status = row.status;
  const severity = row.severity;
  if (!(ISSUE_STATUSES as readonly unknown[]).includes(status) || !(ISSUE_SEVERITIES as readonly unknown[]).includes(severity)) {
    throw new Error(`workflows.issue_ledger row ${String(row.id)} has an unknown status or severity`);
  }
  const time = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    issueId: String(row.id),
    stageSlug: String(row.stage_slug),
    issueKey: String(row.issue_key),
    source: String(row.source),
    status: status as IssueStatus,
    severity: severity as IssueSeverity,
    category: String(row.category),
    title: String(row.title),
    finding: String(row.finding),
    recommendedAction: typeof row.recommended_action === 'string' ? row.recommended_action : null,
    subject: (row.subject ?? null) as JsonValue | null,
    lastChange,
    createdAt: time(row.created_at),
    updatedAt: time(row.updated_at),
  };
}

/**
 * The ledger's tables. Every multi-row change runs in one transaction; every
 * status change is validated against ISSUE_TRANSITIONS and recorded as an
 * event.
 */
@Injectable()
export class IssueLedgerRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Replace what one stage has raised for a run. Issues it raises again keep
   * their status (a person's decision survives a re-run) and get the new
   * wording; new ones are inserted with an event; ones it no longer raises are
   * removed. All or nothing.
   */
  async replaceStage(input: {
    runId: string;
    organizationSlug: string;
    stageSlug: string;
    workUnitRunId: string | null;
    issues: RaisedIssue[];
  }): Promise<void> {
    const keys = input.issues.map((i) => i.issueKey);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) throw new Error(`Stage "${input.stageSlug}" raised issue "${duplicate}" twice`);

    await this.db.transaction(async (tx) => {
      const existing = await tx
        .from('workflows', T)
        .select('id, issue_key, status')
        .eq('run_id', input.runId)
        .eq('stage_slug', input.stageSlug);
      if (existing.error) throw new Error(`Failed to read stage ${input.stageSlug}: ${existing.error.message}`);
      const byKey = new Map((existing.data as Row[]).map((row) => [String(row.issue_key), row]));
      const now = new Date().toISOString();

      for (const issue of input.issues) {
        const content = {
          source: issue.source,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          finding: issue.finding,
          recommended_action: issue.recommendedAction ?? null,
          subject: issue.subject ?? null,
          work_unit_run_id: input.workUnitRunId,
          updated_at: now,
        };
        const current = byKey.get(issue.issueKey);
        if (current) {
          const updated = await tx.from('workflows', T).update(content).eq('id', current.id).select('id');
          if (updated.error) throw new Error(`Failed to update issue ${issue.issueKey}: ${updated.error.message}`);
          continue;
        }
        const status = issue.status ?? 'identified';
        const inserted = await tx
          .from('workflows', T)
          .insert({
            ...content,
            run_id: input.runId,
            organization_slug: input.organizationSlug,
            stage_slug: input.stageSlug,
            issue_key: issue.issueKey,
            status,
          })
          .select('id');
        if (inserted.error) throw new Error(`Failed to raise issue ${issue.issueKey}: ${inserted.error.message}`);
        const id = (inserted.data as Row[])[0]?.id;
        await this.event(tx, { issueId: String(id), runId: input.runId, org: input.organizationSlug, from: null, to: status, actor: `stage:${input.stageSlug}` });
      }

      const gone = [...byKey.keys()].filter((key) => !keys.includes(key));
      if (gone.length > 0) {
        const removed = await tx
          .from('workflows', T)
          .delete()
          .eq('run_id', input.runId)
          .eq('stage_slug', input.stageSlug)
          .in('issue_key', gone)
          .select('id');
        if (removed.error) throw new Error(`Failed to remove resolved issues: ${removed.error.message}`);
      }
    });
  }

  /** Move issues on, all or nothing; each must exist and the move be allowed. */
  async changeStatuses(input: {
    runId: string;
    organizationSlug: string;
    changes: IssueStatusChange[];
    actor: string;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const change of input.changes) {
        const found = await tx
          .from('workflows', T)
          .select('id, status')
          .eq('run_id', input.runId)
          .eq('organization_slug', input.organizationSlug)
          .eq('stage_slug', change.stageSlug)
          .eq('issue_key', change.issueKey);
        if (found.error) throw new Error(`Failed to read issue ${change.issueKey}: ${found.error.message}`);
        const row = (found.data as Row[])[0];
        if (!row) throw new IssueNotFoundError(change.stageSlug, change.issueKey);
        const from = row.status as IssueStatus;
        if (from === change.status) continue;
        if (!ISSUE_TRANSITIONS[from].includes(change.status)) {
          throw new IssueTransitionError(change.issueKey, from, change.status);
        }
        const updated = await tx
          .from('workflows', T)
          .update({ status: change.status, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', from)
          .select('id');
        if (updated.error) throw new Error(`Failed to move issue ${change.issueKey}: ${updated.error.message}`);
        if ((updated.data as Row[]).length === 0) {
          throw new Error(`Issue ${change.issueKey} changed while it was being moved; try again`);
        }
        await this.event(tx, {
          issueId: String(row.id),
          runId: input.runId,
          org: input.organizationSlug,
          from,
          to: change.status,
          actor: input.actor,
          rationale: change.rationale,
        });
      }
    });
  }

  /**
   * Copy another run's ledger into a run that has none, as it stood at `at`:
   * each issue with the status its last event up to then gave it; issues
   * raised later are left out. Done once: a run that already has issues is
   * left as it is (a retried restart). Returns how many were copied.
   */
  async copyAsOf(input: {
    fromRunId: string;
    toRunId: string;
    organizationSlug: string;
    at: Date;
    actor: string;
  }): Promise<number> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.from('workflows', T).select('id').eq('run_id', input.toRunId).limit(1);
      if (existing.error) throw new Error(`Failed to read the ledger of run ${input.toRunId}: ${existing.error.message}`);
      if ((existing.data as Row[]).length > 0) return 0;

      const issues = await tx.from('workflows', T).select('*').eq('run_id', input.fromRunId).order('created_at').order('seq');
      if (issues.error) throw new Error(`Failed to read the ledger of run ${input.fromRunId}: ${issues.error.message}`);
      const events = await tx
        .from('workflows', EVENTS)
        .select('issue_id, to_status')
        .eq('run_id', input.fromRunId)
        .lte('created_at', input.at.toISOString())
        .order('id');
      if (events.error) throw new Error(`Failed to read the issue events of run ${input.fromRunId}: ${events.error.message}`);
      const statusAt = new Map<string, IssueStatus>();
      for (const e of events.data as Row[]) statusAt.set(String(e.issue_id), e.to_status as IssueStatus);

      let copied = 0;
      for (const row of issues.data as Row[]) {
        const status = statusAt.get(String(row.id));
        if (!status) continue;
        const inserted = await tx
          .from('workflows', T)
          .insert({
            run_id: input.toRunId,
            organization_slug: input.organizationSlug,
            stage_slug: row.stage_slug,
            issue_key: row.issue_key,
            work_unit_run_id: null,
            source: row.source,
            status,
            severity: row.severity,
            category: row.category,
            title: row.title,
            finding: row.finding,
            recommended_action: row.recommended_action,
            subject: row.subject,
            metadata: row.metadata,
          })
          .select('id');
        if (inserted.error) throw new Error(`Failed to copy issue ${String(row.issue_key)}: ${inserted.error.message}`);
        await this.event(tx, {
          issueId: String((inserted.data as Row[])[0]?.id),
          runId: input.toRunId,
          org: input.organizationSlug,
          from: null,
          to: status,
          actor: input.actor,
          rationale: `Carried over from run ${input.fromRunId}`,
        });
        copied += 1;
      }
      return copied;
    });
  }

  async list(runId: string): Promise<LedgerIssue[]> {
    // seq breaks created_at ties (one stage's issues share a transaction's now()),
    // so the view keeps the order the stage raised them; the service's sort is stable.
    const { data, error } = await this.db.from('workflows', T).select('*').eq('run_id', runId).order('created_at').order('seq');
    if (error) throw new Error(`Failed to read the issue ledger of run ${runId}: ${error.message}`);
    const events = await this.db
      .from('workflows', EVENTS)
      .select('issue_id, actor, rationale, created_at')
      .eq('run_id', runId)
      .order('id');
    if (events.error) throw new Error(`Failed to read the issue events of run ${runId}: ${events.error.message}`);
    const latest = new Map<string, LedgerIssue['lastChange']>();
    for (const e of events.data as Row[]) {
      latest.set(String(e.issue_id), {
        actor: String(e.actor),
        rationale: typeof e.rationale === 'string' ? e.rationale : null,
        at: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
      });
    }
    return (data as Row[]).map((row) => {
      const lastChange = latest.get(String(row.id));
      // Every insert and move writes an event in the same transaction.
      if (!lastChange) throw new Error(`Issue ${String(row.id)} has no events; the ledger is inconsistent`);
      return toIssue(row, lastChange);
    });
  }

  private async event(
    tx: DatabaseService,
    e: { issueId: string; runId: string; org: string; from: IssueStatus | null; to: IssueStatus; actor: string; rationale?: string },
  ): Promise<void> {
    const { error } = await tx.from('workflows', EVENTS).insert({
      issue_id: e.issueId,
      run_id: e.runId,
      organization_slug: e.org,
      from_status: e.from,
      to_status: e.to,
      actor: e.actor,
      rationale: e.rationale ?? null,
      // The writer's clock, the same one that stamps LangGraph checkpoints:
      // copyAsOf compares the two.
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to record the issue event: ${error.message}`);
  }
}
