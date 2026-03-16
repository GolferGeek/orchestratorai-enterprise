/**
 * E2E Test: Observability SSE Stream
 *
 * Tests that observability events flow correctly through the SSE stream
 * when agents execute tasks.
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data
 * - ANTHROPIC_API_KEY set in environment
 *
 * Run with: E2E_TESTS=true npx jest --config apps/api/testing/jest-e2e.json observability-sse
 */

import { EventSource } from 'eventsource';
import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL =
  process.env.SUPABASE_TEST_USER || 'admin@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'Admin123!';
const ORG_SLUG = 'finance';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for LLM operations
const LLM_TIMEOUT = 120000;

interface ObservabilityEvent {
  context?: {
    conversationId?: string;
    taskId?: string;
    userId?: string;
    agentSlug?: string;
    orgSlug?: string;
  };
  hook_event_type?: string;
  event_type?: string;
  status?: string;
  message?: string | null;
  progress?: number;
  step?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
}

// Skip if E2E_TESTS is not set
const describeE2E =
  process.env.E2E_TESTS === 'true' ? describe : describe.skip;

describeE2E('Observability SSE Stream (e2e)', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Authenticate as admin user (has admin:audit permission)
    const authResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!authResponse.ok) {
      throw new Error(
        `Authentication failed: ${authResponse.status} ${authResponse.statusText}`,
      );
    }

    const authData = await authResponse.json();
    expect(authData.accessToken).toBeDefined();
    authToken = authData.accessToken;

    // Extract userId from JWT
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      }
    } catch {
      throw new Error('Failed to extract userId from JWT');
    }
    expect(userId).toBeTruthy();
  }, 30000);

  describe('SSE Connection', () => {
    it('should connect to observability stream with valid admin token', async () => {
      const url = `${API_URL}/observability/stream?token=${encodeURIComponent(authToken)}`;
      const es = new EventSource(url);

      const connected = await new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => {
          es.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        es.onopen = () => {
          clearTimeout(timeout);
          resolve(true);
        };

        es.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        };
      });

      expect(connected).toBe(true);
      es.close();
    }, 15000);

    it('should receive connection confirmation event', async () => {
      const url = `${API_URL}/observability/stream?token=${encodeURIComponent(authToken)}`;
      const es = new EventSource(url);

      const connectionEvent = await new Promise<ObservabilityEvent>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            es.close();
            reject(new Error('No connection event received'));
          }, 10000);

          es.onmessage = (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data) as ObservabilityEvent;
              const eventType =
                data.hook_event_type || (data as { event_type?: string }).event_type;
              if (eventType === 'connected') {
                clearTimeout(timeout);
                resolve(data);
              }
            } catch {
              // Ignore parse errors
            }
          };

          es.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          };
        },
      );

      expect(connectionEvent).toBeDefined();
      es.close();
    }, 15000);
  });

  describe('Agent Observability Events', () => {
    it(
      'should emit all expected event types during BUILD execution',
      async () => {
        const receivedEvents: ObservabilityEvent[] = [];
        let conversationId: string | null = null;

        // Connect to SSE stream
        const url = `${API_URL}/observability/stream?token=${encodeURIComponent(authToken)}`;
        const es = new EventSource(url);

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          es.onopen = () => {
            clearTimeout(timeout);
            resolve();
          };

          es.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          };
        });

        // Set up event collection
        es.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as ObservabilityEvent;
            const eventType =
              data.hook_event_type || (data as { event_type?: string }).event_type;
            if (eventType !== 'connected') {
              receivedEvents.push(data);
            }
          } catch {
            // Ignore parse errors
          }
        };

        // Wait for connection confirmation
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Step 1: CONVERSE to get conversation context
        const converseResponse = await fetch(
          `${API_URL}/agent-to-agent/${ORG_SLUG}/blog-post-writer/tasks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              userMessage: 'Write a test blog post about observability testing',
              mode: 'converse',
              context: {
                orgSlug: ORG_SLUG,
                agentSlug: 'blog-post-writer',
                agentType: 'context',
                userId,
                conversationId: NIL_UUID,
                taskId: NIL_UUID,
                planId: NIL_UUID,
                deliverableId: NIL_UUID,
                provider: 'anthropic',
                model: 'claude-3-5-haiku-20241022',
              },
              payload: {},
            }),
          },
        );

        const converseData = await converseResponse.json();
        expect(converseData.success).toBe(true);

        conversationId =
          converseData.payload?.metadata?.streaming?.conversationId ||
          converseData.payload?.metadata?.conversationId;
        expect(conversationId).toBeTruthy();

        // Step 2: BUILD to trigger observability events
        const buildResponse = await fetch(
          `${API_URL}/agent-to-agent/${ORG_SLUG}/blog-post-writer/tasks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              userMessage: 'Now build the blog post',
              mode: 'build',
              context: {
                orgSlug: ORG_SLUG,
                agentSlug: 'blog-post-writer',
                agentType: 'context',
                userId,
                conversationId,
                taskId: NIL_UUID,
                planId: NIL_UUID,
                deliverableId: NIL_UUID,
                provider: 'anthropic',
                model: 'claude-3-5-haiku-20241022',
              },
              payload: {
                action: 'create',
              },
            }),
          },
        );

        const buildData = await buildResponse.json();
        expect(buildData.success).toBe(true);

        // Wait for events to be collected
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Close SSE connection
        es.close();

        // Analyze received events
        expect(receivedEvents.length).toBeGreaterThan(0);

        // Filter events for our conversation
        const ourEvents = receivedEvents.filter(
          (e) => e.context?.conversationId === conversationId,
        );
        expect(ourEvents.length).toBeGreaterThan(0);

        // Check for expected event types
        const eventTypes = new Set(
          ourEvents.map((e) => e.hook_event_type || e.status),
        );

        expect(eventTypes.has('agent.started')).toBe(true);
        expect(eventTypes.has('agent.progress')).toBe(true);
        expect(eventTypes.has('agent.completed')).toBe(true);
        expect(eventTypes.has('agent.stream.chunk')).toBe(true);
        expect(eventTypes.has('agent.llm.started')).toBe(true);
        expect(eventTypes.has('agent.llm.completed')).toBe(true);

        // Verify event sequence makes sense
        const startedEvents = ourEvents.filter(
          (e) => e.hook_event_type === 'agent.started',
        );
        const completedEvents = ourEvents.filter(
          (e) => e.hook_event_type === 'agent.completed',
        );

        expect(startedEvents.length).toBe(1);
        expect(completedEvents.length).toBe(1);

        // Started should have progress 0, completed should have progress 100
        expect(startedEvents[0]?.progress).toBe(0);
        expect(completedEvents[0]?.progress).toBe(100);
      },
      LLM_TIMEOUT,
    );

    it('should include correct context in all events', async () => {
      const receivedEvents: ObservabilityEvent[] = [];
      let conversationId: string | null = null;

      // Connect to SSE stream
      const url = `${API_URL}/observability/stream?token=${encodeURIComponent(authToken)}`;
      const es = new EventSource(url);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        es.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        es.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Failed'));
        };
      });

      es.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ObservabilityEvent;
          if (data.hook_event_type !== 'connected' && data.event_type !== 'connected') {
            receivedEvents.push(data);
          }
        } catch {
          // Ignore
        }
      };

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // CONVERSE
      const converseResponse = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/blog-post-writer/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userMessage: 'Test context propagation',
            mode: 'converse',
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: 'blog-post-writer',
              agentType: 'context',
              userId,
              conversationId: NIL_UUID,
              taskId: NIL_UUID,
              planId: NIL_UUID,
              deliverableId: NIL_UUID,
              provider: 'anthropic',
              model: 'claude-3-5-haiku-20241022',
            },
            payload: {},
          }),
        },
      );

      const converseData = await converseResponse.json();
      conversationId =
        converseData.payload?.metadata?.streaming?.conversationId ||
        converseData.payload?.metadata?.conversationId;

      // BUILD
      await fetch(`${API_URL}/agent-to-agent/${ORG_SLUG}/blog-post-writer/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          userMessage: 'Build it',
          mode: 'build',
          context: {
            orgSlug: ORG_SLUG,
            agentSlug: 'blog-post-writer',
            agentType: 'context',
            userId,
            conversationId,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022',
          },
          payload: { action: 'create' },
        }),
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));
      es.close();

      // Filter our events
      const ourEvents = receivedEvents.filter(
        (e) => e.context?.conversationId === conversationId,
      );

      // All events should have complete context
      for (const event of ourEvents) {
        expect(event.context).toBeDefined();
        expect(event.context?.conversationId).toBe(conversationId);
        expect(event.context?.userId).toBe(userId);
        expect(event.context?.agentSlug).toBe('blog-post-writer');
        expect(event.context?.orgSlug).toBe(ORG_SLUG);
        // taskId should be set (not NIL_UUID)
        expect(event.context?.taskId).toBeDefined();
        expect(event.context?.taskId).not.toBe(NIL_UUID);
      }
    }, LLM_TIMEOUT);
  });
});
