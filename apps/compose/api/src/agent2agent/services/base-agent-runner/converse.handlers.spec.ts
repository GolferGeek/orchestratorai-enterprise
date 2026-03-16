import 'reflect-metadata';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { buildConversationalPrompt } from './converse.handlers';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('Converse Handlers', () => {
  const _mockContext = createMockExecutionContext();

  describe('buildConversationalPrompt', () => {
    it('should build a basic prompt from agent definition', () => {
      const definition = {
        id: 'test-id',
        slug: 'test-agent',
        displayName: 'Test Agent',
        organizationSlug: 'test-org',
        agentType: 'tool',
        modeProfile: { standard: { plan: true, build: true, converse: true } },
        prompts: {
          system: 'You are a helpful assistant.',
        },
      } as unknown as AgentRuntimeDefinition;

      const result = buildConversationalPrompt(definition, []);

      expect(result).toContain('You are a helpful assistant.');
    });

    it('should use fallback prompt when system prompt is not provided', () => {
      const definition = {
        id: 'test-id',
        slug: 'test-agent',
        displayName: 'Test Agent',
        organizationSlug: 'test-org',
        agentType: 'tool',
        modeProfile: { standard: { plan: true, build: true, converse: true } },
      } as unknown as AgentRuntimeDefinition;

      const result = buildConversationalPrompt(definition, []);

      // Implementation uses definition.name ?? definition.slug, so it falls back to slug
      expect(result).toContain('You are test-agent.');
      expect(result).toContain('Respond helpfully and concisely.');
    });

    it('should include conversation history in prompt', () => {
      const definition = {
        id: 'test-id',
        slug: 'test-agent',
        displayName: 'Test Agent',
        organizationSlug: 'test-org',
        agentType: 'tool',
        modeProfile: { standard: { plan: true, build: true, converse: true } },
        prompts: {
          system: 'You are a helpful assistant.',
        },
      } as unknown as AgentRuntimeDefinition;

      const history = [
        { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = buildConversationalPrompt(definition, history);

      expect(result).toContain('Recent conversation history:');
      expect(result).toContain('user: Hello');
      expect(result).toContain('assistant: Hi there!');
    });

    it('should include additional guidance when provided', () => {
      const definition = {
        id: 'test-id',
        slug: 'test-agent',
        displayName: 'Test Agent',
        organizationSlug: 'test-org',
        agentType: 'tool',
        modeProfile: { standard: { plan: true, build: true, converse: true } },
        prompts: {
          system: 'You are a helpful assistant.',
        },
        context: {
          conversation_guidelines: 'Always be polite and professional.',
        },
      } as unknown as AgentRuntimeDefinition;

      const result = buildConversationalPrompt(definition, []);

      expect(result).toContain('Agent guidance:');
      expect(result).toContain('Always be polite and professional.');
    });

    it('should limit conversation history to last 10 messages', () => {
      const definition = {
        id: 'test-id',
        slug: 'test-agent',
        displayName: 'Test Agent',
        organizationSlug: 'test-org',
        agentType: 'tool',
        modeProfile: { standard: { plan: true, build: true, converse: true } },
        prompts: {
          system: 'You are a helpful assistant.',
        },
      } as unknown as AgentRuntimeDefinition;

      const history = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      }));

      const result = buildConversationalPrompt(definition, history);

      expect(result).toContain('Message 19');
      expect(result).not.toContain('Message 0');
    });
  });
});
