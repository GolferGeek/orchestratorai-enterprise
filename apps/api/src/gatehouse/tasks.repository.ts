import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService, type QueryBuilder } from '@orchestrator-ai/transport-types';
import type { A2APart } from './a2a-v1';
import type { TaskRow, TaskState, TaskTarget } from './a2a-inbound';
import type { TaskOwner } from './principal';

const SCHEMA = 'gatehouse';
const STATES: TaskState[] = ['submitted', 'working', 'completed', 'failed', 'canceled', 'rejected'];
const TARGETS: TaskTarget[] = ['ambient', 'agent', 'workflow', 'a2a'];

function toTask(row: Record<string, unknown>): TaskRow {
  const state = row.state as TaskState;
  const target = row.target as TaskTarget;
  if (!STATES.includes(state)) throw new Error(`gatehouse.tasks.state "${String(row.state)}" is not a state`);
  if (!TARGETS.includes(target)) throw new Error(`gatehouse.tasks.target "${String(row.target)}" is not a target`);
  return {
    id: String(row.id),
    agentSlug: String(row.agent_slug),
    orgSlug: String(row.org_slug),
    callerId: row.caller_id === null ? null : String(row.caller_id),
    grantRef: row.grant_ref === null || row.grant_ref === undefined ? null : String(row.grant_ref),
    contextId: String(row.context_id),
    state,
    target,
    runId: row.run_id === null ? null : String(row.run_id),
    eventId: row.event_id === null ? null : String(row.event_id),
    artifact: (row.artifact ?? null) as A2APart[] | null,
    statusMessage: row.status_message === null ? null : String(row.status_message),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

/** A task as an admin sees it: with when it began and any internal error. */
export interface TaskAdminRow extends TaskRow {
  createdAt: string;
  error: string | null;
}

function toAdminTask(row: Record<string, unknown>): TaskAdminRow {
  return {
    ...toTask(row),
    createdAt: new Date(String(row.created_at)).toISOString(),
    error: row.error === null ? null : String(row.error),
  };
}

export type TaskUpdate = Partial<Pick<TaskRow, 'state' | 'runId' | 'eventId' | 'artifact' | 'statusMessage'>> & { error?: string };

@Injectable()
export class TasksRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async create(task: Pick<TaskRow, 'id' | 'agentSlug' | 'orgSlug' | 'contextId' | 'target'> & TaskOwner): Promise<TaskRow> {
    const { data, error } = await this.db
      .from(SCHEMA, 'tasks')
      .insert({
        id: task.id,
        agent_slug: task.agentSlug,
        org_slug: task.orgSlug,
        caller_id: task.callerId,
        grant_ref: task.grantRef,
        context_id: task.contextId,
        target: task.target,
        state: 'working',
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create A2A task: ${error.message}`);
    return toTask(data as Record<string, unknown>);
  }

  async update(id: string, update: TaskUpdate): Promise<TaskRow> {
    const { data, error } = await this.db
      .from(SCHEMA, 'tasks')
      .update({
        ...(update.state === undefined ? {} : { state: update.state }),
        ...(update.runId === undefined ? {} : { run_id: update.runId }),
        ...(update.eventId === undefined ? {} : { event_id: update.eventId }),
        ...(update.artifact === undefined ? {} : { artifact: update.artifact }),
        ...(update.statusMessage === undefined ? {} : { status_message: update.statusMessage }),
        ...(update.error === undefined ? {} : { error: update.error }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update A2A task ${id}: ${error.message}`);
    return toTask(data as Record<string, unknown>);
  }

  /**
   * Tasks an agent or partner was still answering when the API stopped: their
   * answer died with the process, so they fail instead of staying working
   * forever. (Workflow tasks follow their run, which has its own lease.) One
   * API instance runs per deployment, so nothing else is answering them.
   */
  async failInterrupted(): Promise<number> {
    const { data, error } = await this.db
      .from(SCHEMA, 'tasks')
      .update({
        state: 'failed',
        status_message: 'Interrupted by a restart; send the request again',
        error: 'The API restarted while the task was running',
        updated_at: new Date().toISOString(),
      })
      .eq('state', 'working')
      .in('target', ['agent', 'a2a'])
      .select('id');
    if (error) throw new Error(`Failed to close interrupted A2A tasks: ${error.message}`);
    return Array.isArray(data) ? data.length : 0;
  }

  /** One of this caller's (or agent key's) tasks at this agent; anyone else's task does not exist for it. */
  async getForOwner(id: string, owner: TaskOwner, agentSlug: string): Promise<TaskRow | null> {
    const { data, error } = await ownedBy(this.db.from(SCHEMA, 'tasks').select('*').eq('id', id), owner)
      .eq('agent_slug', agentSlug)
      .maybeSingle();
    if (error) throw new Error(`Failed to load A2A task ${id}: ${error.message}`);
    return data ? toTask(data as Record<string, unknown>) : null;
  }

  async listForOwner(
    owner: TaskOwner,
    agentSlug: string,
    filter: { contextId?: string; state?: TaskState },
    page: { offset: number; size: number },
  ): Promise<{ tasks: TaskRow[]; total: number }> {
    const filtered = (columns: string, head: boolean) => {
      let query = ownedBy(this.db.from(SCHEMA, 'tasks').select(columns, head ? { count: 'exact', head: true } : undefined), owner)
        .eq('agent_slug', agentSlug);
      if (filter.contextId !== undefined) query = query.eq('context_id', filter.contextId);
      if (filter.state !== undefined) query = query.eq('state', filter.state);
      return query;
    };
    const counted = await filtered('id', true);
    if (counted.error) throw new Error(`Failed to count A2A tasks: ${counted.error.message}`);
    if (typeof counted.count !== 'number') throw new Error('No A2A task count');
    const { data, error } = await filtered('*', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(page.offset, page.offset + page.size - 1);
    if (error) throw new Error(`Failed to list A2A tasks: ${error.message}`);
    return { tasks: ((data ?? []) as Record<string, unknown>[]).map(toTask), total: counted.count };
  }

  /** Newest first, for the Gatehouse pages; every org when orgSlug is '*'. */
  async listForAdmin(orgSlug: string, filter: { agentSlug?: string; state?: TaskState }, limit: number): Promise<TaskAdminRow[]> {
    let query = this.db.from(SCHEMA, 'tasks').select('*');
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    if (filter.agentSlug !== undefined) query = query.eq('agent_slug', filter.agentSlug);
    if (filter.state !== undefined) query = query.eq('state', filter.state);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(`Failed to list A2A tasks: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(toAdminTask);
  }

  /** One task, if it is in this org (any org for '*'). */
  async getForAdmin(id: string, orgSlug: string): Promise<TaskAdminRow | null> {
    let query = this.db.from(SCHEMA, 'tasks').select('*').eq('id', id);
    if (orgSlug !== '*') query = query.eq('org_slug', orgSlug);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to load A2A task ${id}: ${error.message}`);
    return data ? toAdminTask(data as Record<string, unknown>) : null;
  }

  /** Whether this caller has ever called one of our agents. */
  async anyForCaller(callerId: string): Promise<boolean> {
    const { data, error } = await this.db.from(SCHEMA, 'tasks').select('id').eq('caller_id', callerId).limit(1);
    if (error) throw new Error(`Failed to read A2A tasks: ${error.message}`);
    return (data as unknown[]).length > 0;
  }
}

/** Narrow a tasks query to one owner: a registered caller or an agent key. */
function ownedBy(query: QueryBuilder, owner: TaskOwner): QueryBuilder {
  return owner.callerId !== null ? query.eq('caller_id', owner.callerId) : query.eq('grant_ref', owner.grantRef);
}
