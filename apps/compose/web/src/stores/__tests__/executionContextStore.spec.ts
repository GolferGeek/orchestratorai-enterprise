/**
 * Unit Tests for ExecutionContext Store (Compose Web)
 *
 * Tests the single source of truth for ExecutionContext in the compose UI layer.
 *
 * Key Testing Areas:
 * - Store initialization (null state)
 * - Context creation via initialize()
 * - TaskId generation for new tasks
 * - Context updates from API responses
 * - LLM configuration changes
 * - Agent switching
 * - Conversation switching
 * - Sovereign mode
 * - Context clearing
 * - Convenience getters
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useExecutionContextStore,
  type ExecutionContextInitParams,
} from '../executionContextStore';

// Mock crypto.randomUUID
const mockUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => mockUUID),
});

describe('ExecutionContextStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  const defaultParams: ExecutionContextInitParams = {
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-456',
    agentSlug: 'test-agent',
    agentType: 'context',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
  };

  describe('Store Initialization', () => {
    it('should initialize with null context', () => {
      const store = useExecutionContextStore();

      expect(store.contextOrNull).toBeNull();
      expect(store.isInitialized).toBe(false);
      expect(store.conversationId).toBeNull();
      expect(store.taskId).toBeNull();
      expect(store.planId).toBeNull();
      expect(store.deliverableId).toBeNull();
      expect(store.agentSlug).toBeNull();
      expect(store.orgSlug).toBeNull();
    });

    it('should throw when accessing current before initialization', () => {
      const store = useExecutionContextStore();

      expect(() => store.current).toThrow(
        'ExecutionContext not initialized. Select a conversation first.'
      );
    });
  });

  describe('Context Initialization', () => {
    it('should initialize context with all required parameters', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      expect(store.isInitialized).toBe(true);

      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.conversationId).toBe('conv-456');
      expect(ctx.agentSlug).toBe('test-agent');
      expect(ctx.agentType).toBe('context');
      expect(ctx.provider).toBe('anthropic');
      expect(ctx.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should auto-generate taskId when not provided', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      expect(store.taskId).toBe(mockUUID);
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    it('should default planId and deliverableId to NIL_UUID', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      expect(store.planId).toBe('00000000-0000-0000-0000-000000000000');
      expect(store.deliverableId).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('should accept pre-existing taskId, planId, deliverableId', () => {
      const store = useExecutionContextStore();

      store.initialize({
        ...defaultParams,
        taskId: 'existing-task-id',
        planId: 'existing-plan-id',
        deliverableId: 'existing-deliverable-id',
      });

      expect(store.taskId).toBe('existing-task-id');
      expect(store.planId).toBe('existing-plan-id');
      expect(store.deliverableId).toBe('existing-deliverable-id');
    });

    it('should expose convenience getters after initialization', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      expect(store.conversationId).toBe('conv-456');
      expect(store.agentSlug).toBe('test-agent');
      expect(store.orgSlug).toBe('test-org');
      expect(store.taskId).toBe(mockUUID);
    });
  });

  describe('TaskId Generation', () => {
    it('should generate new taskId for new task', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      const originalTaskId = store.taskId;

      const newTaskUUID = 'new-task-uuid-12345';
      // @ts-expect-error - Test mock with non-UUID format string
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(newTaskUUID);

      const generatedTaskId = store.newTaskId();

      expect(generatedTaskId).toBe(newTaskUUID);
      expect(store.taskId).toBe(newTaskUUID);
      expect(store.taskId).not.toBe(originalTaskId);
    });

    it('should throw when generating taskId without initialization', () => {
      const store = useExecutionContextStore();

      expect(() => store.newTaskId()).toThrow(
        'ExecutionContext not initialized. Select a conversation first.'
      );
    });

    it('should preserve EC fields when generating new taskId', () => {
      const store = useExecutionContextStore();
      store.initialize({
        ...defaultParams,
        planId: 'plan-789',
        deliverableId: 'deliverable-101',
      });

      const newTaskUUID = 'new-task-uuid';
      // @ts-expect-error - Test mock with non-UUID format string
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(newTaskUUID);

      store.newTaskId();

      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.conversationId).toBe('conv-456');
      expect(ctx.agentSlug).toBe('test-agent');
      expect(ctx.agentType).toBe('context');
      expect(ctx.provider).toBe('anthropic');
      expect(ctx.model).toBe('claude-3-5-sonnet-20241022');
      expect(store.planId).toBe('plan-789');
      expect(store.deliverableId).toBe('deliverable-101');
      expect(store.taskId).toBe(newTaskUUID);
    });
  });

  describe('Context Updates from API', () => {
    it('should replace entire context on update', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      const newContext = {
        orgSlug: 'different-org',
        userId: 'different-user',
        conversationId: 'different-conv',
        agentSlug: 'different-agent',
        agentType: 'api',
        provider: 'openai',
        model: 'gpt-4',
      };

      store.update(newContext);

      expect(store.current.orgSlug).toBe('different-org');
      expect(store.current.userId).toBe('different-user');
      expect(store.current.conversationId).toBe('different-conv');
      expect(store.current.agentSlug).toBe('different-agent');
      expect(store.current.provider).toBe('openai');
      expect(store.current.model).toBe('gpt-4');
    });
  });

  describe('LLM Configuration', () => {
    it('should update provider and model', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setLLM('openai', 'gpt-4-turbo');

      const ctx = store.current;
      expect(ctx.provider).toBe('openai');
      expect(ctx.model).toBe('gpt-4-turbo');
    });

    it('should preserve other context fields when changing LLM', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setLLM('ollama', 'llama3.2:1b');

      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.conversationId).toBe('conv-456');
      expect(ctx.agentSlug).toBe('test-agent');
      expect(ctx.agentType).toBe('context');
    });

    it('should not change LLM if context is not initialized', () => {
      const store = useExecutionContextStore();
      store.setLLM('openai', 'gpt-4');
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Agent Switching', () => {
    it('should update agent information', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setAgent('new-agent-slug', 'api');

      const ctx = store.current;
      expect(ctx.agentSlug).toBe('new-agent-slug');
      expect(ctx.agentType).toBe('api');
    });

    it('should preserve other context fields when switching agent', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setAgent('new-agent', 'orchestrator');

      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.conversationId).toBe('conv-456');
      expect(ctx.provider).toBe('anthropic');
      expect(ctx.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should not change agent if context is not initialized', () => {
      const store = useExecutionContextStore();
      store.setAgent('some-agent', 'api');
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Conversation Switching', () => {
    it('should update conversation ID', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setConversation('new-conv-id');

      expect(store.current.conversationId).toBe('new-conv-id');
      expect(store.conversationId).toBe('new-conv-id');
    });

    it('should preserve other context fields when switching conversation', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setConversation('new-conv-id');

      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.userId).toBe('user-123');
      expect(ctx.agentSlug).toBe('test-agent');
      expect(ctx.provider).toBe('anthropic');
    });

    it('should not change conversation if context is not initialized', () => {
      const store = useExecutionContextStore();
      store.setConversation('conv-id');
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Sovereign Mode', () => {
    it('should set sovereign mode flag', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      store.setSovereignMode(true);

      expect(store.current.sovereignMode).toBe(true);
    });

    it('should toggle sovereign mode off', () => {
      const store = useExecutionContextStore();
      store.initialize({ ...defaultParams, sovereignMode: true } as ExecutionContextInitParams);

      store.setSovereignMode(false);

      expect(store.current.sovereignMode).toBe(false);
    });

    it('should not set sovereign mode if context is not initialized', () => {
      const store = useExecutionContextStore();
      store.setSovereignMode(true);
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Context Clearing', () => {
    it('should clear context when leaving conversation', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      expect(store.isInitialized).toBe(true);

      store.clear();

      expect(store.isInitialized).toBe(false);
      expect(store.contextOrNull).toBeNull();
      expect(store.conversationId).toBeNull();
      expect(store.taskId).toBeNull();
      expect(store.planId).toBeNull();
      expect(store.deliverableId).toBeNull();
      expect(store.agentSlug).toBeNull();
      expect(store.orgSlug).toBeNull();
    });

    it('should throw when accessing current after clearing', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);
      store.clear();

      expect(() => store.current).toThrow(
        'ExecutionContext not initialized. Select a conversation first.'
      );
    });
  });

  describe('Context Immutability', () => {
    it('should create new context object on mutations', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      const originalContext = store.current;

      store.setLLM('openai', 'gpt-4');

      const updatedContext = store.current;

      expect(updatedContext).not.toBe(originalContext);
      expect(updatedContext.provider).toBe('openai');
      expect(originalContext.provider).toBe('anthropic');
    });
  });

  describe('ExecutionContext Flow Validation', () => {
    it('should validate complete ExecutionContext structure', () => {
      const store = useExecutionContextStore();
      store.initialize(defaultParams);

      const ctx = store.current;

      // Validate ExecutionContext has all required fields
      expect(ctx).toHaveProperty('orgSlug');
      expect(ctx).toHaveProperty('userId');
      expect(ctx).toHaveProperty('conversationId');
      expect(ctx).toHaveProperty('agentSlug');
      expect(ctx).toHaveProperty('agentType');
      expect(ctx).toHaveProperty('provider');
      expect(ctx).toHaveProperty('model');

      // Validate types
      expect(typeof ctx.orgSlug).toBe('string');
      expect(typeof ctx.userId).toBe('string');
      expect(typeof ctx.conversationId).toBe('string');
      expect(typeof ctx.agentSlug).toBe('string');
      expect(typeof ctx.agentType).toBe('string');
      expect(typeof ctx.provider).toBe('string');
      expect(typeof ctx.model).toBe('string');

      // Product-local fields accessible via store getters
      expect(typeof store.taskId).toBe('string');
      expect(typeof store.planId).toBe('string');
      expect(typeof store.deliverableId).toBe('string');
    });

    it('should enforce ExecutionContext flow in typical A2A operation', () => {
      const store = useExecutionContextStore();

      // Step 1: Initialize context when conversation is selected
      store.initialize(defaultParams);

      // Step 2: Generate new taskId before A2A operation
      const newTaskUUID = 'new-task-for-operation';
      // @ts-expect-error - Test mock with non-UUID format string
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(newTaskUUID);

      const taskId = store.newTaskId();
      expect(taskId).toBe(newTaskUUID);
      expect(store.taskId).toBe(newTaskUUID);

      // Step 3: Get context for A2A call
      const ctx = store.current;
      expect(ctx.orgSlug).toBe('test-org');
      expect(ctx.agentSlug).toBe('test-agent');

      // Step 4: Update context with API response
      store.update({
        ...ctx,
        agentSlug: 'updated-agent',
      });

      expect(store.current.agentSlug).toBe('updated-agent');
    });
  });
});
