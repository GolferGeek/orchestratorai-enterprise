import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateCronExpression } from 'cron';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { EVENT_NAME } from '../events/ambient-events.service';
import { MailboxWatcherService, type MailboxPollResult } from './mailbox-watcher.service';
import { MailboxWatchesRepository, type MailboxWatch } from './mailbox-watches.repository';

const FIELDS = new Set(['mailbox', 'credentialKey', 'query', 'schedule', 'event']);

/**
 * Watched mailboxes of the caller's organization: a new message raises the
 * watch's event. The mailbox's refresh token is stored first as the
 * organization's gmail/<credentialKey> credential (with google/client_id and
 * google/client_secret), through /admin/credentials.
 */
@Controller('ambient/mailbox-watches')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class MailboxWatchesController {
  constructor(
    private readonly watches: MailboxWatchesRepository,
    private readonly watcher: MailboxWatcherService,
  ) {}

  @Get()
  list(@Req() request: Request): Promise<MailboxWatch[]> {
    return this.watches.list(orgOf(request));
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown, @CurrentUser() user: { id: string }): Promise<MailboxWatch> {
    const fields = (body ?? {}) as Record<string, unknown>;
    const extra = Object.keys(fields).filter((key) => !FIELDS.has(key));
    if (extra.length > 0) throw new BadRequestException(`Unknown fields: ${extra.join(', ')}`);
    const { mailbox, credentialKey, event } = fields;
    const query = fields.query ?? 'in:inbox';
    const schedule = fields.schedule ?? '*/5 * * * *';
    if (typeof mailbox !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(mailbox)) throw new BadRequestException('mailbox must be an email address');
    if (typeof credentialKey !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(credentialKey)) {
      throw new BadRequestException('credentialKey names the gmail/<credentialKey> credential (a short lowercase name)');
    }
    if (typeof query !== 'string' || query.trim().length === 0 || query.length > 500) throw new BadRequestException('query is a Gmail search, e.g. in:inbox');
    if (typeof schedule !== 'string' || !validateCronExpression(schedule).valid) throw new BadRequestException('schedule must be a cron expression, e.g. */5 * * * *');
    if (typeof event !== 'string' || !EVENT_NAME.test(event)) {
      throw new BadRequestException("event must be lowercase words joined by '.', '_' or '-', e.g. order.email");
    }
    let watch: MailboxWatch;
    try {
      watch = await this.watches.create({
        org_slug: orgOf(request),
        provider: 'gmail',
        mailbox: mailbox.trim(),
        credential_key: credentialKey,
        query: query.trim(),
        schedule,
        event,
        created_by: user.id,
      });
    } catch (error) {
      if ((error as Error).message.includes('already watched')) throw new BadRequestException((error as Error).message);
      throw error;
    }
    this.watcher.sync(watch, watch.id);
    return watch;
  }

  /** Read the mailbox now instead of waiting for the schedule. */
  @Post(':id/poll')
  @HttpCode(HttpStatus.OK)
  async poll(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string): Promise<MailboxPollResult | { skipped: string }> {
    const orgSlug = orgOf(request);
    if (!(await this.watches.get(orgSlug, id))) throw new NotFoundException(`Mailbox watch ${id} not found`);
    return this.watcher.poll(id, orgSlug);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    if (!(await this.watches.delete(orgOf(request), id))) throw new NotFoundException(`Mailbox watch ${id} not found`);
    this.watcher.sync(null, id);
  }
}

function orgOf(request: Request): string {
  const orgSlug = (request as Request & { organizationSlug?: string }).organizationSlug;
  if (!orgSlug || orgSlug === '*') throw new BadRequestException('A specific authorized organization is required');
  return orgSlug;
}
