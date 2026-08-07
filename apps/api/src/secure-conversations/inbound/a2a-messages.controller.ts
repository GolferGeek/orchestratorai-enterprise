import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Logger, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { A2AMessageRow } from '../database/secure-conversations-database.types';

/**
 * A2AMessagesController — Exposes A2A message history and stats.
 *
 * Provides read-only access to the ambient.a2a_messages audit trail so that
 * the Secure Conversations web UI and external monitoring tools can inspect inbound and
 * outbound message flows.
 */
@Controller('secure-conversations/a2a/messages')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:audit')
export class A2AMessagesController {
  private readonly logger = new Logger(A2AMessagesController.name);

  constructor(private readonly db: SecureConversationsDatabaseService) {}

  /**
   * GET /a2a/messages
   *
   * Query params:
   *   orgSlug   — optional assertion matching the authorized organization
   *   direction — 'inbound' | 'outbound'
   *   agentId   — filter by external agent ID
   *   status    — 'pending' | 'success' | 'error' | 'rejected' | 'rate_limited'
   *   limit     — max rows to return (default: 100)
   */
  @Get()
  async getMessages(
    @Req() request: Request,
    @Query('orgSlug') orgSlug?: string,
    @Query('direction') direction?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<A2AMessageRow[]> {
    const parsedLimit = limit === undefined ? 100 : Number(limit);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 1000
    ) {
      throw new BadRequestException('limit must be an integer from 1 to 1000');
    }
    if (direction && !['inbound', 'outbound'].includes(direction)) {
      throw new BadRequestException('direction is invalid');
    }
    if (
      status &&
      !['pending', 'success', 'error', 'rejected', 'rate_limited'].includes(
        status,
      )
    ) {
      throw new BadRequestException('status is invalid');
    }
    if (agentId && agentId.length > 128) {
      throw new BadRequestException('agentId is invalid');
    }

    return this.db.getMessages({
      orgSlug: this.resolveOrganizationSlug(request, orgSlug),
      direction,
      agentId,
      status,
      limit: parsedLimit,
    });
  }

  /**
   * GET /a2a/messages/stats
   *
   * Returns aggregate counts for the authorized organization.
   * Counts are calculated in-process from the last 1000 messages to avoid
   * adding a separate SQL aggregation query.
   */
  @Get('stats')
  async getStats(
    @Req() request: Request,
    @Query('orgSlug') orgSlug?: string,
  ): Promise<{
    total: number;
    inbound: number;
    outbound: number;
    success: number;
    error: number;
    rejected: number;
  }> {
    const messages = await this.db.getMessages({
      orgSlug: this.resolveOrganizationSlug(request, orgSlug),
      limit: 1000,
    });

    const stats = {
      total: messages.length,
      inbound: 0,
      outbound: 0,
      success: 0,
      error: 0,
      rejected: 0,
    };

    for (const msg of messages) {
      if (msg.direction === 'inbound') stats.inbound++;
      if (msg.direction === 'outbound') stats.outbound++;
      if (msg.status === 'success') stats.success++;
      if (msg.status === 'error') stats.error++;
      if (msg.status === 'rejected' || msg.status === 'rate_limited') stats.rejected++;
    }

    return stats;
  }

  @Get(':id')
  async getMessage(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<A2AMessageRow> {
    const message = await this.db.getMessage(
      id,
      this.resolveOrganizationSlug(request),
    );
    if (!message) {
      throw new NotFoundException(`A2A message not found: ${id}`);
    }
    return message;
  }

  private resolveOrganizationSlug(
    request: Request,
    requestedOrgSlug?: string,
  ): string {
    const authorizedOrgSlug = (
      request as Request & { organizationSlug?: string }
    ).organizationSlug;
    if (!authorizedOrgSlug || authorizedOrgSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    if (requestedOrgSlug && requestedOrgSlug !== authorizedOrgSlug) {
      throw new BadRequestException(
        'Requested organization does not match the authorized organization',
      );
    }
    return authorizedOrgSlug;
  }
}
