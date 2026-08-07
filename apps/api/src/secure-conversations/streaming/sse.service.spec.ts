import { EventEmitter } from 'events';
import { Response } from 'express';
import { SseService } from './sse.service';

class FakeResponse extends EventEmitter {
  readonly writes: string[] = [];

  setHeader = jest.fn();
  flushHeaders = jest.fn();
  end = jest.fn();

  write(payload: string): boolean {
    this.writes.push(payload);
    return true;
  }
}

describe('Secure Conversations SseService tenant isolation', () => {
  it('delivers events only to clients in the same organization', () => {
    const service = new SseService();
    const orgA = new FakeResponse();
    const orgB = new FakeResponse();

    service.addClient(orgA as unknown as Response, 'org-a');
    service.addClient(orgB as unknown as Response, 'org-b');
    orgA.writes.length = 0;
    orgB.writes.length = 0;

    service.emit({
      organizationSlug: 'org-a',
      type: 'security.violation',
      timestamp: new Date().toISOString(),
      message: 'test violation',
    });

    expect(orgA.writes).toHaveLength(1);
    expect(orgB.writes).toHaveLength(0);
    expect(service.getClientCount('org-a')).toBe(1);
    expect(service.getClientCount('org-b')).toBe(1);

    service.onModuleDestroy();
  });
});
