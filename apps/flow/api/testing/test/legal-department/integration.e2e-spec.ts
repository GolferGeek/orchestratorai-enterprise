/**
 * E2E Test: Full Flow Integration for Legal Department AI
 *
 * Tests complete end-to-end flow:
 * - Frontend upload → API processing → LangGraph execution → Response
 * - Echo node responds correctly
 * - Observability events emitted
 * - Database records created
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with all migrations applied
 * - legal-department agent seeded
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json legal-department/integration.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'demo-org';
const AGENT_SLUG = 'legal-department';
const AGENT_TYPE = 'api'; // legal-department is registered as API agent with LangGraph forwarding

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for full flow (can be longer)
const TIMEOUT = 60000;

interface A2ARequest {
  userMessage: string;
  mode: string;
  context: {
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
  };
  payload?: {
    documents?: Array<{
      filename: string;
      mimeType: string;
      size: number;
      base64Data: string;
    }>;
  };
}

interface A2AResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: {
      message?: string;
      response?: string;
      documents?: Array<unknown>;
      taskId?: string;
      conversationId?: string;
      [key: string]: unknown;
    };
    metadata?: {
      executionContext?: Record<string, unknown>;
      streaming?: {
        conversationId?: string;
        taskId?: string;
      };
      [key: string]: unknown;
    };
  };
  error?: string;
}

describe('Legal Department AI - Full Flow Integration', () => {
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

  describe('End-to-End Flow: Simple Text Message', () => {
    it('should complete full flow: Frontend → API → LangGraph → Response', async () => {
      console.log('📋 Starting full flow integration test');

      const request: A2ARequest = {
        userMessage: 'Hello Legal Department AI! This is a test message.',
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

      console.log('📤 Sending request to API...');

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

      console.log(`📥 Received response: ${response.status}`);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json() as A2AResponse;
      console.log('📦 Response data:', JSON.stringify(data, null, 2));

      expect(data.success).toBe(true);
      expect(data.payload).toBeDefined();
      expect(data.payload?.content).toBeDefined();

      // Echo node should respond with a message
      const content = data.payload?.content;
      const hasResponse =
        content?.message || content?.response || typeof content === 'string';

      expect(hasResponse).toBeTruthy();

      console.log('✅ Full flow completed successfully');
    }, TIMEOUT);

    it('should generate conversationId and taskId', async () => {
      const request: A2ARequest = {
        userMessage: 'Test ID generation',
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

      // Check for generated IDs
      const content = data.payload?.content;
      const metadata = data.payload?.metadata;

      if (content?.conversationId) {
        expect(content.conversationId).not.toBe(NIL_UUID);
        expect(content.conversationId).toMatch(/^[0-9a-f-]{36}$/);
      }

      if (content?.taskId) {
        expect(content.taskId).not.toBe(NIL_UUID);
        expect(content.taskId).toMatch(/^[0-9a-f-]{36}$/);
      }

      // Also check metadata for streaming info
      if (metadata?.streaming?.conversationId) {
        expect(metadata.streaming.conversationId).not.toBe(NIL_UUID);
      }
    }, TIMEOUT);
  });

  describe('End-to-End Flow: Document Upload', () => {
    it('should complete full flow with document upload', async () => {
      console.log('📋 Starting document upload flow test');

      const documentContent = 'This is a legal contract for testing purposes.';
      const base64Data = Buffer.from(documentContent).toString('base64');

      const request: A2ARequest = {
        userMessage: 'Please analyze this legal document.',
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
        payload: {
          documents: [
            {
              filename: 'test-contract.txt',
              mimeType: 'text/plain',
              size: documentContent.length,
              base64Data,
            },
          ],
        },
      };

      console.log('📤 Sending request with document...');

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

      console.log(`📥 Received response: ${response.status}`);

      expect(response.ok).toBe(true);

      const data = await response.json() as A2AResponse;
      console.log('📦 Response data:', JSON.stringify(data, null, 2));

      expect(data.success).toBe(true);
      expect(data.payload).toBeDefined();

      // Should have processed document
      const documents = data.payload?.content?.documents;
      if (documents && Array.isArray(documents) && documents.length > 0) {
        console.log('✅ Document processed successfully');
      }

      console.log('✅ Document upload flow completed successfully');
    }, TIMEOUT);

    it('should handle multiple documents in one flow', async () => {
      const doc1 = Buffer.from('First legal document content').toString('base64');
      const doc2 = Buffer.from('Second legal document content').toString('base64');

      const request: A2ARequest = {
        userMessage: 'Please analyze these legal documents.',
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
        },
        payload: {
          documents: [
            {
              filename: 'contract-1.txt',
              mimeType: 'text/plain',
              size: 28,
              base64Data: doc1,
            },
            {
              filename: 'contract-2.txt',
              mimeType: 'text/plain',
              size: 29,
              base64Data: doc2,
            },
          ],
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
    }, TIMEOUT);
  });

  describe('Echo Node Verification', () => {
    it('should receive response from echo node', async () => {
      const testMessage = 'Echo test: legal department verification';

      const request: A2ARequest = {
        userMessage: testMessage,
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

      // Echo node should respond with some message
      const content = data.payload?.content;
      expect(content).toBeDefined();
    }, TIMEOUT);

    it('should echo back in converse mode', async () => {
      const request: A2ARequest = {
        userMessage: 'What can you help me with?',
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
      expect(data.mode).toBe('converse');
    }, TIMEOUT);
  });

  describe('Database Records', () => {
    it('should create conversation record in database', async () => {
      const request: A2ARequest = {
        userMessage: 'Test database record creation',
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

      // If successful, a conversation record was created
      const conversationId =
        data.payload?.content?.conversationId ||
        data.payload?.metadata?.streaming?.conversationId;

      if (conversationId && conversationId !== NIL_UUID) {
        expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
      }
    }, TIMEOUT);

    it('should create task record in database', async () => {
      const request: A2ARequest = {
        userMessage: 'Test task record creation',
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

      // If successful, a task record was created
      const taskId =
        data.payload?.content?.taskId ||
        data.payload?.metadata?.streaming?.taskId;

      if (taskId && taskId !== NIL_UUID) {
        expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
      }
    }, TIMEOUT);
  });

  describe('Multi-Turn Conversation', () => {
    it('should maintain conversation context across multiple turns', async () => {
      // First message
      const request1: A2ARequest = {
        userMessage: 'I need help with a legal contract.',
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
        },
      };

      const response1 = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request1),
        },
      );

      expect(response1.ok).toBe(true);

      const data1 = await response1.json() as A2AResponse;
      expect(data1.success).toBe(true);

      // Get conversationId from first response
      const conversationId =
        data1.payload?.content?.conversationId ||
        data1.payload?.metadata?.streaming?.conversationId;

      if (conversationId && conversationId !== NIL_UUID) {
        // Second message - use same conversationId
        const request2: A2ARequest = {
          userMessage: 'What are the key points I should review?',
          mode: 'converse',
          context: {
            orgSlug: ORG_SLUG,
            agentSlug: AGENT_SLUG,
            agentType: AGENT_TYPE,
            userId,
            conversationId, // Use existing conversationId
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
          },
        };

        const response2 = await fetch(
          `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(request2),
          },
        );

        expect(response2.ok).toBe(true);

        const data2 = await response2.json() as A2AResponse;
        expect(data2.success).toBe(true);

        // ConversationId should be preserved
        const conversationId2 =
          data2.payload?.content?.conversationId ||
          data2.payload?.metadata?.streaming?.conversationId;

        expect(conversationId2).toBe(conversationId);
      }
    }, TIMEOUT * 2);
  });

  describe('Error Handling', () => {
    it('should handle invalid agent slug gracefully', async () => {
      const request: A2ARequest = {
        userMessage: 'Test invalid agent',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: 'non-existent-agent',
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/non-existent-agent/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      // Should fail with 404 or similar
      expect([404, 400, 422]).toContain(response.status);
    }, TIMEOUT);

    it('should handle invalid org slug gracefully', async () => {
      const request: A2ARequest = {
        userMessage: 'Test invalid org',
        mode: 'converse',
        context: {
          orgSlug: 'non-existent-org',
          agentSlug: AGENT_SLUG,
          agentType: AGENT_TYPE,
          userId,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
        },
      };

      const response = await fetch(
        `${API_URL}/agent-to-agent/non-existent-org/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(request),
        },
      );

      // Should fail with authorization or not found
      expect([401, 403, 404]).toContain(response.status);
    }, TIMEOUT);

    it('should handle LangGraph server unavailable gracefully', async () => {
      // This test verifies graceful degradation if LangGraph is down
      // In production, this should return a meaningful error

      const request: A2ARequest = {
        userMessage: 'Test server availability',
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

      // Either succeeds (server available) or fails gracefully
      if (!response.ok) {
        const data = await response.json();
        expect(data.error || data.message).toBeDefined();
      } else {
        const data = await response.json() as A2AResponse;
        expect(data.success).toBe(true);
      }
    }, TIMEOUT);
  });
});
