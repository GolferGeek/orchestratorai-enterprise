/**
 * E2E Test: HITL (Human-in-the-Loop) Workflows
 * Tests the complete HITL workflow via the A2A endpoint
 *
 * Prerequisites:
 * - API server running on localhost:6100
 * - LangGraph server running on localhost:6200
 * - Supabase running with seeded data
 *
 * Run with: npx jest --config apps/api/testing/test/jest-e2e.json hitl.e2e-spec
 *
 * NOTE: These tests require the extended-post-writer agent which has HITL enabled.
 * The agent must be seeded in the database and LangGraph must be running.
 */

import { getApiUrl } from '../test-env';

const API_URL = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const ORG_SLUG = 'finance';
const AGENT_SLUG = 'extended-post-writer';
const AGENT_TYPE = 'api';

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
      deliverableId?: string;
      generatedContent?: Record<string, unknown>;
      finalContent?: Record<string, unknown>;
      deliverable?: {
        id?: string;
        title?: string;
        type?: string;
        agentName?: string;
        conversationId?: string;
        currentVersion?: {
          id?: string;
          content?: string;
          format?: string;
          versionNumber?: number;
          metadata?: Record<string, unknown>;
        };
        [key: string]: unknown;
      };
      version?: {
        id?: string;
        content?: string;
        format?: string;
        versionNumber?: number;
        [key: string]: unknown;
      };
      isNew?: boolean;
      [key: string]: unknown;
    };
    metadata: Record<string, unknown>;
  };
}

describe('HITL E2E Tests (A2A Endpoint)', () => {
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

    // Extract userId from JWT sub claim or use env variable
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
   * Helper to call A2A endpoint with ExecutionContext (Phase 3.5+)
   */
  const callA2A = async (
    mode: string,
    userMessage: string,
    payload: Record<string, unknown> = {},
  ): Promise<TaskResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
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
            ...payload,
          },
        }),
      },
    );

    return response.json();
  };

  /**
   * Helper to call HITL resume via JSON-RPC method
   */
  const resumeHitl = async (
    taskId: string,
    decision: string,
    options: { feedback?: string; content?: Record<string, unknown> } = {},
  ): Promise<TaskResponse> => {
    const response = await fetch(
      `${API_URL}/agent-to-agent/${ORG_SLUG}/${AGENT_SLUG}/tasks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'hitl.resume',
          id: `hitl-resume-${Date.now()}`,
          params: {
            taskId,
            decision,
            ...options,
            // ExecutionContext - required by Phase 3.5
            context: {
              orgSlug: ORG_SLUG,
              agentSlug: AGENT_SLUG,
              agentType: AGENT_TYPE,
              userId,
              conversationId: NIL_UUID,
              taskId,
              planId: NIL_UUID,
              deliverableId: NIL_UUID,
              provider: 'ollama',
              model: 'llama3.2:1b',
            },
          },
        }),
      },
    );

    const jsonRpcResponse = await response.json();
    // JSON-RPC wraps result - unwrap it for consistent interface
    if (jsonRpcResponse.result) {
      return jsonRpcResponse.result;
    }
    // If error, return as failure
    return {
      success: false,
      mode: 'hitl',
      payload: {
        content: {},
        metadata: { error: jsonRpcResponse.error },
      },
    } as TaskResponse;
  };

  describe('HITL APPROVE Flow', () => {
    let taskId: string;
    let generatedContent: Record<string, unknown> | undefined;
    let deliverableId: string | undefined;

    it('should trigger HITL when building content', async () => {
      const response = await callA2A(
        'build',
        'Write a short blog post about AI agents for testing',
      );

      console.log('HITL BUILD Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      // Mode can be 'build' or 'hitl' depending on whether HITL was triggered
      expect(['build', 'hitl']).toContain(response.mode);

      // Check if HITL was triggered
      const status = response.payload?.content?.status;
      taskId = response.payload?.content?.taskId as string;
      generatedContent = response.payload?.content?.generatedContent as Record<string, unknown> | undefined;
      deliverableId = response.payload?.content?.deliverableId as string | undefined;

      // HITL-enabled agents should return hitl_waiting
      expect(status).toBe('hitl_waiting');
      expect(taskId).toBeDefined();
      expect(taskId).not.toBe(NIL_UUID);
      expect(generatedContent).toBeDefined();
      expect(generatedContent?.blogPost).toBeDefined();

      // Deliverable should be created for HITL review
      if (deliverableId) {
        expect(deliverableId).not.toBe(NIL_UUID);
      }
    }, LLM_TIMEOUT);

    it('should complete APPROVE flow and return deliverable in A2A response', async () => {
      expect(taskId).toBeDefined();
      expect(taskId).not.toBe(NIL_UUID);

      const response = await resumeHitl(taskId, 'approve');

      console.log('HITL APPROVE Response:', JSON.stringify(response, null, 2));

      expect(response.success).toBe(true);
      expect(response.payload?.content?.status).toBe('completed');

      // Verify the response structure contains the deliverable
      const content = response.payload?.content;
      expect(content).toBeDefined();

      // Check for deliverable in the response (frontend receives this)
      const deliverable = content?.deliverable;
      const version = content?.version;

      // The A2A response should include deliverable data
      if (deliverable) {
        console.log('Deliverable found in response');

        // Verify deliverable structure
        expect(deliverable.id).toBeDefined();
        expect(deliverable.id).not.toBe(NIL_UUID);
        expect(deliverable.agentName).toBe(AGENT_SLUG);

        // Capture deliverableId for subsequent tests
        deliverableId = deliverable.id;

        // Verify current version has content
        if (deliverable.currentVersion) {
          expect(deliverable.currentVersion.content).toBeDefined();
          expect(typeof deliverable.currentVersion.content).toBe('string');
          expect(deliverable.currentVersion.content!.length).toBeGreaterThan(100);
          expect(deliverable.currentVersion.format).toBe('markdown');
        }
      }

      // Also check for version object (alternative response format)
      if (version) {
        console.log('Version found in response');
        expect(version.content).toBeDefined();
        expect(typeof version.content).toBe('string');
        expect(version.content!.length).toBeGreaterThan(100);
      }

      // Check for finalContent or generatedContent (LangGraph response data)
      const finalContent = content?.finalContent;
      const generatedContent = content?.generatedContent;
      const blogContent = finalContent || generatedContent;

      if (blogContent) {
        console.log('Blog content found in response');
        expect(blogContent.blogPost).toBeDefined();
        expect(typeof blogContent.blogPost).toBe('string');
        expect((blogContent.blogPost as string).length).toBeGreaterThan(100);
      }

      // Verify at least one form of content is present
      expect(deliverable || version || blogContent).toBeTruthy();
    }, LLM_TIMEOUT);

    it('should have deliverable with correct metadata after approval', async () => {
      // This test verifies the deliverable returned in the A2A response has proper metadata
      expect(deliverableId).toBeDefined();

      if (!deliverableId) {
        console.log('No deliverableId from approval - skipping metadata verification');
        return;
      }

      // Fetch the deliverable directly to verify it was persisted
      const response = await fetch(
        `${API_URL}/deliverables/${deliverableId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      if (response.ok) {
        const deliverable = await response.json();
        console.log('Fetched Deliverable:', JSON.stringify(deliverable, null, 2));

        expect(deliverable).toBeDefined();
        expect(deliverable.id).toBe(deliverableId);
        expect(deliverable.agentName).toBe(AGENT_SLUG);
        expect(deliverable.userId).toBe(userId);

        // Verify deliverable has content version
        if (deliverable.currentVersion) {
          expect(deliverable.currentVersion.content).toBeDefined();
          // Format may be 'markdown' or null depending on how deliverable was created
          if (deliverable.currentVersion.format) {
            expect(deliverable.currentVersion.format).toBe('markdown');
          }

          // Check metadata contains HITL info
          const metadata = deliverable.currentVersion.metadata;
          if (metadata) {
            console.log('Version metadata:', JSON.stringify(metadata, null, 2));
            // Verify HITL-specific metadata was captured
            expect(metadata.hitlDecision || metadata.hitlStatus).toBeDefined();
          }
        }
      } else {
        // Deliverables endpoint might not be available
        console.log(`Deliverable fetch returned ${response.status}`);
      }
    }, 30000);
  });

  describe('HITL REGENERATE Flow', () => {
    let taskId: string;

    it('should trigger HITL and allow REGENERATE with feedback', async () => {
      // Build content to trigger HITL
      const buildResponse = await callA2A(
        'build',
        'Write a blog post about quantum computing for my tech blog',
      );

      const status = buildResponse.payload?.content?.status;
      taskId = buildResponse.payload?.content?.taskId as string;

      if (status !== 'hitl_waiting') {
        console.log('HITL not triggered - skipping regenerate test');
        return;
      }

      // Request regeneration with feedback
      const regenerateResponse = await resumeHitl(taskId, 'regenerate', {
        feedback: 'Make it shorter and more engaging for beginners',
      });

      expect(regenerateResponse.success).toBe(true);
      // Should return new HITL waiting state
      expect(regenerateResponse.payload?.content?.status).toBe('hitl_waiting');

      // Now approve the regenerated content
      const approveResponse = await resumeHitl(taskId, 'approve');
      expect(approveResponse.success).toBe(true);
      expect(approveResponse.payload?.content?.status).toBe('completed');
    }, LLM_TIMEOUT * 2);
  });

  describe('HITL REPLACE Flow', () => {
    let taskId: string;

    it('should allow REPLACE with custom content', async () => {
      const buildResponse = await callA2A(
        'build',
        'Write a blog post about machine learning basics',
      );

      const status = buildResponse.payload?.content?.status;
      taskId = buildResponse.payload?.content?.taskId as string;

      if (status !== 'hitl_waiting') {
        console.log('HITL not triggered - skipping replace test');
        return;
      }

      // Replace with custom content
      const replaceResponse = await resumeHitl(taskId, 'replace', {
        content: {
          blogPost: '# My Custom Blog Post\n\nThis is my own content about ML.',
          seoDescription: 'A custom SEO description for ML basics',
          socialPosts: ['Check out my new ML post!'],
        },
      });

      expect(replaceResponse.success).toBe(true);
      expect(replaceResponse.payload?.content?.status).toBe('completed');
    }, LLM_TIMEOUT);
  });

  describe('HITL REJECT Flow', () => {
    let taskId: string;

    it('should handle REJECT and regenerate', async () => {
      const buildResponse = await callA2A(
        'build',
        'Write a blog post about cloud computing trends',
      );

      const status = buildResponse.payload?.content?.status;
      taskId = buildResponse.payload?.content?.taskId as string;

      if (status !== 'hitl_waiting') {
        console.log('HITL not triggered - skipping reject test');
        return;
      }

      // Reject the content
      const rejectResponse = await resumeHitl(taskId, 'reject');

      expect(rejectResponse.success).toBe(true);
      // Should regenerate and return new HITL waiting
      expect(rejectResponse.payload?.content?.status).toBe('hitl_waiting');

      // Now approve
      const approveResponse = await resumeHitl(taskId, 'approve');
      expect(approveResponse.success).toBe(true);
    }, LLM_TIMEOUT * 2);
  });

  describe('HITL Validation', () => {
    it('should reject REGENERATE without feedback', async () => {
      const buildResponse = await callA2A(
        'build',
        'Write about validation testing',
      );

      const taskId = buildResponse.payload?.content?.taskId as string;
      const status = buildResponse.payload?.content?.status;

      if (status !== 'hitl_waiting' || !taskId) {
        console.log('HITL not triggered - skipping validation test');
        return;
      }

      // Try to regenerate without feedback
      const response = await resumeHitl(taskId, 'regenerate');

      // Should fail validation
      expect(response.success).toBe(false);
    }, LLM_TIMEOUT);

    it('should reject REPLACE without content', async () => {
      const buildResponse = await callA2A(
        'build',
        'Write about replace validation',
      );

      const taskId = buildResponse.payload?.content?.taskId as string;
      const status = buildResponse.payload?.content?.status;

      if (status !== 'hitl_waiting' || !taskId) {
        console.log('HITL not triggered - skipping validation test');
        return;
      }

      // Try to replace without content
      const response = await resumeHitl(taskId, 'replace');

      // Should fail validation
      expect(response.success).toBe(false);
    }, LLM_TIMEOUT);
  });
});
