/**
 * E2E Test: Agent Runners Verification
 * Tests that the blog-post-writer, data-analyst, and hr-assistant agents
 * are functioning properly through the A2A endpoint.
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200 (for data-analyst)
 * - Supabase running with seeded data
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json agent-runners.e2e-spec
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';

// NIL_UUID for unset context fields
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Timeout for LLM operations
const LLM_TIMEOUT = 120000;

interface TaskResponse {
  success: boolean;
  mode: string;
  payload: {
    content: {
      taskId?: string;
      status?: string;
      message?: string;
      response?: string;
      deliverable?: Record<string, unknown>;
      version?: Record<string, unknown>;
      [key: string]: unknown;
    };
    metadata: Record<string, unknown>;
  };
}

describe('Agent Runners E2E Tests', () => {
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
  }, 30000);

  /**
   * Helper to call A2A endpoint with ExecutionContext
   */
  const callA2A = async (
    agentSlug: string,
    mode: string,
    userMessage: string,
    agentType: string = 'context',
    payload: Record<string, unknown> = {},
  ): Promise<TaskResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          userMessage,
          mode,
          // ExecutionContext - required by Phase 3.5
          context: {
            orgSlug: ORG_SLUG,
            agentSlug,
            agentType,
            userId,
            conversationId: NIL_UUID,
            taskId: NIL_UUID,
            planId: NIL_UUID,
            deliverableId: NIL_UUID,
            provider: 'ollama',
            model: 'llama3.2:1b',
          },
          payload: {
            ...payload,
          },
        }),
      },
    );

    return response.json();
  };

  // ============================================================================
  // BLOG POST WRITER TESTS
  // ============================================================================
  describe('Blog Post Writer Agent', () => {
    const AGENT_SLUG = 'blog-post-writer';
    const AGENT_TYPE = 'context';

    it('should respond to a converse request', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'converse',
        'I want to write a blog post about TypeScript best practices',
        AGENT_TYPE,
      );

      console.log('Blog Post Writer CONVERSE Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.mode).toBe('converse');
      expect(response.payload?.content).toBeDefined();

      // Should have some form of response message
      const content = response.payload?.content;
      expect(
        content?.message || content?.response || typeof content === 'string'
      ).toBeTruthy();
    }, LLM_TIMEOUT);

    it('should handle build mode request (requires conversation)', async () => {
      // Blog Post Writer BUILD mode requires a valid conversation
      // First, start a conversation via CONVERSE to get a conversationId
      const converseResponse = await callA2A(
        AGENT_SLUG,
        'converse',
        'I want to write a blog post about AI testing',
        AGENT_TYPE,
      );

      expect(converseResponse.success).toBe(true);
      const streaming = converseResponse.payload?.metadata?.streaming as Record<string, unknown> | undefined;
      const conversationId = streaming?.conversationId as string;
      expect(conversationId).toBeDefined();
      expect(conversationId).not.toBe(NIL_UUID);

      // Now use that conversation for BUILD mode
      const response = await fetch(
        `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userMessage: 'Now write the full blog post about AI testing best practices',
            mode: 'build',
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: AGENT_SLUG,
              agentType: AGENT_TYPE,
              userId,
              conversationId, // Use the conversation from CONVERSE
              taskId: NIL_UUID,
              planId: NIL_UUID,
              deliverableId: NIL_UUID,
              provider: 'ollama',
              model: 'llama3.2:1b',
            },
            payload: {
              config: {
                provider: 'ollama',
                model: 'llama3.2:1b',
              },
            },
          }),
        },
      );

      const buildResponse = await response.json() as TaskResponse;
      console.log('Blog Post Writer BUILD Response:', JSON.stringify(buildResponse, null, 2));

      expect(buildResponse.success).toBe(true);
      expect(['build', 'hitl']).toContain(buildResponse.mode);
      expect(buildResponse.payload?.content).toBeDefined();
    }, LLM_TIMEOUT * 2);
  });

  // ============================================================================
  // DATA ANALYST TESTS
  // ============================================================================
  describe('Data Analyst Agent', () => {
    const AGENT_SLUG = 'data-analyst';
    const AGENT_TYPE = 'api';

    it('should analyze users in the system', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'build',
        'Hey, can you tell me about the users in our system?',
        AGENT_TYPE,
      );

      console.log('Data Analyst Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content).toBeDefined();

      // Data analyst should return information about users
      // The response structure includes a deliverable with content
      const content = response.payload?.content;
      expect(content).toBeDefined();

      // Check that we got a deliverable with content (data analyst returns deliverables)
      const deliverable = content?.deliverable as Record<string, unknown> | undefined;
      const version = content?.version as Record<string, unknown> | undefined;

      // Should have a deliverable with current version content
      if (deliverable?.currentVersion) {
        const currentVersion = deliverable.currentVersion as Record<string, unknown>;
        expect(currentVersion.content).toBeDefined();
        expect(typeof currentVersion.content).toBe('string');
        expect((currentVersion.content as string).length).toBeGreaterThan(50);
      } else if (version?.content) {
        expect(typeof version.content).toBe('string');
        expect((version.content as string).length).toBeGreaterThan(50);
      } else {
        // Fallback check for any response
        const hasResponse =
          content?.message ||
          content?.response ||
          content?.status ||
          content?.summary ||
          content?.result;
        expect(hasResponse).toBeTruthy();
      }
    }, LLM_TIMEOUT);

    it('should handle a simple data query', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'build',
        'How many agents are in the system?',
        AGENT_TYPE,
      );

      console.log('Data Analyst Query Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content).toBeDefined();
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // HR POLICY AGENT TESTS
  // ============================================================================
  describe('HR Policy Agent', () => {
    const AGENT_SLUG = 'hr-policy-agent';
    const AGENT_TYPE = 'rag-runner';

    it('should respond to a benefits question', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'converse',
        'What health insurance options are available to employees?',
        AGENT_TYPE,
      );

      console.log('HR Policy Agent Benefits Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content).toBeDefined();

      // Should have some form of HR guidance response
      const content = response.payload?.content;
      expect(
        content?.message || content?.response || typeof content === 'string'
      ).toBeTruthy();
    }, LLM_TIMEOUT);

    it('should respond to a leave policy question', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'converse',
        'How do I request vacation time?',
        AGENT_TYPE,
      );

      console.log('HR Policy Agent Leave Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content).toBeDefined();
    }, LLM_TIMEOUT);

    it('should handle a general HR question', async () => {
      const response = await callA2A(
        AGENT_SLUG,
        'converse',
        'What is the company policy on remote work?',
        AGENT_TYPE,
      );

      console.log('HR Policy Agent General Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content).toBeDefined();
    }, LLM_TIMEOUT);
  });

  // ============================================================================
  // CROSS-AGENT VERIFICATION
  // ============================================================================
  describe('Cross-Agent Runner Verification', () => {
    it('should have all three agents responding', async () => {
      // Run all three agents in parallel to verify they're all working
      const [blogResponse, dataResponse, hrResponse] = await Promise.all([
        callA2A('blog-post-writer', 'converse', 'Hello, can you help me write?', 'context'),
        callA2A('data-analyst', 'build', 'What tables exist in the database?', 'api'),
        callA2A('hr-policy-agent', 'converse', 'What are the company holidays?', 'rag-runner'),
      ]);

      console.log('Cross-Agent Results:');
      console.log('- Blog Post Writer:', blogResponse.success ? 'OK' : 'FAILED');
      console.log('- Data Analyst:', dataResponse.success ? 'OK' : 'FAILED');
      console.log('- HR Policy Agent:', hrResponse.success ? 'OK' : 'FAILED');

      // All three should succeed
      expect(blogResponse.success).toBe(true);
      expect(dataResponse.success).toBe(true);
      expect(hrResponse.success).toBe(true);
    }, LLM_TIMEOUT * 2);
  });
});
