import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  ConversationPlanDraftInput,
  ConversationPlanRecord,
  ConversationPlanStatusPatch,
  ConversationPlanStatusUpdate,
} from '../interfaces/conversation-plan-record.interface';

interface SupabaseSelectResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

interface SupabaseSelectListResponse<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

const TABLE = 'conversation_plans';

@Injectable()
export class ConversationPlansRepository {
  private readonly logger = new Logger(ConversationPlansRepository.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async createDraft(
    payload: ConversationPlanDraftInput,
  ): Promise<ConversationPlanRecord> {
    const now = new Date().toISOString();
    const { data, error } = (await this.db
      .from(null, TABLE)
      .insert([
        {
          conversation_id: payload.conversation_id,
          organization_slug: payload.organization_slug,
          agent_slug: payload.agent_slug,
          summary: payload.summary ?? null,
          plan_json: payload.plan_json,
          created_by: payload.created_by ?? null,
          updated_at: now,
        },
      ])
      .select()
      .maybeSingle()) as SupabaseSelectResponse<ConversationPlanRecord>;

    if (error) {
      this.logger.error(`Failed to create plan draft: ${error.message}`);
      throw new Error(`Failed to create plan draft: ${error.message}`);
    }

    if (!data) {
      throw new Error('Plan draft insert succeeded but returned no data');
    }

    return data;
  }

  async updateStatus(
    id: string,
    update: ConversationPlanStatusUpdate,
  ): Promise<ConversationPlanRecord> {
    const patch: ConversationPlanStatusPatch = {
      ...update,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = (await this.db
      .from(null, TABLE)
      .update(patch as unknown as Record<string, unknown>)
      .eq('id', id)
      .select()
      .maybeSingle()) as SupabaseSelectResponse<ConversationPlanRecord>;

    if (error) {
      this.logger.error(`Failed to update plan ${id}: ${error.message}`);
      throw new Error(`Failed to update plan: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Plan ${id} not found for update`);
    }

    return data;
  }

  async getById(id: string): Promise<ConversationPlanRecord | null> {
    const { data, error } = (await this.db
      .from(null, TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as SupabaseSelectResponse<ConversationPlanRecord>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to load plan ${id}: ${error.message}`);
      throw new Error(`Failed to load plan: ${error.message}`);
    }

    return data;
  }

  async listByConversation(
    conversationId: string,
  ): Promise<ConversationPlanRecord[]> {
    const { data, error } = (await this.db
      .from(null, TABLE)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<ConversationPlanRecord>;

    if (error) {
      this.logger.error(
        `Failed to list plans for conversation ${conversationId}: ${error.message}`,
      );
      throw new Error(`Failed to list plans: ${error.message}`);
    }

    return data ?? [];
  }
}
