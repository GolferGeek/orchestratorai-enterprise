import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AmbientDatabaseService, AmbientEventRow, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEventsService, EVENT_NAME } from './ambient-events.service';

/**
 * Push mode over HTTP: an org admin (or an integration acting as one) hands
 * ambient a named event. Internal modules call AmbientEventsService.push
 * directly. Reads show what was pushed and which triggers it fired.
 */
@Controller('ambient/events')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class EventsController {
  constructor(
    private readonly events: AmbientEventsService,
    private readonly db: AmbientDatabaseService,
  ) {}

  @Post()
  async push(
    @Body() body: unknown,
    @Req() request: Request,
    @CurrentUser() user: { id: string },
  ): Promise<{ eventId: string; duplicate: boolean }> {
    const input = parsePushBody(body);
    const { event, duplicate } = await this.events.push(orgOf(request), {
      ...input,
      source: `api:${user.id}`,
    });
    return { eventId: event.id, duplicate };
  }

  @Get()
  @RequirePermission('admin:audit')
  async list(@Req() request: Request, @Query('limit') limit?: string): Promise<AmbientEventRow[]> {
    const parsed = limit === undefined ? 50 : Number(limit);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
      throw new BadRequestException('limit must be a whole number from 1 to 500');
    }
    return this.db.listEvents(orgOf(request), parsed);
  }

  @Get(':id')
  @RequirePermission('admin:audit')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ event: AmbientEventRow; executions: TriggerExecution[] }> {
    const event = await this.db.getEvent(id, orgOf(request));
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return { event, executions: await this.db.getExecutionsForEvent(id) };
  }
}

export function parsePushBody(body: unknown): { name: string; payload: Record<string, unknown>; dedupeKey?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Body must be {event, payload, dedupeKey?}');
  }
  const { event, payload, dedupeKey, ...rest } = body as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) throw new BadRequestException(`Unknown fields: ${extra.join(', ')}`);
  if (typeof event !== 'string' || !EVENT_NAME.test(event)) {
    throw new BadRequestException("event must be lowercase words joined by '.', '_' or '-', e.g. invoice.received");
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new BadRequestException('payload must be an object');
  }
  if (dedupeKey !== undefined && (typeof dedupeKey !== 'string' || dedupeKey.length === 0 || dedupeKey.length > 200)) {
    throw new BadRequestException('dedupeKey must be a string of 1 to 200 characters');
  }
  return { name: event, payload: payload as Record<string, unknown>, ...(dedupeKey === undefined ? {} : { dedupeKey }) };
}

function orgOf(request: Request): string {
  const orgSlug = (request as Request & { organizationSlug?: string }).organizationSlug;
  if (!orgSlug || orgSlug === '*') {
    throw new BadRequestException('A specific authorized organization is required');
  }
  return orgSlug;
}
