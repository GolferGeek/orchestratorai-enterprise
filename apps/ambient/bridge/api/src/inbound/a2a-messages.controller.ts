import { Controller, Get, Query, Logger, UseGuards } from '@nestjs/common';
import { BridgeJwtAuthGuard as JwtAuthGuard } from '@orchestratorai/auth-client';
import { BridgeDatabaseService } from '../database/bridge-database.service';
import { A2AMessageRow } from '../database/bridge-database.types';

/**
 * A2AMessagesController — Exposes A2A message history and stats.
 *
 * Provides read-only access to the ambient.a2a_messages audit trail so that
 * the Bridge web UI and external monitoring tools can inspect inbound and
 * outbound message flows.
 */
@Controller('a2a/messages')
@UseGuards(JwtAuthGuard)
export class A2AMessagesController {
  private readonly logger = new Logger(A2AMessagesController.name);

  private readonly defaultOrgSlug = process.env.DEFAULT_ORG_SLUG ?? 'default';

  constructor(private readonly db: BridgeDatabaseService) {}

  /**
   * GET /a2a/messages
   *
   * Query params:
   *   orgSlug   — filter by org (defaults to DEFAULT_ORG_SLUG env var)
   *   direction — 'inbound' | 'outbound'
   *   agentId   — filter by external agent ID
   *   status    — 'pending' | 'success' | 'error' | 'rejected' | 'rate_limited'
   *   limit     — max rows to return (default: 100)
   */
  @Get()
  async getMessages(
    @Query('orgSlug') orgSlug?: string,
    @Query('direction') direction?: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<A2AMessageRow[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;

    return this.db.getMessages({
      orgSlug: orgSlug ?? this.defaultOrgSlug,
      direction,
      agentId,
      status,
      limit: parsedLimit,
    });
  }

  /**
   * GET /a2a/messages/stats
   *
   * Returns aggregate counts for the default org.
   * Counts are calculated in-process from the last 1000 messages to avoid
   * adding a separate SQL aggregation query.
   */
  @Get('stats')
  async getStats(
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
      orgSlug: orgSlug ?? this.defaultOrgSlug,
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
}
