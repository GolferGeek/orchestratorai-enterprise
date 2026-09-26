import { WorkflowHandlerRegistry } from './workflow-handler.registry';

const handler = {
  slug: 'exec-digest',
  run: async () => ({ kind: 'completed' as const, result: null }),
};

describe('WorkflowHandlerRegistry', () => {
  it('returns the registered handler', () => {
    const registry = new WorkflowHandlerRegistry();
    registry.register(handler);
    expect(registry.get('exec-digest')).toBe(handler);
    expect(registry.has('exec-digest')).toBe(true);
  });

  it('refuses a second handler for the same slug', () => {
    const registry = new WorkflowHandlerRegistry();
    registry.register(handler);
    expect(() => registry.register(handler)).toThrow('already registered');
  });

  it('errors for an unregistered slug instead of defaulting', () => {
    const registry = new WorkflowHandlerRegistry();
    expect(() => registry.get('unknown')).toThrow('No run handler is registered for workflow "unknown"');
  });
});
