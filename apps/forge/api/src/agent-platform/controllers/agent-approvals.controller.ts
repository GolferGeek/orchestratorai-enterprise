import { Controller, Param, Post, Req, Get, Query } from '@nestjs/common';
import { HumanApprovalsRepository } from '../repositories/human-approvals.repository';
import { AgentPromotionService } from '../services/agent-promotion.service';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    id?: string;
    userId?: string;
  };
}

@Controller('api/agent-approvals')
export class AgentApprovalsController {
  constructor(
    private readonly approvals: HumanApprovalsRepository,
    private readonly promotion: AgentPromotionService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('conversationId') conversationId?: string,
    @Query('agentSlug') agentSlug?: string,
  ) {
    const result = await this.approvals.list({
      status,
      sortDirection: 'desc',
    });
    let filtered = result.data;
    if (conversationId) {
      filtered = filtered.filter((r) => r.conversation_id === conversationId);
    }
    if (agentSlug) {
      filtered = filtered.filter((r) => r.agent_slug === agentSlug);
    }
    return { success: true, data: filtered };
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub || req.user?.id || req.user?.userId || null;

    // Approve the request
    const record = await this.approvals.setStatus(id, 'approved', userId);

    // If this is an agent_promotion approval, complete the promotion
    if (record.mode === 'agent_promotion') {
      try {
        const promotionResult =
          await this.promotion.completePromotionAfterApproval(id);
        return {
          success: true,
          data: record,
          promotion: promotionResult,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          data: record,
          error: `Approval succeeded but promotion failed: ${message}`,
        };
      }
    }

    return { success: true, data: record };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub || req.user?.id || req.user?.userId || null;
    const record = await this.approvals.setStatus(id, 'rejected', userId);
    return { success: true, data: record };
  }
}
