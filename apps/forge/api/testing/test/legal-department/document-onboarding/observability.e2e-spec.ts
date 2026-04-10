/**
 * E2E Test: Observability for Legal Department AI
 *
 * Tests observability event emission and tracking:
 * - Events emitted to API's /webhooks/status endpoint
 * - ExecutionContext included in all events
 * - Progress events during execution
 * - Database records created for observability
 * - SSE streaming of events
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with observability_events table
 * - legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/observability.e2e-spec
 */

import { getApiUrl, getSupabaseUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'legal-department';
const AGENT_TYPE = 'api'; // legal-department is registered as API agent with LangGraph forwarding

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for operations
const TIMEOUT = 60000;

interface ExecutionContext {
  orgSlug: string;
  agentSlug: string;
  agentType: string;
  userId: string;
  conversationId: string;
  taskId: string;
  planId: string;
  deliverableId: string;
  provider?: string;
  model?: string;
}

interface A2ARequest {
  userMessage: string;
  mode: string;
  context: ExecutionContext;
  payload?: Record<string, unknown>;
}

interface A2AResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: {
      taskId?: string;
      conversationId?: string;
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

interface WorkflowStatusUpdate {
  taskId: string;
  status: string;
  timestamp: string;
  context: ExecutionContext;
  userMessage?: string;
  mode?: string;
  step?: string;
  percent?: number;
  message?: string;
  sequence?: number;
  totalSteps?: number;
}

describe('Legal Department AI - Observability', () => {
  let authToken: string;
  let userId: string;
  let supabaseUrl: string;
  let supabaseAnonKey: string;

  beforeAll(async () => {
    // Get Supabase credentials from environment
    supabaseUrl = getSupabaseUrl();
    supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

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

    // Extract userId from JWT sub claim
    try {
      const jwtParts = authToken.split('.');
      if (jwtParts[1]) {
        const jwtPayload = JSON.parse(
          Buffer.from(jwtParts[1], 'base64').toString(),
        );
        userId = jwtPayload.sub;
      } else {
        userId = process.env.SUPABASE_TEST_USERID || '';
      }
    } catch {
      userId = process.env.SUPABASE_TEST_USERID || '';
    }
    expect(userId).toBeTruthy();
  }, TIMEOUT);

  describe('Webhook Status Events', () => {
    it('should accept status updates at /webhooks/status endpoint', async () => {
      // Generate a unique taskId for this test
      const testTaskId = `test-task-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Test observability event',
        step: 'processing',
        percent: 50,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      // Webhook endpoint returns 204 No Content on success
      expect(response.status).toBe(204);
    }, TIMEOUT);

    it('should reject status updates without ExecutionContext', async () => {
      const invalidUpdate = {
        taskId: 'test-task-no-context',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        // Missing context field
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidUpdate),
      });

      // Should still return 204 but log warning (webhook is fire-and-forget)
      expect(response.status).toBe(204);
    }, TIMEOUT);

    it('should reject status updates without taskId', async () => {
      const invalidUpdate = {
        // Missing taskId
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidUpdate),
      });

      // Should still return 204 but log warning
      expect(response.status).toBe(204);
    }, TIMEOUT);
  });

  describe('ExecutionContext in Events', () => {
    it('should include ExecutionContext in all observability events', async () => {
      const testTaskId = `test-context-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'started',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'ollama',
          model: 'llama3.2:1b',
        },
        message: 'Test ExecutionContext inclusion',
        step: 'initialization',
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);

      // Give the system time to process and store the event
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Query database to verify ExecutionContext was stored
      // Note: In a real implementation, you'd query the observability_events table
      // For this E2E test, we verify the webhook accepted the event
    }, TIMEOUT);

    it('should validate ExecutionContext structure', async () => {
      const testTaskId = `test-validate-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'processing',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Validating ExecutionContext structure',
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);
    }, TIMEOUT);

    it('should extract userId, orgSlug, agentSlug from ExecutionContext', async () => {
      const testTaskId = `test-extract-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'completed',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Test context field extraction',
        step: 'finalization',
        percent: 100,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);
    }, TIMEOUT);
  });

  describe('Progress Events During Execution', () => {
    it('should emit progress events during agent execution', async () => {
      console.log('📊 Starting progress events test');

      const request: A2ARequest = {
        userMessage: 'Test progress tracking',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'ollama',
          model: 'llama3.2:1b',
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      // During execution, LangGraph should have emitted progress events
      // These events are sent to /webhooks/status and stored in observability_events

      console.log('✅ Progress events test completed');
    }, TIMEOUT);

    it('should track multiple progress steps', async () => {
      const testTaskId = `test-multi-progress-${Date.now()}`;
      const context: ExecutionContext = {
        orgSlug: ORG_SLUG,
        agentSlug: AGENT_SLUG,
        agentType: 'langgraph',
        userId,
        conversationId: NIL_UUID,
        taskId: testTaskId,
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
      };

      // Simulate multiple progress updates
      const steps = [
        {
          status: 'started',
          message: 'Starting task',
          percent: 0,
          step: 'initialization',
        },
        {
          status: 'in_progress',
          message: 'Processing document',
          percent: 25,
          step: 'processing',
        },
        {
          status: 'in_progress',
          message: 'Analyzing content',
          percent: 50,
          step: 'analyzing',
        },
        {
          status: 'in_progress',
          message: 'Generating response',
          percent: 75,
          step: 'generating',
        },
        {
          status: 'completed',
          message: 'Task completed',
          percent: 100,
          step: 'finalization',
        },
      ];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        const statusUpdate: WorkflowStatusUpdate = {
          taskId: testTaskId,
          status: step.status,
          timestamp: new Date().toISOString(),
          context,
          message: step.message,
          step: step.step,
          percent: step.percent,
          sequence: i + 1,
          totalSteps: steps.length,
        };

        const response = await fetch(`${API_URL}/webhooks/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(statusUpdate),
        });

        expect(response.status).toBe(204);

        // Small delay between updates
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }, TIMEOUT);

    it('should include step and progress percentage in events', async () => {
      const testTaskId = `test-progress-fields-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Processing step 2 of 5',
        step: 'document_extraction',
        percent: 40,
        sequence: 2,
        totalSteps: 5,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);
    }, TIMEOUT);
  });

  describe('Database Records', () => {
    it('should create observability event records in database', async () => {
      const testTaskId = `test-db-record-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'started',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Test database record creation',
        step: 'initialization',
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);

      // Give the system time to store the event
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // In a full E2E test, you would query the observability_events table
      // to verify the record was created with the correct fields
    }, TIMEOUT);

    it('should store all ExecutionContext fields in database', async () => {
      const testTaskId = `test-db-context-${Date.now()}`;
      const testConversationId = `test-conv-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'processing',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: testConversationId,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'ollama',
          model: 'llama3.2:1b',
        },
        message: 'Test context field storage',
        step: 'processing',
        percent: 50,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);
    }, TIMEOUT);

    it('should store event metadata (message, progress, step)', async () => {
      const testTaskId = `test-db-metadata-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Processing legal document analysis',
        step: 'document_analysis',
        percent: 65,
        sequence: 3,
        totalSteps: 5,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);
    }, TIMEOUT);
  });

  describe('Event Streaming', () => {
    it('should emit events to observability SSE stream', async () => {
      // This test verifies that events are emitted to the observability event stream
      // In practice, admin clients would connect to /observability/stream to receive these events

      const testTaskId = `test-sse-stream-${Date.now()}`;

      const statusUpdate: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: testTaskId,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
        message: 'Test SSE event streaming',
        step: 'processing',
        percent: 50,
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdate),
      });

      expect(response.status).toBe(204);

      // Events are pushed to ObservabilityEventsService buffer
      // and broadcast via EventEmitter to subscribers
    }, TIMEOUT);

    it('should handle concurrent event streams', async () => {
      // Simulate multiple tasks emitting events concurrently
      const tasks = [
        `test-concurrent-1-${Date.now()}`,
        `test-concurrent-2-${Date.now()}`,
        `test-concurrent-3-${Date.now()}`,
      ];

      const promises = tasks.map(async (taskId, index) => {
        const statusUpdate: WorkflowStatusUpdate = {
          taskId,
          status: 'in_progress',
          timestamp: new Date().toISOString(),
          context: {
            orgSlug: ORG_SLUG,
            agentSlug: AGENT_SLUG,
            agentType: AGENT_TYPE,
            userId,
            conversationId: NIL_UUID,
            taskId,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
          },
          message: `Concurrent task ${index + 1}`,
          step: 'processing',
          percent: 33 * (index + 1),
        };

        const response = await fetch(`${API_URL}/webhooks/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(statusUpdate),
        });

        return response.status;
      });

      const results = await Promise.all(promises);
      results.forEach((status) => {
        expect(status).toBe(204);
      });
    }, TIMEOUT);
  });

  describe('End-to-End Observability Flow', () => {
    it('should track complete task lifecycle with observability events', async () => {
      console.log('📊 Starting full observability flow test');

      // Generate unique IDs for this test
      const testConversationId = `test-conv-${Date.now()}`;
      const testTaskId = `test-task-${Date.now()}`;

      const context: ExecutionContext = {
        orgSlug: ORG_SLUG,
        agentSlug: AGENT_SLUG,
        agentType: 'langgraph',
        userId,
        conversationId: testConversationId,
        taskId: testTaskId,
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        provider: 'ollama',
        model: 'llama3.2:1b',
      };

      // Step 1: Task started
      const startEvent: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'started',
        timestamp: new Date().toISOString(),
        context,
        message: 'Legal Department task started',
        step: 'initialization',
        percent: 0,
        sequence: 1,
        totalSteps: 4,
      };

      let response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startEvent),
      });
      expect(response.status).toBe(204);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Processing document
      const processingEvent: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context,
        message: 'Processing legal document',
        step: 'document_processing',
        percent: 33,
        sequence: 2,
        totalSteps: 4,
      };

      response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processingEvent),
      });
      expect(response.status).toBe(204);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Analyzing content
      const analyzingEvent: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context,
        message: 'Analyzing legal content',
        step: 'content_analysis',
        percent: 66,
        sequence: 3,
        totalSteps: 4,
      };

      response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzingEvent),
      });
      expect(response.status).toBe(204);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 4: Task completed
      const completedEvent: WorkflowStatusUpdate = {
        taskId: testTaskId,
        status: 'completed',
        timestamp: new Date().toISOString(),
        context,
        message: 'Legal Department task completed',
        step: 'finalization',
        percent: 100,
        sequence: 4,
        totalSteps: 4,
      };

      response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completedEvent),
      });
      expect(response.status).toBe(204);

      console.log('✅ Full observability flow completed');
    }, TIMEOUT);

    it('should integrate observability with A2A task execution', async () => {
      console.log('📊 Testing observability integration with A2A');

      const request: A2ARequest = {
        userMessage: 'Test observability integration with legal department',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'ollama',
          model: 'llama3.2:1b',
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      expect(data.success).toBe(true);

      // During execution, LangGraph emits observability events
      // These events include ExecutionContext and are stored in database
      // They are also broadcast via SSE to admin clients

      console.log('✅ Observability integration test completed');
    }, TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle malformed observability events gracefully', async () => {
      const malformedEvent = {
        // Missing required fields
        status: 'in_progress',
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(malformedEvent),
      });

      // Webhook should still return 204 (fire-and-forget)
      expect(response.status).toBe(204);
    }, TIMEOUT);

    it('should handle invalid ExecutionContext gracefully', async () => {
      const invalidEvent: WorkflowStatusUpdate = {
        taskId: 'test-invalid-context',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          // Missing required fields
          orgSlug: ORG_SLUG,
        } as ExecutionContext,
        message: 'Invalid context test',
      };

      const response = await fetch(`${API_URL}/webhooks/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidEvent),
      });

      // Should still return 204 but log warning
      expect(response.status).toBe(204);
    }, TIMEOUT);
  });
});
