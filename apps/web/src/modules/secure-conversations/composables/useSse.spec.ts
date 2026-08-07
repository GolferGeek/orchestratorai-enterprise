import { describe, expect, it } from 'vitest';
import { parseSecureConversationsEvent } from './useSse';

describe('Secure Conversations stream event boundary', () => {
  it('accepts a tenant-bound platform event', () => {
    const event = parseSecureConversationsEvent(
      JSON.stringify({
        organizationSlug: 'acme',
        type: 'inbound.validated',
        timestamp: '2026-08-06T13:00:00.000Z',
        success: true,
      }),
      'acme',
    );
    expect(event.type).toBe('inbound.validated');
  });

  it.each([
    [
      JSON.stringify({
        organizationSlug: 'other-org',
        type: 'heartbeat',
        timestamp: '2026-08-06T13:00:00.000Z',
      }),
    ],
    [
      JSON.stringify({
        organizationSlug: 'acme',
        type: 'unknown.event',
        timestamp: '2026-08-06T13:00:00.000Z',
      }),
    ],
    ['not-json'],
  ])('rejects malformed or cross-tenant events', (payload) => {
    expect(() => parseSecureConversationsEvent(payload, 'acme')).toThrow(
      'malformed',
    );
  });
});
