/**
 * E2E Test: Conversation SSE Stream
 *
 * Tests that conversation-specific streaming works correctly.
 * This is the streaming that users see in the conversation UI, not the admin observability view.
 *
 * Flow tested:
 * 1. Authenticate as user
 * 2. CONVERSE to establish conversation context
 * 3. BUILD to create deliverable (returns streaming metadata)
 * 4. Get stream token
 * 5. Connect to task-specific SSE stream
 * 6. Verify stream chunks are received (replayed from buffer since task already completed)
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - Supabase running with seeded data
 * - ANTHROPIC_API_KEY set in environment
 *
 * Run with: E2E_TESTS=true npx jest --config apps/api/testing/jest-e2e.json conversation-stream
 */

import { EventSource } from 'eventsource';
import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';
const AGENT_SLUG = 'blog-post-writer';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for LLM operations
const LLM_TIMEOUT = 120000;

interface StreamChunkEvent {
  context?: {
    conversationId?: string;
    taskId?: string;
    userId?: string;
    agentSlug?: string;
    orgSlug?: string;
  };
  streamId?: string;
  mode?: string;
  userMessage?: string;
  timestamp?: string;
  chunk?: {
    type?: string;
    content?: string;
    metadata?: {
      progress?: number;
      step?: string;
      message?: string;
      status?: string;
      hookEventType?: string;
    };
  };
}

// Skip if E2E_TESTS is not set
const describeE2E =
  process.env.E2E_TESTS === 'true' ? describe : describe.skip;

describeE2E('Conversation SSE Stream (e2e)', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Authenticate
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

  describe('Conversation Stream Flow', () => {
    it(
      'should receive stream chunks after BUILD completes',
      async () => {
        // Step 1: CONVERSE to get conversation context
        const converseResponse = await fetch(
          `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              userMessage: 'Write a very short test blog post about streaming tests',
              mode: 'converse',
              context: {
                orgSlug: ORG_SLUG,
                agentSlug: AGENT_SLUG,
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

        const conversationId =
          converseData.payload?.metadata?.streaming?.conversationId ||
          converseData.payload?.metadata?.conversationId ||
          converseData.context?.conversationId;
        expect(conversationId).toBeTruthy();
        expect(conversationId).not.toBe(NIL_UUID);

        // Step 2: BUILD to trigger agent execution and get streaming metadata
        const buildResponse = await fetch(
          `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
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
                agentSlug: AGENT_SLUG,
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

        // Extract streaming metadata
        const metadata = buildData.payload?.metadata || {};
        const streaming = metadata.streaming || {};

        const taskId = buildData.context?.taskId || metadata.taskId || streaming.taskId;
        expect(taskId).toBeTruthy();
        expect(taskId).not.toBe(NIL_UUID);

        const streamUrl = streaming.streamUrl || metadata.streamUrl;
        const streamTokenUrl = streaming.streamTokenUrl || metadata.streamTokenUrl;
        expect(streamUrl).toBeTruthy();
        expect(streamTokenUrl).toBeTruthy();

        // Step 3: Get stream token
        const tokenResponse = await fetch(streamTokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({}),
        });

        expect(tokenResponse.ok).toBe(true);
        const tokenData = await tokenResponse.json();
        expect(tokenData.token).toBeTruthy();

        // Step 4: Connect to SSE stream and collect events
        const receivedChunks: StreamChunkEvent[] = [];

        const url = new URL(streamUrl);
        url.searchParams.set('token', tokenData.token);

        const es = new EventSource(url.toString());

        // Wait for connection and collect events
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            es.close();
            resolve(); // Don't reject - we may have collected enough events
          }, 5000);

          es.onopen = () => {
            // Connection opened, now wait for events
          };

          es.onerror = (err) => {
            // Connection closed is expected after all events are received
            clearTimeout(timeout);
            resolve();
          };

          es.addEventListener('agent_stream_chunk', (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data) as StreamChunkEvent;
              receivedChunks.push(data);
            } catch {
              // Ignore parse errors
            }
          });

          es.addEventListener('agent_stream_complete', () => {
            clearTimeout(timeout);
            es.close();
            resolve();
          });
        });

        es.close();

        // Verify we received stream chunks
        expect(receivedChunks.length).toBeGreaterThan(0);

        // Verify expected event types are present
        const hookEventTypes = new Set(
          receivedChunks.map((c) => c.chunk?.metadata?.hookEventType),
        );

        expect(hookEventTypes.has('agent.started')).toBe(true);
        expect(hookEventTypes.has('agent.progress')).toBe(true);

        // Verify context is correct in events
        for (const chunk of receivedChunks) {
          expect(chunk.context?.taskId).toBe(taskId);
          expect(chunk.context?.conversationId).toBe(conversationId);
          expect(chunk.context?.agentSlug).toBe(AGENT_SLUG);
          expect(chunk.context?.orgSlug).toBe(ORG_SLUG);
        }

        // Verify progress values make sense
        const progressValues = receivedChunks
          .map((c) => c.chunk?.metadata?.progress)
          .filter((p) => p !== undefined) as number[];

        expect(progressValues.length).toBeGreaterThan(0);
        expect(progressValues[0]).toBe(0); // First event should be 0%
        expect(Math.max(...progressValues)).toBe(100); // Should reach 100%
      },
      LLM_TIMEOUT,
    );

    it('should not receive duplicate events', async () => {
      // This test verifies the fix for the ReplaySubject duplication issue

      // Step 1: CONVERSE
      const converseResponse = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userMessage: 'Write about duplicate detection',
            mode: 'converse',
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: AGENT_SLUG,
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
      const conversationId =
        converseData.payload?.metadata?.streaming?.conversationId ||
        converseData.payload?.metadata?.conversationId;

      // Step 2: BUILD
      const buildResponse = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userMessage: 'Build the post',
            mode: 'build',
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: AGENT_SLUG,
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
        },
      );

      const buildData = await buildResponse.json();
      const streaming = buildData.payload?.metadata?.streaming || {};
      const streamTokenUrl = streaming.streamTokenUrl;
      const streamUrl = streaming.streamUrl;

      // Get token and connect
      const tokenResponse = await fetch(streamTokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({}),
      });
      const tokenData = await tokenResponse.json();

      const receivedChunks: StreamChunkEvent[] = [];
      const url = new URL(streamUrl);
      url.searchParams.set('token', tokenData.token);

      const es = new EventSource(url.toString());

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          es.close();
          resolve();
        }, 5000);

        es.addEventListener('agent_stream_chunk', (event: MessageEvent) => {
          try {
            receivedChunks.push(JSON.parse(event.data));
          } catch {
            // Ignore
          }
        });

        es.addEventListener('agent_stream_complete', () => {
          clearTimeout(timeout);
          es.close();
          resolve();
        });

        es.onerror = () => {
          clearTimeout(timeout);
          resolve();
        };
      });

      es.close();

      // Count occurrences of each event type
      const eventTypeCounts: Record<string, number> = {};
      for (const chunk of receivedChunks) {
        const type = chunk.chunk?.metadata?.hookEventType || 'unknown';
        eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1;
      }

      // agent.started should only appear once (not duplicated)
      expect(eventTypeCounts['agent.started']).toBe(1);

      // Total chunks should be reasonable (not doubled)
      // We expect around 10 events max for a simple BUILD
      expect(receivedChunks.length).toBeLessThanOrEqual(15);
    }, LLM_TIMEOUT);
  });

  describe('Stream Token Security', () => {
    it('should reject stream connection without token', async () => {
      // First create a task to get a valid stream URL
      const converseResponse = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userMessage: 'Test security',
            mode: 'converse',
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: AGENT_SLUG,
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
      const conversationId = converseData.payload?.metadata?.streaming?.conversationId;

      const buildResponse = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
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
              agentSlug: AGENT_SLUG,
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
        },
      );

      const buildData = await buildResponse.json();
      const streamUrl = buildData.payload?.metadata?.streaming?.streamUrl;

      // Try to connect without token - should fail
      const es = new EventSource(streamUrl);

      const connectionFailed = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          es.close();
          resolve(false); // Shouldn't hang
        }, 5000);

        es.onerror = () => {
          clearTimeout(timeout);
          es.close();
          resolve(true);
        };

        es.onopen = () => {
          // If it opens, that's a security issue
          clearTimeout(timeout);
          es.close();
          resolve(false);
        };
      });

      expect(connectionFailed).toBe(true);
    }, LLM_TIMEOUT);
  });
});
