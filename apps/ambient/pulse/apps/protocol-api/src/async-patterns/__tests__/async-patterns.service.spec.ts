import 'reflect-metadata';

/**
 * Unit tests for AsyncPatternsService.
 *
 * Strategy: mock global.fetch and the MessagesService dependency so tests run
 * without any external services. All service logic is exercised in isolation.
 *
 * No setTimeout/setInterval is used as a completion mechanism — the service fires
 * async work and returns immediately. Tests verify this by checking return values
 * before any microtasks settle.
 */

// ---------------------------------------------------------------------------
// Mock @agent-communication/shared-protocols before importing the service
// ---------------------------------------------------------------------------
jest.mock('@agent-communication/shared-protocols', () => ({
  getAuthHeadersAsync: jest.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
  CallbackCorrelationService: jest.fn().mockImplementation(() => ({
    initiate: jest.fn().mockReturnValue({ correlationId: 'test-corr-id', state: 'initiated' }),
    markSent: jest.fn().mockReturnValue({ correlationId: 'test-corr-id', state: 'callback-sent' }),
    receiveCallback: jest.fn().mockReturnValue({ correlationId: 'test-corr-id', state: 'callback-received' }),
    verify: jest.fn().mockReturnValue({ correlationId: 'test-corr-id', state: 'verified' }),
    fail: jest.fn(),
    requireArtifact: jest.fn(),
    getRecord: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @agent-communication/shared-types — we only need ProtocolMessage shape
// ---------------------------------------------------------------------------
jest.mock('@agent-communication/shared-types', () => ({}));

// ---------------------------------------------------------------------------
// Now import the service under test
// ---------------------------------------------------------------------------
import { AsyncPatternsService } from '../async-patterns.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessagesService() {
  return {
    recordMessage: jest.fn(),
  };
}

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AsyncPatternsService', () => {
  let service: AsyncPatternsService;
  let messagesService: ReturnType<typeof makeMessagesService>;

  beforeEach(() => {
    messagesService = makeMessagesService();
    service = new AsyncPatternsService(messagesService as never);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. fire-and-forget
  // -------------------------------------------------------------------------
  describe('fireAndForget()', () => {
    it('returns 202-equivalent immediately without waiting for MarketPulse', async () => {
      // Arrange: fetch will eventually resolve but we do not await it
      let fetchResolve!: (v: Response) => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise<Response>((resolve) => { fetchResolve = resolve; }),
      );

      // Act: call should return before the fetch resolves
      const result = await service.fireAndForget();

      // Assert: returned accepted immediately
      expect(result.status).toBe('accepted');
      expect(result.dispatchedAt).toBeDefined();
      expect(result.message).toMatch(/MarketPulse/);

      // A message was recorded for the outbound dispatch
      expect(messagesService.recordMessage).toHaveBeenCalledTimes(1);
      const recorded = messagesService.recordMessage.mock.calls[0][0] as { source: string; target: string; method: string };
      expect(recorded.source).toBe('protocol-api');
      expect(recorded.target).toBe('market-pulse');
      expect(recorded.method).toBe('agent.scan');

      // Clean up the dangling promise
      fetchResolve(makeFetchResponse({ feedsScanned: 5 }));
    });

    it('records a second message when the async dispatch completes', async () => {
      const scanResult = { feedsScanned: 3, articlesFound: 12, newArticles: 4, timestamp: new Date().toISOString() };
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(scanResult));

      await service.fireAndForget();

      // Allow the background promise to settle
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // Expect: initial outbound message + response message
      expect(messagesService.recordMessage).toHaveBeenCalledTimes(2);
      const secondCall = messagesService.recordMessage.mock.calls[1][0] as { source: string; status: string };
      expect(secondCall.source).toBe('market-pulse');
      expect(secondCall.status).toBe('success');
    });

    it('does not use setTimeout as the completion mechanism', () => {
      // The service code should not use setTimeout to determine when work is done.
      // We verify by checking the source code via a static inspection approach:
      // The service's fireAndForget method must return before any timeout fires.
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({}));

      // Start the operation
      const promise = service.fireAndForget();

      // Before any microtasks: setTimeout should NOT have been called by the
      // fire-and-forget submission logic (it may be called by streaming, but
      // the core return path must be immediate).
      const callsBeforeSettle = setTimeoutSpy.mock.calls.length;

      return promise.then((result) => {
        // The function returned an accepted result
        expect(result.status).toBe('accepted');
        // No setTimeout was used to gate the response
        expect(setTimeoutSpy.mock.calls.length).toBe(callsBeforeSettle);
        setTimeoutSpy.mockRestore();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. request-response
  // -------------------------------------------------------------------------
  describe('requestResponse()', () => {
    it('calls ResearchHub /agent/analyze and returns structured result', async () => {
      const researchResult = {
        topic: 'agent communication patterns',
        narrative: 'Agents communicate via well-defined protocols.',
        relatedArticles: [{ id: 'art-1', title: 'A2A Patterns' }],
        relatedCategories: [{ id: 'cat-1', name: 'Protocols' }],
        relatedSignals: [],
        analyzedAt: '2026-03-11T00:00:00.000Z',
      };
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(researchResult));

      const result = await service.requestResponse();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/localhost:4001\/agent\/analyze/);

      expect(result.topic).toBe('agent communication patterns');
      expect(result.relatedArticles).toHaveLength(1);
      expect(result.roundTripMs).toBeGreaterThanOrEqual(0);
    });

    it('records both request and response messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        makeFetchResponse({ topic: 'x', narrative: null, relatedArticles: [], relatedCategories: [], relatedSignals: [], analyzedAt: '' }),
      );

      await service.requestResponse();

      expect(messagesService.recordMessage).toHaveBeenCalledTimes(2);
      const [req, resp] = messagesService.recordMessage.mock.calls.map((c) => c[0] as { source: string; target: string; status: string });
      expect(req.source).toBe('protocol-api');
      expect(req.target).toBe('research-hub');
      expect(resp.source).toBe('research-hub');
      expect(resp.status).toBe('success');
    });

    it('throws when ResearchHub returns a non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ error: 'unavailable' }, 503));

      await expect(service.requestResponse()).rejects.toThrow(/ResearchHub.*503/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. callback — submit
  // -------------------------------------------------------------------------
  describe('submitCallbackTask()', () => {
    it('returns 202-equivalent with taskId immediately', async () => {
      // Fetch will eventually complete (we do not await it)
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ id: 'exec-001', topic: 'test' }));

      const result = await service.submitCallbackTask('my-callback-id');

      expect(result.status).toBe('accepted');
      expect(result.taskId).toBe('my-callback-id');
      expect(result.submittedAt).toBeDefined();
    });

    it('stores task as pending before the async work completes', async () => {
      let fetchResolve!: (v: Response) => void;
      (global.fetch as jest.Mock).mockReturnValue(
        new Promise<Response>((resolve) => { fetchResolve = resolve; }),
      );

      await service.submitCallbackTask('pending-test-id');

      // Task is pending before fetch resolves
      const pending = service.getCallbackResult('pending-test-id');
      expect(pending.status).toBe('pending');

      // Clean up
      fetchResolve(makeFetchResponse({ id: 'exec-001' }));
    });
  });

  // -------------------------------------------------------------------------
  // 4. callback — retrieval
  // -------------------------------------------------------------------------
  describe('getCallbackResult()', () => {
    it('returns pending status for unknown taskId', () => {
      const result = service.getCallbackResult('unknown-task-xyz');
      expect(result.status).toBe('pending');
      expect(result.taskId).toBe('unknown-task-xyz');
    });

    it('returns complete status with result after the async work settles', async () => {
      const forgeResult = { id: 'exec-001', topic: 'async callback pattern', totalDuration: 4240 };
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(forgeResult));

      await service.submitCallbackTask('complete-test-id');

      // Wait for the background executeCallbackTask to finish
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const result = service.getCallbackResult('complete-test-id');
      expect(result.status).toBe('complete');
      expect(result.result).toMatchObject({ id: 'exec-001' });
    });
  });

  // -------------------------------------------------------------------------
  // 5. polling — submit
  // -------------------------------------------------------------------------
  describe('submitPollingTask()', () => {
    it('returns 202-equivalent with a taskId immediately', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ title: 'Draft', content: 'Text.' }));

      const result = await service.submitPollingTask();

      expect(result.status).toBe('accepted');
      expect(result.taskId).toMatch(/^poll-/);
      expect(result.message).toMatch(/ContentForge/);
    });

    it('records the submitted message before returning', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ title: 'Draft' }));

      await service.submitPollingTask();

      expect(messagesService.recordMessage).toHaveBeenCalled();
      const firstCall = messagesService.recordMessage.mock.calls[0][0] as { method: string; source: string };
      expect(firstCall.method).toBe('agent.draft');
      expect(firstCall.source).toBe('protocol-api');
    });
  });

  // -------------------------------------------------------------------------
  // 6. polling — status retrieval
  // -------------------------------------------------------------------------
  describe('getPollingStatus()', () => {
    it('returns pending for an unknown taskId', () => {
      const result = service.getPollingStatus('not-a-real-task');
      expect(result.status).toBe('pending');
    });

    it('returns pending immediately after submit, then complete after async work', async () => {
      const draftResult = { title: 'Async Polling Pattern', content: 'Content about polling.' };
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(draftResult));

      const submitted = await service.submitPollingTask();
      const taskId = submitted.taskId;

      // Immediately after submit: still pending
      expect(service.getPollingStatus(taskId).status).toBe('pending');

      // Wait for the background work to complete
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // Now it should be complete
      const finalStatus = service.getPollingStatus(taskId);
      expect(finalStatus.status).toBe('complete');
      expect(finalStatus.result).toMatchObject({ title: 'Async Polling Pattern' });
    });
  });

  // -------------------------------------------------------------------------
  // 7. streaming
  // -------------------------------------------------------------------------
  describe('streamResearch()', () => {
    it('yields data events followed by a done event', async () => {
      const researchData = {
        narrative: 'Streaming is a first-class A2A pattern.',
        relatedArticles: [{ id: 'art-1' }, { id: 'art-2' }],
      };
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse(researchData));

      const events: Array<{ type: string; chunk?: string; tokenCount?: number }> = [];
      for await (const event of service.streamResearch()) {
        events.push(event);
      }

      const dataEvents = events.filter((e) => e.type === 'data');
      const doneEvents = events.filter((e) => e.type === 'done');

      expect(dataEvents.length).toBeGreaterThan(0);
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].tokenCount).toBeGreaterThan(0);

      // First data chunk should contain the narrative
      expect(dataEvents[0].chunk).toMatch(/Streaming is a first-class A2A pattern/);

      // Second data chunk should report article count
      expect(dataEvents[1].chunk).toMatch(/2 related articles/);
    });

    it('yields an error event when ResearchHub returns non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ error: 'overloaded' }, 429));

      const events: Array<{ type: string; message?: string }> = [];
      for await (const event of service.streamResearch()) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].message).toMatch(/429/);
    });

    it('records messages to the observability store after streaming', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        makeFetchResponse({ narrative: 'Test narrative.', relatedArticles: [] }),
      );

      // Consume all events
      for await (const _ of service.streamResearch()) { /* drain */ }

      // At minimum one request message + one response message should be recorded
      expect(messagesService.recordMessage).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 8. No setTimeout/setInterval used as completion mechanism
  // -------------------------------------------------------------------------
  describe('no setTimeout/setInterval as completion mechanism', () => {
    it('fireAndForget completes synchronously without scheduling a timeout', async () => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const originalSetTimeout = global.setTimeout.bind(global);
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
          const id = originalSetTimeout(fn, delay, ...args);
          timers.push(id);
          return id;
        });

      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ feedsScanned: 1 }));

      await service.fireAndForget();

      // No setTimeout should have been used to determine when to return the result
      expect(setTimeoutSpy).not.toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
      timers.forEach(clearTimeout);
    });

    it('submitCallbackTask completes synchronously without scheduling a timeout', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ id: 'exec-001' }));

      await service.submitCallbackTask('no-timer-test');

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });

    it('submitPollingTask completes synchronously without scheduling a timeout', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      (global.fetch as jest.Mock).mockResolvedValue(makeFetchResponse({ title: 'Draft' }));

      await service.submitPollingTask();

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });
  });
});
