/**
 * Unit Tests for Plan Service
 *
 * Service layer for plan operations.
 * Tests cover:
 * - Loading plans by conversation ID
 * - Rerunning plans with different LLM (via invoke-client)
 * - Type validation and normalization
 * - Error handling
 * - API integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PlanVersionData } from '@/types/forge-types';

// Mock the apiService dependency
const mockGet = vi.fn();
vi.mock('../apiService', () => ({
  apiService: {
    get: mockGet,
  },
}));

// Mock invoke-client (replaces the old agent2agent API)
const mockInvoke = vi.fn();
vi.mock('../invoke-client', () => ({
  invoke: mockInvoke,
}));

// Mock executionContextStore
const mockExecutionContext = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'test-agent',
  agentType: 'llm',
  provider: 'openai',
  model: 'gpt-4',
};

vi.mock('@/stores/executionContextStore', () => ({
  useExecutionContextStore: vi.fn(() => ({
    current: mockExecutionContext,
  })),
}));

// Mock securityConfig
vi.mock('@/utils/securityConfig', () => ({
  getSecureApiBaseUrl: vi.fn(() => 'http://localhost:6200'),
}));

// Import after mocks are defined
const { planService } = await import('../planService');

describe('PlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPlansByConversation', () => {
    it('should load plans with versions from API', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        title: 'Test Plan',
        currentVersionId: 'version-1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [
          {
            id: 'version-1',
            planId: 'plan-1',
            versionNumber: 1,
            content: '# Test Plan Content',
            format: 'markdown',
            createdByType: 'agent',
            createdById: 'agent-1',
            taskId: 'task-1',
            metadata: { foo: 'bar' },
            isCurrentVersion: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(mockGet).toHaveBeenCalledWith('/plans/conversation/conv-1');
      expect(result).toBeTruthy();
      expect(result?.plan.id).toBe('plan-1');
      expect(result?.plan.conversationId).toBe('conv-1');
      expect(result?.plan.title).toBe('Test Plan');
      expect(result?.versions).toHaveLength(1);
      expect(result?.versions[0].id).toBe('version-1');
      expect(result?.versions[0].content).toBe('# Test Plan Content');
    });

    it('should return null when no plan found', async () => {
      mockGet.mockResolvedValue(null);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result).toBeNull();
    });

    it('should normalize plan data correctly', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organizationSlug: 'test-org-slug',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result?.plan.organization).toBe('test-org-slug');
      expect(result?.plan.title).toBe('');
      expect(result?.plan.currentVersionId).toBe('');
    });

    it('should normalize version format (json or markdown)', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [
          {
            id: 'version-1',
            planId: 'plan-1',
            versionNumber: 1,
            content: '{"steps": []}',
            format: 'json',
            createdByType: 'agent',
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'version-2',
            planId: 'plan-1',
            versionNumber: 2,
            content: '# Plan',
            format: 'unknown-format',
            createdByType: 'user',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      // Should preserve json format
      expect(result?.versions[0].format).toBe('json');
      // Should normalize unknown format to markdown
      expect(result?.versions[1].format).toBe('markdown');
    });

    it('should handle Date objects in API response', async () => {
      const now = new Date();
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: now,
        updatedAt: now,
        versions: [
          {
            id: 'version-1',
            planId: 'plan-1',
            versionNumber: 1,
            content: 'Test',
            format: 'markdown',
            createdByType: 'agent',
            createdAt: now,
          },
        ],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      // Should convert Date to ISO string
      expect(result?.plan.createdAt).toBe(now.toISOString());
      expect(result?.plan.updatedAt).toBe(now.toISOString());
      expect(result?.versions[0].createdAt).toBe(now.toISOString());
    });

    it('should handle null/optional fields correctly', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [
          {
            id: 'version-1',
            planId: 'plan-1',
            versionNumber: 1,
            content: 'Test',
            format: 'markdown',
            createdByType: 'agent',
            createdById: null,
            taskId: null,
            metadata: null,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result?.versions[0].createdById).toBeNull();
      expect(result?.versions[0].taskId).toBeUndefined();
      expect(result?.versions[0].metadata).toBeUndefined();
    });

    it('should reject malformed API responses', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Missing required fields
      const malformedResponse = {
        id: 'plan-1',
        // Missing conversationId, userId, agentName
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockGet.mockResolvedValue(malformedResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockGet.mockRejectedValue(new Error('Network error'));

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error loading plan'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle versions array correctly', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [
          {
            id: 'version-1',
            planId: 'plan-1',
            versionNumber: 1,
            content: 'Version 1',
            format: 'markdown',
            createdByType: 'agent',
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'version-2',
            planId: 'plan-1',
            versionNumber: 2,
            content: 'Version 2',
            format: 'markdown',
            createdByType: 'user',
            createdAt: '2024-01-02T00:00:00Z',
          },
        ],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result?.versions).toHaveLength(2);
      expect(result?.versions[0].versionNumber).toBe(1);
      expect(result?.versions[1].versionNumber).toBe(2);
    });

    it('should handle empty versions array', async () => {
      const mockApiResponse = {
        id: 'plan-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        versions: [],
      };

      mockGet.mockResolvedValue(mockApiResponse);

      const result = await planService.loadPlansByConversation('conv-1');

      expect(result?.versions).toEqual([]);
    });
  });

  describe('rerunWithDifferentLLM', () => {
    it('calls invoke with the plan rerun payload and correct context', async () => {
      const mockNewVersion: PlanVersionData = {
        id: 'version-2',
        planId: 'plan-1',
        versionNumber: 2,
        content: 'Updated plan content',
        format: 'markdown',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrent: true,
        createdAt: '2024-01-02T00:00:00Z',
      };

      mockInvoke.mockResolvedValue({
        success: true,
        output: { content: { version: mockNewVersion }, outputType: 'json' },
        context: mockExecutionContext,
      });

      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const result = await planService.rerunWithDifferentLLM(
        'test-agent',
        'conv-1',
        'version-1',
        llmSelection
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.objectContaining({
          content: expect.objectContaining({
            mode: 'plan',
            payload: expect.objectContaining({
              action: 'rerun',
              versionId: 'version-1',
              config: {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 2000,
              },
              conversationId: 'conv-1',
            }),
          }),
        }),
        expect.objectContaining({ baseUrl: 'http://localhost:6200' }),
        expect.objectContaining({ trigger: 'plan.rerun' }),
      );

      expect(result).toEqual(mockNewVersion);
    });

    it('throws error if conversationId is missing', async () => {
      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
      };

      await expect(
        planService.rerunWithDifferentLLM('test-agent', '', 'version-1', llmSelection)
      ).rejects.toThrow('Cannot rerun: missing conversationId');
    });

    it('throws error when invoke returns an error result', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockInvoke.mockResolvedValue({
        success: false,
        error: { code: 500, message: 'LLM API error' },
      });

      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
      };

      await expect(
        planService.rerunWithDifferentLLM('test-agent', 'conv-1', 'version-1', llmSelection)
      ).rejects.toThrow('LLM API error');

      consoleErrorSpy.mockRestore();
    });

    it('throws error if invoke output contains no version', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockInvoke.mockResolvedValue({
        success: true,
        output: { content: {}, outputType: 'json' },
      });

      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
      };

      await expect(
        planService.rerunWithDifferentLLM('test-agent', 'conv-1', 'version-1', llmSelection)
      ).rejects.toThrow('Rerun succeeded but did not return a version');

      consoleErrorSpy.mockRestore();
    });

    it('handles network errors during rerun', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockInvoke.mockRejectedValue(new Error('Network error'));

      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
      };

      await expect(
        planService.rerunWithDifferentLLM('test-agent', 'conv-1', 'version-1', llmSelection)
      ).rejects.toThrow('Network error');

      consoleErrorSpy.mockRestore();
    });

    it('handles non-Error exceptions during rerun', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockInvoke.mockRejectedValue('String error');

      const llmSelection = {
        providerName: 'openai',
        modelName: 'gpt-4',
      };

      await expect(
        planService.rerunWithDifferentLLM('test-agent', 'conv-1', 'version-1', llmSelection)
      ).rejects.toThrow('String error');

      consoleErrorSpy.mockRestore();
    });

    it('passes optional LLM parameters correctly', async () => {
      const mockNewVersion: PlanVersionData = {
        id: 'version-2',
        planId: 'plan-1',
        versionNumber: 2,
        content: 'Updated',
        format: 'markdown',
        createdByType: 'agent',
        createdById: null,
        isCurrent: true,
        createdAt: '2024-01-02T00:00:00Z',
      };

      mockInvoke.mockResolvedValue({
        success: true,
        output: { content: { version: mockNewVersion }, outputType: 'json' },
      });

      const llmSelection = {
        providerName: 'anthropic',
        modelName: 'claude-3-opus',
      };

      await planService.rerunWithDifferentLLM('test-agent', 'conv-1', 'version-1', llmSelection);

      const callArg = mockInvoke.mock.calls[0][1];
      expect(callArg.content.payload.config).toEqual({
        provider: 'anthropic',
        model: 'claude-3-opus',
        temperature: undefined,
        maxTokens: undefined,
      });
    });
  });

  describe('Service Layer Architecture', () => {
    it('should handle async operations properly', async () => {
      mockGet.mockResolvedValue(null);

      const result = planService.loadPlansByConversation('conv-1');
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should not throw on load errors but return null', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockGet.mockRejectedValue(new Error('API error'));
      const loadResult = await planService.loadPlansByConversation('conv-1');
      expect(loadResult).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });
});
