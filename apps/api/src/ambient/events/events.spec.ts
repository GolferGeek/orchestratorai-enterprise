import { BadRequestException } from '@nestjs/common';
import type { Trigger } from '../ambient-database/database.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import { matchesEvent } from '../services/trigger-evaluator.service';
import { parsePushBody } from './events.controller';

const trigger = (source_type: string, source_config: Record<string, unknown> = {}, id = 't-1') =>
  ({ id, name: 'T', source_type, source_config }) as Trigger;
const pushed = (name: string): AmbientEvent => ({
  orgSlug: 'finance',
  sourceType: 'event',
  pushed: { id: 'e-1', name, source: 'api:u' },
  payload: {},
  timestamp: '2026-09-28T00:00:00Z',
});

describe('which triggers answer an event', () => {
  it('matches a pushed event by name, and only event triggers', () => {
    expect(matchesEvent(trigger('event', { event: 'invoice.received' }), pushed('invoice.received'))).toBe(true);
    expect(matchesEvent(trigger('event', { event: 'invoice.paid' }), pushed('invoice.received'))).toBe(false);
    expect(matchesEvent(trigger('database', { table: 'invoices' }), pushed('invoice.received'))).toBe(false);
  });

  it('matches watch events by source type, and a targeted fire only its trigger', () => {
    const cron: AmbientEvent = { orgSlug: 'o', sourceType: 'cron', payload: {}, timestamp: 't' };
    expect(matchesEvent(trigger('cron'), cron)).toBe(true);
    expect(matchesEvent(trigger('database'), cron)).toBe(false);
    const manual: AmbientEvent = { orgSlug: 'o', sourceType: 'event', triggerId: 't-2', payload: {}, timestamp: 't' };
    expect(matchesEvent(trigger('event', { event: 'x' }, 't-2'), manual)).toBe(true);
    expect(matchesEvent(trigger('event', { event: 'x' }, 't-1'), manual)).toBe(false);
  });

  it('refuses a pushed event that was never stored', () => {
    const unstored: AmbientEvent = { orgSlug: 'o', sourceType: 'event', payload: {}, timestamp: 't' };
    expect(() => matchesEvent(trigger('event', { event: 'x' }), unstored)).toThrow('stored id');
  });
});

describe('the push request body', () => {
  it('takes an event name, an object payload and an optional dedupe key', () => {
    expect(parsePushBody({ event: 'invoice.received', payload: { n: 1 } })).toEqual({ name: 'invoice.received', payload: { n: 1 } });
    expect(parsePushBody({ event: 'a_b-c.d', payload: {}, dedupeKey: 'INV-1' })).toEqual({ name: 'a_b-c.d', payload: {}, dedupeKey: 'INV-1' });
  });

  it('rejects bad names, payloads, keys and unknown fields', () => {
    for (const body of [
      null,
      [],
      { event: 'Invoice.Received', payload: {} },
      { event: 'invoice..received', payload: {} },
      { event: 'invoice.received', payload: [] },
      { event: 'invoice.received' },
      { event: 'invoice.received', payload: {}, dedupeKey: '' },
      { event: 'invoice.received', payload: {}, orgSlug: 'other' },
    ]) {
      expect(() => parsePushBody(body)).toThrow(BadRequestException);
    }
  });
});
