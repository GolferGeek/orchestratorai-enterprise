import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

type Row = Record<string, unknown>;

/** One department's week, counted from the platform's own records. */
export interface OrgActivity {
  organization: string;
  workflowRuns: Record<string, Record<string, number>>;
  workflowRunsTotal: number;
  agentConversations: Record<string, number>;
  agentConversationsTotal: number;
  openReviews: number;
  modelCalls: number;
  modelCostUsd: number;
}

/**
 * Reads the activity the digest reports: workflow runs by workflow and status,
 * agent conversations by agent, reviews waiting on people, and model calls and
 * cost. Numbers come from the tables, never from a model. Counts only - no
 * content from any department leaves its org.
 */
@Injectable()
export class ActivityStoreService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async week(organization: string, window: { from: string; to: string }): Promise<OrgActivity> {
    const runs = await this.rows(
      this.db.from('workflows', 'runs').select('workflow_slug, status').eq('organization_slug', organization)
        .gte('queued_at', window.from).lt('queued_at', window.to),
      `runs of ${organization}`,
    );
    const workflowRuns: Record<string, Record<string, number>> = {};
    for (const run of runs) {
      const bySlug = (workflowRuns[String(run.workflow_slug)] ??= {});
      bySlug[String(run.status)] = (bySlug[String(run.status)] ?? 0) + 1;
    }

    const conversations = await this.rows(
      this.db.from(null, 'conversations').select('id, agent_name, agent_type').eq('organization_slug', organization)
        .gte('started_at', window.from).lt('started_at', window.to),
      `conversations of ${organization}`,
    );
    const agentConversations: Record<string, number> = {};
    for (const c of conversations) {
      if (c.agent_type === 'workflow' || c.agent_type === 'system') continue;
      agentConversations[String(c.agent_name)] = (agentConversations[String(c.agent_name)] ?? 0) + 1;
    }

    const reviews = await this.rows(
      this.db.from('workflows', 'human_reviews').select('id').eq('organization_slug', organization).eq('status', 'waiting'),
      `open reviews of ${organization}`,
    );

    const usage = conversations.length === 0 ? [] : await this.rows(
      this.db.from(null, 'llm_usage').select('total_cost').in('conversation_id', conversations.map((c) => c.id))
        .gte('created_at', window.from).lt('created_at', window.to),
      `model usage of ${organization}`,
    );
    const cost = usage.reduce((sum, u) => sum + (typeof u.total_cost === 'number' ? u.total_cost : Number(u.total_cost)), 0);
    if (Number.isNaN(cost)) throw new Error(`llm_usage.total_cost of ${organization} is not a number`);

    return {
      organization,
      workflowRuns,
      workflowRunsTotal: runs.length,
      agentConversations,
      agentConversationsTotal: Object.values(agentConversations).reduce((a, b) => a + b, 0),
      openReviews: reviews.length,
      modelCalls: usage.length,
      modelCostUsd: Math.round(cost * 10000) / 10000,
    };
  }

  private async rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<Row[]> {
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read ${what}: ${error.message}`);
    return data as Row[];
  }
}
