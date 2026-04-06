/**
 * Unit tests for TriggersController
 *
 * Tests:
 * - listTriggers() delegates to AmbientDatabaseService.getTriggersByProduct('pulse')
 * - getTrigger() throws NotFoundException when trigger not found
 * - createTrigger() throws BadRequestException for missing required fields
 * - updateTrigger() delegates to AmbientDatabaseService.updateTrigger()
 * - runTrigger() emits event via AmbientEventBusService and returns accepted:true
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TriggersController } from './triggers.controller';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';

describe('TriggersController', () => {
  let controller: TriggersController;
  let mockDb: jest.Mocked<
    Pick<
      AmbientDatabaseService,
      | 'getTriggersByProduct'
      | 'createTrigger'
      | 'updateTrigger'
      | 'deleteTrigger'
      | 'getRecentExecutions'
    >
  >;
  let mockEventBus: jest.Mocked<Pick<AmbientEventBusService, 'emit'>>;

  const sampleTrigger: Trigger = {
    id: 'trig-001',
    org_slug: 'acme',
    name: 'Daily Risk Analysis',
    description: 'Runs risk analysis every day',
    source_type: 'cron',
    enabled: true,
    source_config: { schedule: '0 6 * * *' },
    condition: null,
    action_config: {
      agentSlug: 'marketing-swarm',
      agentType: 'langgraph',
      mode: 'converse',
      action: 'execute',
    },
    cooldown_seconds: 0,
    max_fires_per_hour: null,
    last_fired_at: null,
    created_by: 'user-1',
    product: 'pulse',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockDb = {
      getTriggersByProduct: jest.fn().mockResolvedValue([sampleTrigger]),
      createTrigger: jest.fn().mockResolvedValue(sampleTrigger),
      updateTrigger: jest.fn().mockResolvedValue(sampleTrigger),
      deleteTrigger: jest.fn().mockResolvedValue(undefined),
      getRecentExecutions: jest.fn().mockResolvedValue([]),
    };

    mockEventBus = {
      emit: jest.fn(),
    };

    controller = new TriggersController(
      mockDb as unknown as AmbientDatabaseService,
      mockEventBus as unknown as AmbientEventBusService,
    );
  });

  // ─── listTriggers ────────────────────────────────────────────────────────

  it('delegates to AmbientDatabaseService.getTriggersByProduct("pulse")', async () => {
    const result = await controller.listTriggers();

    expect(mockDb.getTriggersByProduct).toHaveBeenCalledWith('pulse');
    expect(result).toEqual([sampleTrigger]);
  });

  // ─── getTrigger ──────────────────────────────────────────────────────────

  it('returns matching trigger by id', async () => {
    const result = await controller.getTrigger('trig-001');

    expect(result).toEqual(sampleTrigger);
  });

  it('throws NotFoundException when trigger id is not found', async () => {
    await expect(controller.getTrigger('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── createTrigger ───────────────────────────────────────────────────────

  it('creates a trigger via AmbientDatabaseService with product="pulse"', async () => {
    const body = {
      org_slug: 'acme',
      name: 'New Trigger',
      source_type: 'cron',
      source_config: { schedule: '0 6 * * *' },
      action_config: { agentSlug: 'marketing-swarm' },
    };

    await controller.createTrigger(body);

    expect(mockDb.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'pulse', org_slug: 'acme', name: 'New Trigger' }),
    );
  });

  it('throws BadRequestException when org_slug is missing', async () => {
    const body = {
      org_slug: '',
      name: 'Test',
      source_type: 'cron',
      source_config: {},
      action_config: { agentSlug: 'marketing-swarm' },
    };

    await expect(controller.createTrigger(body)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when action_config.agentSlug is missing', async () => {
    const body = {
      org_slug: 'acme',
      name: 'Test',
      source_type: 'cron',
      source_config: {},
      action_config: { agentSlug: '' },
    };

    await expect(controller.createTrigger(body)).rejects.toThrow(BadRequestException);
  });

  // ─── updateTrigger ───────────────────────────────────────────────────────

  it('delegates update to AmbientDatabaseService.updateTrigger()', async () => {
    const update = { enabled: false };

    await controller.updateTrigger('trig-001', update);

    expect(mockDb.updateTrigger).toHaveBeenCalledWith('trig-001', update);
  });

  it('throws NotFoundException when updateTrigger returns null', async () => {
    mockDb.updateTrigger.mockResolvedValue(null);

    await expect(
      controller.updateTrigger('ghost-trigger', { enabled: false }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── runTrigger ──────────────────────────────────────────────────────────

  it('emits event to AmbientEventBusService and returns accepted:true', async () => {
    const result = await controller.runTrigger('trig-001');

    expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = mockEventBus.emit.mock.calls[0]![0];
    expect(emittedEvent.triggerId).toBe('trig-001');
    expect(emittedEvent.payload).toMatchObject({ manualFire: true });

    expect(result).toEqual({ accepted: true, triggerId: 'trig-001' });
  });

  it('throws NotFoundException in runTrigger when trigger not found', async () => {
    await expect(controller.runTrigger('nonexistent')).rejects.toThrow(NotFoundException);
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  // ─── getTriggerExecutions ───────────────────────────────────────────────

  it('delegates to AmbientDatabaseService.getRecentExecutions() with limit 100', async () => {
    const executions: TriggerExecution[] = [];
    mockDb.getRecentExecutions.mockResolvedValue(executions);

    const result = await controller.getTriggerExecutions('trig-001');

    expect(mockDb.getRecentExecutions).toHaveBeenCalledWith('trig-001', 100);
    expect(result).toBe(executions);
  });
});
