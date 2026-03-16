import { Test, TestingModule } from '@nestjs/testing';
import { SseService, BridgeEvent } from './sse.service';
import { Response } from 'express';

/**
 * Build a minimal mock of an Express Response suitable for SSE testing.
 */
function makeMockResponse(overrides: Partial<Response> = {}): Response {
  const eventListeners: Record<string, () => void> = {};

  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn().mockReturnValue(true),
    on: jest.fn((event: string, cb: () => void) => {
      eventListeners[event] = cb;
    }),
    _trigger: (event: string) => {
      if (eventListeners[event]) eventListeners[event]();
    },
    ...overrides,
  } as unknown as Response;
}

describe('SseService', () => {
  let service: SseService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SseService],
    }).compile();

    service = module.get<SseService>(SseService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addClient()', () => {
    it('should set platform-standard SSE headers', () => {
      const res = makeMockResponse();
      service.addClient(res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('should call flushHeaders', () => {
      const res = makeMockResponse();
      service.addClient(res);
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('should send an initial connection (heartbeat) event', () => {
      const res = makeMockResponse();
      service.addClient(res);

      const writeCalls = (res.write as jest.Mock).mock.calls;
      expect(writeCalls.length).toBeGreaterThan(0);

      const firstCall = writeCalls[0][0] as string;
      expect(firstCall.startsWith('data: ')).toBe(true);
      expect(firstCall.endsWith('\n\n')).toBe(true);

      const parsed = JSON.parse(firstCall.replace('data: ', '').trim());
      expect(parsed.type).toBe('heartbeat');
    });

    it('should increment client count when a client connects', () => {
      const res = makeMockResponse();
      service.addClient(res);
      expect(service.getClientCount()).toBe(1);
    });

    it('should decrement client count when a client disconnects', () => {
      const res = makeMockResponse() as Response & { _trigger: (e: string) => void };
      service.addClient(res);
      expect(service.getClientCount()).toBe(1);

      res._trigger('close');
      expect(service.getClientCount()).toBe(0);
    });

    it('should support multiple simultaneous clients', () => {
      service.addClient(makeMockResponse());
      service.addClient(makeMockResponse());
      service.addClient(makeMockResponse());
      expect(service.getClientCount()).toBe(3);
    });
  });

  describe('emit()', () => {
    it('should write the event to all connected clients in platform-standard format', () => {
      const res1 = makeMockResponse();
      const res2 = makeMockResponse();
      service.addClient(res1);
      service.addClient(res2);

      // Clear the initial connection writes
      (res1.write as jest.Mock).mockClear();
      (res2.write as jest.Mock).mockClear();

      const event: BridgeEvent = {
        type: 'inbound.received',
        timestamp: new Date().toISOString(),
        agentId: 'agent-ext-1',
        method: 'compose.converse',
      };

      service.emit(event);

      const r1Writes = (res1.write as jest.Mock).mock.calls;
      expect(r1Writes.length).toBe(1);
      expect(r1Writes[0][0]).toBe(`data: ${JSON.stringify(event)}\n\n`);

      const r2Writes = (res2.write as jest.Mock).mock.calls;
      expect(r2Writes.length).toBe(1);
    });

    it('should remove a dead client that throws during write', () => {
      const goodRes = makeMockResponse();
      // Allow the initial connection write to succeed; fail on subsequent emit writes
      let callCount = 0;
      const badRes = makeMockResponse({
        write: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount > 1) {
            throw new Error('socket hang up');
          }
          return true;
        }),
      });

      service.addClient(goodRes);
      service.addClient(badRes);
      expect(service.getClientCount()).toBe(2);

      // Clear initial writes
      (goodRes.write as jest.Mock).mockClear();

      const event: BridgeEvent = {
        type: 'agent.heartbeat',
        timestamp: new Date().toISOString(),
      };
      service.emit(event);

      // Dead client should be cleaned up
      expect(service.getClientCount()).toBe(1);
      // Good client still received the event
      expect((goodRes.write as jest.Mock).mock.calls.length).toBe(1);
    });
  });

  describe('heartbeat', () => {
    it('should emit a heartbeat event every 10 seconds', () => {
      const res = makeMockResponse();
      service.addClient(res);
      (res.write as jest.Mock).mockClear();

      jest.advanceTimersByTime(10000);

      const writeCalls = (res.write as jest.Mock).mock.calls;
      expect(writeCalls.length).toBe(1);
      const parsed = JSON.parse((writeCalls[0][0] as string).replace('data: ', '').trim());
      expect(parsed.type).toBe('heartbeat');
    });
  });

  describe('getClientCount()', () => {
    it('should return 0 when no clients connected', () => {
      expect(service.getClientCount()).toBe(0);
    });
  });
});
