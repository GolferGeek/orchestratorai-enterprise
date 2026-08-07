import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionContextStore } from './executionContextStore';

describe('ExecutionContext store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
    });
  });

  it('creates and freezes the complete frontend capsule', () => {
    const store = useExecutionContextStore();
    store.initialize({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: 'conversation-1',
      agentSlug: 'writer',
      agentType: 'context',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });

    expect(store.current).toEqual({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: 'conversation-1',
      agentSlug: 'writer',
      agentType: 'context',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
    expect(Object.keys(store.current)).not.toContain('sovereignMode');
    expect(Object.isFrozen(store.current)).toBe(true);
  });

  it('retains an explicitly selected sovereign mode in the capsule', () => {
    const store = useExecutionContextStore();
    store.initialize({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: 'conversation-1',
      agentSlug: 'writer',
      agentType: 'context',
      provider: 'ollama',
      model: 'llama3.2:1b',
      sovereignMode: true,
    });

    expect(store.current.sovereignMode).toBe(true);
  });

  it('fails instead of using an insecure UUID fallback', () => {
    vi.stubGlobal('crypto', {});
    const store = useExecutionContextStore();

    expect(() =>
      store.initialize({
        orgSlug: 'acme',
        userId: 'user-1',
        conversationId: 'conversation-1',
        agentSlug: 'writer',
        agentType: 'context',
        provider: 'anthropic',
        model: 'claude-sonnet',
      }),
    ).toThrow('Secure UUID generation is unavailable');
    expect(store.contextOrNull).toBeNull();
  });
});
