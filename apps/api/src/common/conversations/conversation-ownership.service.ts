import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type ExecutionContext,
} from '@orchestrator-ai/transport-types';

/**
 * Guarantees the conversation row for an ExecutionContext exists and belongs
 * to it, before any work (an agent invocation or a workflow run) happens
 * under that conversationId.
 *
 * Everything keyed by conversationId depends on this row: llm_usage has a
 * foreign key to it, and so does workflows.runs. A reused conversationId must
 * match the same user, org, agent and type, or the request is refused.
 */
@Injectable()
export class ConversationOwnershipService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async ensure(context: ExecutionContext): Promise<void> {
    const existing = (await this.db
      .from(null, 'conversations')
      .select('id, user_id, organization_slug, agent_name, agent_type')
      .eq('id', context.conversationId)
      .single()) as {
      data: {
        id: string;
        user_id: string;
        organization_slug: string;
        agent_name: string;
        agent_type: string;
      } | null;
      error: { message: string; code?: string } | null;
    };

    if (existing.data) {
      if (
        existing.data.user_id !== context.userId ||
        existing.data.organization_slug !== context.orgSlug ||
        existing.data.agent_name !== context.agentSlug ||
        existing.data.agent_type !== context.agentType
      ) {
        throw new Error('Conversation ownership mismatch');
      }
      return;
    }

    if (existing.error && existing.error.code !== 'PGRST116') {
      throw new Error(`Failed to verify conversation ownership: ${existing.error.message}`);
    }

    const now = new Date().toISOString();
    const created = await this.db.from(null, 'conversations').insert({
      id: context.conversationId,
      user_id: context.userId,
      agent_name: context.agentSlug,
      agent_type: context.agentType,
      organization_slug: context.orgSlug,
      started_at: now,
      last_active_at: now,
    });
    if (created.error) {
      throw new Error(`Failed to create conversation: ${created.error.message}`);
    }
  }
}
