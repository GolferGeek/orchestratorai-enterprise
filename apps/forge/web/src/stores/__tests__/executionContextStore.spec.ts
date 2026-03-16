/**
 * Unit Tests for ExecutionContext Store
 * Tests the single source of truth for ExecutionContext in the UI layer
 *
 * Key Testing Areas:
 * - Store initialization
 * - Context creation and initialization
 * - Context immutability (except backend updates)
 * - TaskId generation for new tasks
 * - Context updates from API responses
 * - LLM configuration changes
 * - Agent switching
 * - Context clearing
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
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

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

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      expect(store.isInitialized).toBe(true);
      expect(store.current).toEqual({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        taskId: mockUUID, // Auto-generated
        planId: '00000000-0000-0000-0000-000000000000', // NIL_UUID
        deliverableId: '00000000-0000-0000-0000-000000000000', // NIL_UUID
      });
    });

    it('should initialize with pre-existing taskId, planId, deliverableId', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        taskId: 'existing-task-id',
        planId: 'existing-plan-id',
        deliverableId: 'existing-deliverable-id',
      };

      store.initialize(params);

      const context = store.current;
      expect(context.taskId).toBe('existing-task-id');
      expect(context.planId).toBe('existing-plan-id');
      expect(context.deliverableId).toBe('existing-deliverable-id');
    });

    it('should generate taskId upfront to enable stream connection', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      // Should have generated a taskId
      expect(store.taskId).toBe(mockUUID);
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    it('should expose convenience getters after initialization', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      expect(store.conversationId).toBe('conv-456');
      expect(store.taskId).toBe(mockUUID);
      expect(store.planId).toBe('00000000-0000-0000-0000-000000000000');
      expect(store.deliverableId).toBe('00000000-0000-0000-0000-000000000000');
      expect(store.agentSlug).toBe('test-agent');
      expect(store.orgSlug).toBe('test-org');
    });
  });

  describe('TaskId Generation', () => {
    it('should generate new taskId for new task', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      const originalTaskId = store.taskId;

      // Mock new UUID for next task
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

    it('should preserve other context fields when generating new taskId', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        planId: 'plan-789',
        deliverableId: 'deliverable-101',
      };

      store.initialize(params);

      const newTaskUUID = 'new-task-uuid';
      // @ts-expect-error - Test mock with non-UUID format string
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(newTaskUUID);

      store.newTaskId();

      const context = store.current;
      expect(context.orgSlug).toBe('test-org');
      expect(context.userId).toBe('user-123');
      expect(context.conversationId).toBe('conv-456');
      expect(context.agentSlug).toBe('test-agent');
      expect(context.agentType).toBe('context');
      expect(context.provider).toBe('anthropic');
      expect(context.model).toBe('claude-3-5-sonnet-20241022');
      expect(context.planId).toBe('plan-789');
      expect(context.deliverableId).toBe('deliverable-101');
      expect(context.taskId).toBe(newTaskUUID);
    });
  });

  describe('Context Updates from API', () => {
    it('should update context with API response', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      // Simulate API response with updated planId and deliverableId
      const updatedContext = {
        ...store.current,
        planId: 'new-plan-id',
        deliverableId: 'new-deliverable-id',
      };

      store.update(updatedContext);

      expect(store.planId).toBe('new-plan-id');
      expect(store.deliverableId).toBe('new-deliverable-id');
    });

    it('should replace entire context on update', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      const newContext = {
        orgSlug: 'different-org',
        userId: 'different-user',
        conversationId: 'different-conv',
        agentSlug: 'different-agent',
        agentType: 'api' as const,
        provider: 'openai',
        model: 'gpt-4',
        taskId: 'different-task',
        planId: 'different-plan',
        deliverableId: 'different-deliverable',
      };

      store.update(newContext);

      expect(store.current).toEqual(newContext);
    });
  });

  describe('LLM Configuration', () => {
    it('should update provider and model', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      store.setLLM('openai', 'gpt-4-turbo');

      const context = store.current;
      expect(context.provider).toBe('openai');
      expect(context.model).toBe('gpt-4-turbo');
    });

    it('should preserve other context fields when changing LLM', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        planId: 'plan-789',
        deliverableId: 'deliverable-101',
      };

      store.initialize(params);

      store.setLLM('ollama', 'llama3.2:1b');

      const context = store.current;
      expect(context.orgSlug).toBe('test-org');
      expect(context.userId).toBe('user-123');
      expect(context.conversationId).toBe('conv-456');
      expect(context.agentSlug).toBe('test-agent');
      expect(context.agentType).toBe('context');
      expect(context.planId).toBe('plan-789');
      expect(context.deliverableId).toBe('deliverable-101');
      expect(context.provider).toBe('ollama');
      expect(context.model).toBe('llama3.2:1b');
    });

    it('should not change LLM if context is not initialized', () => {
      const store = useExecutionContextStore();

      store.setLLM('openai', 'gpt-4');

      // Should remain null
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Agent Switching', () => {
    it('should update agent information', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'initial-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      store.setAgent('new-agent-slug', 'api');

      const context = store.current;
      expect(context.agentSlug).toBe('new-agent-slug');
      expect(context.agentType).toBe('api');
    });

    it('should preserve other context fields when switching agent', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'initial-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        planId: 'plan-789',
      };

      store.initialize(params);

      store.setAgent('new-agent', 'orchestrator');

      const context = store.current;
      expect(context.orgSlug).toBe('test-org');
      expect(context.userId).toBe('user-123');
      expect(context.conversationId).toBe('conv-456');
      expect(context.provider).toBe('anthropic');
      expect(context.model).toBe('claude-3-5-sonnet-20241022');
      expect(context.planId).toBe('plan-789');
    });

    it('should not change agent if context is not initialized', () => {
      const store = useExecutionContextStore();

      store.setAgent('some-agent', 'api');

      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('Context Clearing', () => {
    it('should clear context when leaving conversation', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

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

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);
      store.clear();

      expect(() => store.current).toThrow(
        'ExecutionContext not initialized. Select a conversation first.'
      );
    });
  });

  describe('Context Immutability', () => {
    it('should only allow mutations through update, setLLM, and setAgent', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      // These are the ONLY allowed mutations:
      // 1. update() - from API responses
      // 2. setLLM() - user-initiated LLM change
      // 3. setAgent() - user-initiated agent switch
      // 4. newTaskId() - generate new task ID

      // Verify no direct mutation methods exist
      expect(store).not.toHaveProperty('setContext');
      expect(store).not.toHaveProperty('mutateContext');
      expect(store).not.toHaveProperty('setConversationId');
      expect(store).not.toHaveProperty('setTaskId');
      expect(store).not.toHaveProperty('setPlanId');
      expect(store).not.toHaveProperty('setDeliverableId');
    });

    it('should create new context object on mutations (immutability)', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      const originalContext = store.current;

      store.setLLM('openai', 'gpt-4');

      const updatedContext = store.current;

      // Should be a new object (immutable update)
      expect(updatedContext).not.toBe(originalContext);
      expect(updatedContext.provider).toBe('openai');
      expect(originalContext.provider).toBe('anthropic');
    });
  });

  describe('ExecutionContext Flow Validation', () => {
    it('should validate complete ExecutionContext structure', () => {
      const store = useExecutionContextStore();

      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      const context = store.current;

      // Validate ExecutionContext has all required fields
      expect(context).toHaveProperty('orgSlug');
      expect(context).toHaveProperty('userId');
      expect(context).toHaveProperty('conversationId');
      expect(context).toHaveProperty('agentSlug');
      expect(context).toHaveProperty('agentType');
      expect(context).toHaveProperty('provider');
      expect(context).toHaveProperty('model');
      expect(context).toHaveProperty('taskId');
      expect(context).toHaveProperty('planId');
      expect(context).toHaveProperty('deliverableId');

      // Validate types
      expect(typeof context.orgSlug).toBe('string');
      expect(typeof context.userId).toBe('string');
      expect(typeof context.conversationId).toBe('string');
      expect(typeof context.agentSlug).toBe('string');
      expect(typeof context.agentType).toBe('string');
      expect(typeof context.provider).toBe('string');
      expect(typeof context.model).toBe('string');
      expect(typeof context.taskId).toBe('string');
      expect(typeof context.planId).toBe('string');
      expect(typeof context.deliverableId).toBe('string');
    });

    it('should enforce ExecutionContext flow in typical A2A operation', () => {
      const store = useExecutionContextStore();

      // Step 1: Initialize context when conversation is selected
      const params: ExecutionContextInitParams = {
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-456',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      };

      store.initialize(params);

      // Step 2: Generate new taskId before A2A operation
      const newTaskUUID = 'new-task-for-operation';
      // @ts-expect-error - Test mock with non-UUID format string
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(newTaskUUID);

      const taskId = store.newTaskId();
      expect(taskId).toBe(newTaskUUID);

      // Step 3: Get context for A2A call (never passed as parameter)
      const contextForA2A = store.current;
      expect(contextForA2A.taskId).toBe(newTaskUUID);

      // Step 4: Update context with API response
      const apiResponse = {
        ...contextForA2A,
        planId: 'plan-from-backend',
        deliverableId: 'deliverable-from-backend',
      };

      store.update(apiResponse);

      // Step 5: Verify context was updated
      expect(store.planId).toBe('plan-from-backend');
      expect(store.deliverableId).toBe('deliverable-from-backend');
    });
  });
});
