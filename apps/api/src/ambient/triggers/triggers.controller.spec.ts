import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { AmbientDatabaseService } from '../ambient-database/database.service';
import type { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import type { CronAdapterService } from '../listeners/cron-adapter.service';
import { TriggersController } from './triggers.controller';

function setup() {
  const db = {
    createTrigger: jest.fn(async (record: Record<string, unknown>) => ({ id: 't1', ...record })),
    updateTrigger: jest.fn(async () => ({ id: 't1', enabled: false, source_type: 'cron' })),
    deleteTrigger: jest.fn(async () => undefined),
  };
  const cron = { sync: jest.fn(), unschedule: jest.fn() };
  const controller = new TriggersController(
    db as unknown as AmbientDatabaseService,
    {} as AmbientEventBusService,
    cron as unknown as CronAdapterService,
  );
  const request = { organizationSlug: 'corporate' } as unknown as Request;
  return { controller, db, cron, request };
}

const base = { org_slug: 'corporate', name: 'weekly', source_type: 'cron', source_config: { expression: '0 7 * * 1' } };

describe('TriggersController', () => {
  it('creates a workflow trigger and schedules it at once', async () => {
    const { controller, db, cron, request } = setup();
    await controller.createTrigger(
      { ...base, action_config: { workflowSlug: 'decision-risk', input: { proposition: 'Renew the vendor' } } },
      request,
      { id: 'admin-1' },
    );
    expect(db.createTrigger).toHaveBeenCalledWith(expect.objectContaining({ response_kind: 'workflow', created_by: 'admin-1' }));
    expect(cron.sync).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it.each([
    ['neither an agent nor a workflow', {}, 'exactly one of agentSlug'],
    ['both', { agentSlug: 'a', workflowSlug: 'w', input: {} }, 'exactly one of agentSlug'],
    ['a workflow without its input', { workflowSlug: 'decision-risk' }, 'start input'],
  ])('refuses %s', async (_label, action_config, message) => {
    const { controller, db, request } = setup();
    await expect(controller.createTrigger({ ...base, action_config }, request, { id: 'a' })).rejects.toThrow(message);
    await expect(controller.createTrigger({ ...base, action_config }, request, { id: 'a' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.createTrigger).not.toHaveBeenCalled();
  });

  it('reschedules on change and unschedules on delete', async () => {
    const { controller, cron, request } = setup();
    await controller.updateTrigger('t1', { enabled: false }, request);
    expect(cron.sync).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', enabled: false }));
    await controller.deleteTrigger('t1', request);
    expect(cron.unschedule).toHaveBeenCalledWith('t1');
  });
});
