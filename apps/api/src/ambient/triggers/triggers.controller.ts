import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { DATABASE_CONNECTION_NAMES, type DatabaseConnectionName } from '@orchestratorai/planes/database';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import { CronAdapterService } from '../listeners/cron-adapter.service';
import { EVENT_NAME } from '../events/ambient-events.service';

@Controller('ambient/triggers')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class TriggersController {
  constructor(
    private readonly db: AmbientDatabaseService,
    private readonly eventBus: AmbientEventBusService,
    private readonly cron: CronAdapterService,
  ) {}

  /**
   * List all Ambient triggers.
   */
  @Get()
  async listTriggers(@Req() request: Request): Promise<Trigger[]> {
    return this.db.getEnabledTriggers(this.getOrganizationSlug(request));
  }

  /**
   * Get a single trigger by ID.
   * Fetches all Ambient triggers and finds the matching one.
   */
  @Get(':id')
  async getTrigger(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<Trigger> {
    const triggers = await this.db.getEnabledTriggers(
      this.getOrganizationSlug(request),
    );
    const trigger = triggers.find((t) => t.id === id);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }
    return trigger;
  }

  /**
   * Create a new Ambient trigger.
   */
  @Post()
  async createTrigger(
    @Body()
    body: {
      org_slug: string;
      name: string;
      description?: string;
      source_type: string;
      enabled?: boolean;
      source_config: Record<string, unknown>;
      condition?: Record<string, unknown>;
      action_config: Trigger['action_config'];
      cooldown_seconds?: number;
      max_fires_per_hour?: number;
      created_by?: string;
    },
    @Req() request: Request,
    @CurrentUser() user: { id: string },
  ): Promise<Trigger> {
    const authorizedOrgSlug = this.getOrganizationSlug(request);
    const targetOrgSlug =
      authorizedOrgSlug && authorizedOrgSlug !== '*'
        ? authorizedOrgSlug
        : body.org_slug;
    if (!targetOrgSlug) {
      throw new BadRequestException('org_slug is required');
    }
    if (
      authorizedOrgSlug &&
      authorizedOrgSlug !== '*' &&
      body.org_slug &&
      body.org_slug !== authorizedOrgSlug
    ) {
      throw new BadRequestException(
        'org_slug must match the authorized organization',
      );
    }
    if (!body.name) {
      throw new BadRequestException('name is required');
    }
    if (!body.source_type) {
      throw new BadRequestException('source_type is required');
    }
    assertEventTrigger(body.source_type, body.source_config);
    assertDatabaseTrigger(body.source_type, body.source_config);
    const { agentSlug, workflowSlug, input } = body.action_config ?? {};
    if (Boolean(agentSlug) === Boolean(workflowSlug)) {
      throw new BadRequestException('action_config needs exactly one of agentSlug (an agent) or workflowSlug (a workflow)');
    }
    if (body.action_config?.documentFromEvent !== undefined && (body.action_config.documentFromEvent !== true || !workflowSlug)) {
      throw new BadRequestException('action_config.documentFromEvent is true on a workflow trigger, or absent');
    }
    if (workflowSlug && (typeof input !== 'object' || input === null || Array.isArray(input))) {
      throw new BadRequestException('action_config.input must be the workflow\'s start input (an object)');
    }

    const created = await this.db.createTrigger({
      org_slug: targetOrgSlug,
      name: body.name,
      description: body.description ?? null,
      source_type: body.source_type,
      enabled: body.enabled ?? true,
      source_config: body.source_config,
      condition: body.condition ?? null,
      action_config: body.action_config,
      trigger_kind: body.source_type,
      trigger_config: body.source_config,
      response_kind: workflowSlug ? 'workflow' : 'capability',
      response_config: body.action_config,
      cooldown_seconds: body.cooldown_seconds ?? 0,
      max_fires_per_hour: body.max_fires_per_hour ?? null,
      created_by: user.id,
    });
    this.cron.sync(created);
    return created;
  }

  /**
   * Update a trigger (enable/disable, edit config, etc.).
   */
  @Patch(':id')
  async updateTrigger(
    @Param('id') id: string,
    @Body() update: Partial<Omit<Trigger, 'id' | 'created_at'>>,
    @Req() request: Request,
  ): Promise<Trigger> {
    const {
      id: _id,
      org_slug: _orgSlug,
      created_by: _createdBy,
      ...safeUpdate
    } = update as Partial<Trigger>;
    if (safeUpdate.source_type !== undefined || safeUpdate.source_config !== undefined) {
      const orgSlug = this.getOrganizationSlug(request);
      if (!orgSlug) throw new BadRequestException('An authorized organization is required');
      const current = await this.db.getTrigger(id, orgSlug);
      if (!current) throw new NotFoundException(`Trigger ${id} not found`);
      assertEventTrigger(safeUpdate.source_type ?? current.source_type, safeUpdate.source_config ?? current.source_config);
      assertDatabaseTrigger(safeUpdate.source_type ?? current.source_type, safeUpdate.source_config ?? current.source_config);
    }
    const result = await this.db.updateTrigger(
      id,
      safeUpdate,
      this.getOrganizationSlug(request),
    );
    if (!result) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }
    this.cron.sync(result);
    return result;
  }

  /**
   * Delete a trigger.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTrigger(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.db.deleteTrigger(id, this.getOrganizationSlug(request));
    this.cron.unschedule(id);
  }

  /**
   * Manually fire a trigger by emitting an event to the ambient event bus.
   */
  @Post(':id/run')
  async runTrigger(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<{ accepted: boolean; triggerId: string }> {
    const triggers = await this.db.getEnabledTriggers(
      this.getOrganizationSlug(request),
    );
    const trigger = triggers.find((t) => t.id === id);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }

    this.eventBus.emit({
      orgSlug: trigger.org_slug,
      sourceType: trigger.source_type as AmbientEvent['sourceType'],
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: { manualFire: true },
      timestamp: new Date().toISOString(),
    });

    return { accepted: true, triggerId: id };
  }

  /**
   * Get execution history for a specific trigger.
   */
  @Get(':id/executions')
  async getTriggerExecutions(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<TriggerExecution[]> {
    return this.db.getRecentExecutions(
      id,
      100,
      this.getOrganizationSlug(request),
    );
  }

  private getOrganizationSlug(request: Request): string | undefined {
    return (request as Request & { organizationSlug?: string })
      .organizationSlug;
  }
}

/**
 * A database trigger names the database it watches (source_config.connection:
 * platform or business) and its table; there is no default database.
 */
function assertDatabaseTrigger(sourceType: string, sourceConfig: Record<string, unknown> | undefined): void {
  if (sourceType !== 'database') return;
  if (!DATABASE_CONNECTION_NAMES.includes(sourceConfig?.connection as DatabaseConnectionName)) {
    throw new BadRequestException("A 'database' trigger needs source_config.connection: platform or business");
  }
  if (typeof sourceConfig?.table !== 'string' || !sourceConfig.table) {
    throw new BadRequestException("A 'database' trigger needs source_config.table");
  }
}

/** A trigger on pushed events names the event it answers (source_config.event). */
function assertEventTrigger(sourceType: string, sourceConfig: Record<string, unknown> | undefined): void {
  if (sourceType !== 'event') return;
  const name = sourceConfig?.event;
  if (typeof name !== 'string' || !EVENT_NAME.test(name)) {
    throw new BadRequestException("An 'event' trigger needs source_config.event, e.g. invoice.received");
  }
}
