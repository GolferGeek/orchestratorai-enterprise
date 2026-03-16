/**
 * Unit Tests for Execution Context Store - Sovereign Mode
 * Tests sovereign mode setting and context management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useExecutionContextStore } from '../executionContextStore';

describe('ExecutionContextStore - Sovereign Mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with null context', () => {
      const store = useExecutionContextStore();

      expect(store.isInitialized).toBe(false);
      expect(store.contextOrNull).toBeNull();
    });
  });

  describe('initialize action', () => {
    it('should create context with all required fields', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:1b',
      });

      expect(store.isInitialized).toBe(true);
      expect(store.contextOrNull?.orgSlug).toBe('test-org');
      expect(store.contextOrNull?.provider).toBe('ollama');
      expect(store.contextOrNull?.model).toBe('llama3.2:1b');
    });

    it('should not include sovereignMode by default', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3',
      });

      // sovereignMode should be undefined by default
      expect(store.contextOrNull?.sovereignMode).toBeUndefined();
    });
  });

  describe('setSovereignMode action', () => {
    it('should set sovereignMode=true on context', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'sovereign-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:1b',
      });

      store.setSovereignMode(true);

      expect(store.contextOrNull?.sovereignMode).toBe(true);
    });

    it('should set sovereignMode=false on context', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'cloud-agent',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-3',
      });

      // First set to true
      store.setSovereignMode(true);
      expect(store.contextOrNull?.sovereignMode).toBe(true);

      // Then set to false
      store.setSovereignMode(false);
      expect(store.contextOrNull?.sovereignMode).toBe(false);
    });

    it('should not throw when context is not initialized', () => {
      const store = useExecutionContextStore();

      // Context is not initialized - should not throw
      expect(() => store.setSovereignMode(true)).not.toThrow();

      // Context should still be null
      expect(store.contextOrNull).toBeNull();
    });

    it('should preserve other context fields when setting sovereignMode', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:1b',
        taskId: 'task-456',
        planId: 'plan-789',
        deliverableId: 'del-012',
      });

      store.setSovereignMode(true);

      // All other fields should be preserved
      expect(store.contextOrNull?.orgSlug).toBe('test-org');
      expect(store.contextOrNull?.userId).toBe('user-123');
      expect(store.contextOrNull?.conversationId).toBe('conv-123');
      expect(store.contextOrNull?.agentSlug).toBe('test-agent');
      expect(store.contextOrNull?.agentType).toBe('context');
      expect(store.contextOrNull?.provider).toBe('ollama');
      expect(store.contextOrNull?.model).toBe('llama3.2:1b');
      expect(store.contextOrNull?.taskId).toBe('task-456');
      expect(store.contextOrNull?.planId).toBe('plan-789');
      expect(store.contextOrNull?.deliverableId).toBe('del-012');
      expect(store.contextOrNull?.sovereignMode).toBe(true);
    });
  });

  describe('setLLM action', () => {
    it('should update provider and model', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'openai',
        model: 'gpt-4',
      });

      store.setLLM('ollama', 'llama3.2:1b');

      expect(store.contextOrNull?.provider).toBe('ollama');
      expect(store.contextOrNull?.model).toBe('llama3.2:1b');
    });
  });

  describe('update action', () => {
    it('should replace entire context including sovereignMode', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:1b',
      });

      // Update with new context including sovereignMode
      store.update({
        orgSlug: 'new-org',
        userId: 'user-456',
        conversationId: 'conv-456',
        taskId: 'task-new',
        planId: '00000000-0000-0000-0000-000000000000',
        deliverableId: 'del-new',
        agentSlug: 'new-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:3b',
        sovereignMode: true,
      });

      expect(store.contextOrNull?.orgSlug).toBe('new-org');
      expect(store.contextOrNull?.sovereignMode).toBe(true);
    });
  });

  describe('clear action', () => {
    it('should clear context including any sovereignMode setting', () => {
      const store = useExecutionContextStore();

      store.initialize({
        orgSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
        agentSlug: 'test-agent',
        agentType: 'context',
        provider: 'ollama',
        model: 'llama3.2:1b',
      });

      store.setSovereignMode(true);
      expect(store.contextOrNull?.sovereignMode).toBe(true);

      store.clear();

      expect(store.contextOrNull).toBeNull();
      expect(store.isInitialized).toBe(false);
    });
  });
});
