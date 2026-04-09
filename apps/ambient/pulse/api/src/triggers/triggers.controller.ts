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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';

@Controller('triggers')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class TriggersController {
  constructor(
    private readonly db: AmbientDatabaseService,
    private readonly eventBus: AmbientEventBusService,
  ) {}

  /**
   * List all triggers where product='pulse'.
   */
  @Get()
  async listTriggers(): Promise<Trigger[]> {
    return this.db.getTriggersByProduct('pulse');
  }

  /**
   * Get a single trigger by ID.
   * Fetches all pulse triggers and finds the matching one.
   */
  @Get(':id')
  async getTrigger(@Param('id') id: string): Promise<Trigger> {
    const triggers = await this.db.getTriggersByProduct('pulse');
    const trigger = triggers.find((t) => t.id === id);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }
    return trigger;
  }

  /**
   * Create a new trigger for pulse.
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
      action_config: {
        agentSlug: string;
        agentType?: string;
        provider?: string;
        model?: string;
        mode?: string;
        action?: string;
        payload?: Record<string, unknown>;
        messageTemplate?: string;
      };
      cooldown_seconds?: number;
      max_fires_per_hour?: number;
      created_by?: string;
    },
  ): Promise<Trigger> {
    if (!body.org_slug) {
      throw new BadRequestException('org_slug is required');
    }
    if (!body.name) {
      throw new BadRequestException('name is required');
    }
    if (!body.source_type) {
      throw new BadRequestException('source_type is required');
    }
    if (!body.action_config?.agentSlug) {
      throw new BadRequestException('action_config.agentSlug is required');
    }

    return this.db.createTrigger({
      org_slug: body.org_slug,
      name: body.name,
      description: body.description ?? null,
      source_type: body.source_type,
      enabled: body.enabled ?? true,
      source_config: body.source_config,
      condition: body.condition ?? null,
      action_config: body.action_config,
      cooldown_seconds: body.cooldown_seconds ?? 0,
      max_fires_per_hour: body.max_fires_per_hour ?? null,
      created_by: body.created_by ?? null,
      product: 'pulse',
    });
  }

  /**
   * Update a trigger (enable/disable, edit config, etc.).
   */
  @Patch(':id')
  async updateTrigger(
    @Param('id') id: string,
    @Body() update: Partial<Omit<Trigger, 'id' | 'created_at' | 'product'>>,
  ): Promise<Trigger> {
    const result = await this.db.updateTrigger(id, update);
    if (!result) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }
    return result;
  }

  /**
   * Delete a trigger.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTrigger(@Param('id') id: string): Promise<void> {
    await this.db.deleteTrigger(id);
  }

  /**
   * Manually fire a trigger by emitting an event to the ambient event bus.
   */
  @Post(':id/run')
  async runTrigger(@Param('id') id: string): Promise<{ accepted: boolean; triggerId: string }> {
    const triggers = await this.db.getTriggersByProduct('pulse');
    const trigger = triggers.find((t) => t.id === id);
    if (!trigger) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }

    this.eventBus.emit({
      sourceType: trigger.source_type as 'database' | 'filesystem' | 'cron' | 'internal-a2a',
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
  async getTriggerExecutions(@Param('id') id: string): Promise<TriggerExecution[]> {
    return this.db.getRecentExecutions(id, 100);
  }
}
