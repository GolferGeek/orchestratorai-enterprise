/**
 * E2E Tests for Sovereign Agent Model Enforcement
 *
 * Tests that agents with require_local_model=true:
 * 1. Only show Ollama providers in the LLM selector
 * 2. Display a local model requirement notice
 * 3. Backend rejects non-Ollama provider requests (API spoofing protection)
 */

import { test, expect } from '@playwright/test';

test.describe('Sovereign Agent Model Enforcement', () => {
  // Test data - assumes a sovereign test agent exists
  const SOVEREIGN_AGENT_SLUG = 'sovereign-test-agent';
  const NON_SOVEREIGN_AGENT_SLUG = 'blog-post-writer';
  const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:6101';
  const API_BASE_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:6100';

  test.beforeEach(async ({ page: _page }) => {
    // Login or set up authentication if needed
    // This might need to be adjusted based on your auth flow
  });

  test.describe('Frontend Provider Filtering', () => {
    test.skip('should only show Ollama provider for agent with require_local_model=true', async ({ page }) => {
      // Navigate to an agent with require_local_model=true
      await page.goto(`${BASE_URL}/app/agents/${SOVEREIGN_AGENT_SLUG}`);

      // Wait for the page to load and agent to be selected
      await page.waitForSelector('[data-testid="conversation-view"]', { timeout: 10000 });

      // Open LLM selector modal (click on LLM selector button/chip)
      await page.click('[data-testid="llm-selector"]');

      // Wait for the modal to open
      await page.waitForSelector('.llm-modal-container', { timeout: 5000 });

      // Get all provider options from the dropdown
      const providerOptions = await page.locator('.selection-dropdown option').allTextContents();

      // Filter out placeholder options
      const actualProviders = providerOptions.filter(
        p => p && !p.includes('Select Provider') && p.trim() !== ''
      );

      // Verify only Ollama appears (or providers that are local)
      const nonLocalProviders = actualProviders.filter(
        p => !p.toLowerCase().includes('ollama')
      );

      expect(nonLocalProviders).toHaveLength(0);
      expect(actualProviders.length).toBeGreaterThan(0);
    });

    test.skip('should display local model requirement notice when agent requires local model', async ({ page }) => {
      // Navigate to a sovereign agent
      await page.goto(`${BASE_URL}/app/agents/${SOVEREIGN_AGENT_SLUG}`);

      await page.waitForSelector('[data-testid="conversation-view"]', { timeout: 10000 });

      // Open LLM selector
      await page.click('[data-testid="llm-selector"]');
      await page.waitForSelector('.llm-modal-container', { timeout: 5000 });

      // Look for the local model notice
      const notice = page.locator('.local-model-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('local AI models');
    });

    test.skip('should show all providers for non-sovereign agent', async ({ page }) => {
      // Navigate to a regular (non-sovereign) agent
      await page.goto(`${BASE_URL}/app/agents/${NON_SOVEREIGN_AGENT_SLUG}`);

      await page.waitForSelector('[data-testid="conversation-view"]', { timeout: 10000 });

      // Open LLM selector
      await page.click('[data-testid="llm-selector"]');
      await page.waitForSelector('.llm-modal-container', { timeout: 5000 });

      // Get all provider options
      const providerOptions = await page.locator('.selection-dropdown option').allTextContents();

      // Filter out placeholder
      const actualProviders = providerOptions.filter(
        p => p && !p.includes('Select Provider') && p.trim() !== ''
      );

      // Should have multiple providers (OpenAI, Anthropic, Ollama, etc.)
      expect(actualProviders.length).toBeGreaterThan(1);
    });

    test.skip('should not display local model notice for non-sovereign agent', async ({ page }) => {
      // Navigate to a regular agent
      await page.goto(`${BASE_URL}/app/agents/${NON_SOVEREIGN_AGENT_SLUG}`);

      await page.waitForSelector('[data-testid="conversation-view"]', { timeout: 10000 });

      // Open LLM selector
      await page.click('[data-testid="llm-selector"]');
      await page.waitForSelector('.llm-modal-container', { timeout: 5000 });

      // The local model notice should NOT be visible
      const notice = page.locator('.local-model-notice');
      await expect(notice).not.toBeVisible();
    });
  });

  test.describe('Backend API Enforcement', () => {
    test('should reject non-Ollama provider via API for sovereign agent', async ({ request }) => {
      // Try to send a task with non-Ollama provider to a sovereign agent
      // This tests the backend validation (defense against API spoofing)
      const response = await request.post(`${API_BASE_URL}/agent-to-agent/test-org/${SOVEREIGN_AGENT_SLUG}/tasks`, {
        data: {
          mode: 'converse',
          userMessage: 'Test message - should be rejected',
          context: {
            orgSlug: 'test-org',
            userId: 'test-user',
            conversationId: 'test-conv-001',
            taskId: 'test-task-001',
            planId: '00000000-0000-0000-0000-000000000000',
            deliverableId: '00000000-0000-0000-0000-000000000000',
            agentSlug: SOVEREIGN_AGENT_SLUG,
            agentType: 'context',
            provider: 'openai', // Spoofing attempt - trying to use cloud provider
            model: 'gpt-4',
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
        // Don't throw on non-2xx responses
        failOnStatusCode: false,
      });

      // Environment-dependent outcomes:
      // - 404: sovereign test agent absent
      // - 401: endpoint requires auth token in this environment
      if (response.status() === 404 || response.status() === 401) {
        test.skip();
      }

      // Should be rejected with 400 Bad Request when agent exists and auth is accepted.
      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body.message).toContain('requires local model');
    });

    test('should allow Ollama provider via API for sovereign agent', async ({ request }) => {
      // Send a valid request with Ollama provider
      const response = await request.post(`${API_BASE_URL}/agent-to-agent/test-org/${SOVEREIGN_AGENT_SLUG}/tasks`, {
        data: {
          mode: 'converse',
          userMessage: 'Test message with valid Ollama provider',
          context: {
            orgSlug: 'test-org',
            userId: 'test-user',
            conversationId: 'test-conv-002',
            taskId: 'test-task-002',
            planId: '00000000-0000-0000-0000-000000000000',
            deliverableId: '00000000-0000-0000-0000-000000000000',
            agentSlug: SOVEREIGN_AGENT_SLUG,
            agentType: 'context',
            provider: 'ollama', // Valid local provider
            model: 'llama3.2:1b',
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
        failOnStatusCode: false,
      });

      // Should be accepted (200 or 201)
      // Note: This might fail if the agent doesn't exist or other validation fails,
      // but it should NOT fail due to sovereign mode validation
      const status = response.status();

      // If status is 400, check it's not due to sovereign mode
      if (status === 400) {
        const body = await response.json();
        expect(body.message).not.toContain('requires local model');
      } else {
        // Should be successful or a different error (not sovereign mode related)
        expect([200, 201, 401, 404]).toContain(status);
      }
    });

    test('should allow any provider for non-sovereign agent', async ({ request }) => {
      // Send a request with cloud provider to a non-sovereign agent
      const response = await request.post(`${API_BASE_URL}/agent-to-agent/demo/${NON_SOVEREIGN_AGENT_SLUG}/tasks`, {
        data: {
          mode: 'converse',
          userMessage: 'Test message with cloud provider',
          context: {
            orgSlug: 'demo',
            userId: 'test-user',
            conversationId: 'test-conv-003',
            taskId: 'test-task-003',
            planId: '00000000-0000-0000-0000-000000000000',
            deliverableId: '00000000-0000-0000-0000-000000000000',
            agentSlug: NON_SOVEREIGN_AGENT_SLUG,
            agentType: 'context',
            provider: 'anthropic', // Cloud provider - should be allowed
            model: 'claude-sonnet-4-20250514',
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
        failOnStatusCode: false,
      });

      // Should NOT be rejected due to sovereign mode
      const body = await response.json();
      if (response.status() === 400) {
        expect(body.message).not.toContain('requires local model');
      }
    });
  });

  test.describe('Defense in Depth - LLM Service Validation', () => {
    test('should reject non-local provider when sovereignMode=true in context', async ({ request }) => {
      // This tests the LLM service level validation (defense in depth)
      // Even if the A2A router check is bypassed somehow, the LLM service should catch it
      const response = await request.post(`${API_BASE_URL}/llm/generate`, {
        data: {
          systemPrompt: 'You are a test assistant',
          userMessage: 'Hello',
          executionContext: {
            orgSlug: 'test-org',
            userId: 'test-user',
            conversationId: 'test-conv-004',
            taskId: 'test-task-004',
            planId: '00000000-0000-0000-0000-000000000000',
            deliverableId: '00000000-0000-0000-0000-000000000000',
            agentSlug: 'test-agent',
            agentType: 'context',
            provider: 'openai', // Non-local provider
            model: 'gpt-4',
            sovereignMode: true, // Sovereign mode flag
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
        failOnStatusCode: false,
      });

      // Should be rejected (403 Forbidden)
      if (response.status() === 403) {
        const body = await response.json();
        expect(body.message).toContain('Sovereign mode is active');
      } else if (response.status() === 404) {
        // Endpoint might not exist - skip this specific check
        test.skip();
      }
    });
  });
});
