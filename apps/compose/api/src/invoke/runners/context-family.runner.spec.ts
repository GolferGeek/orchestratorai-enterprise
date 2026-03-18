/**
 * ContextFamilyRunner unit tests
 *
 * Tests LLM call construction, content extraction from LLMResponse,
 * system prompt building, and InvokeOutput shape.
 */

import { ContextFamilyRunner } from './context-family.runner';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { AgentDefinition } from '../agent-definition.types';

const mockDefinition: AgentDefinition = {
  id: 'def-1',
  slug: 'blog-writer',
  name: 'Blog Writer',
  agentType: 'context',
  status: 'active',
  context: 'You are a professional blog writer.',
  outputType: 'markdown',
  llmConfig: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
};

describe('ContextFamilyRunner', () => {
  let runner: ContextFamilyRunner;
  let mockLlmService: { generateUnifiedResponse: jest.Mock };

  beforeEach(() => {
    mockLlmService = {
      generateUnifiedResponse: jest.fn().mockResolvedValue({
        content: 'Generated blog content here.',
        metadata: { tokensUsed: 120 },
      }),
    };

    runner = new ContextFamilyRunner(mockLlmService as never);
  });

  describe('invoke — happy path', () => {
    it('calls LLM with system prompt and user message, returns InvokeOutput', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer' });
      const data = { content: 'Write about AI trends' };

      const output = await runner.invoke(mockDefinition, context, data);

      expect(mockLlmService.generateUnifiedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          systemPrompt: 'You are a professional blog writer.',
          userMessage: 'Write about AI trends',
        }),
      );

      expect(output.content).toBe('Generated blog content here.');
      expect(output.outputType).toBe('markdown');
      expect(output.metadata?.agentSlug).toBe('blog-writer');
    });

    it('passes ExecutionContext whole to LLM options for observability', async () => {
      const context = createMockExecutionContext({ agentSlug: 'blog-writer', orgSlug: 'acme' });

      await runner.invoke(mockDefinition, context, { content: 'test' });

      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.options?.executionContext).toEqual(context);
      expect(call?.options?.organizationSlug).toBe('acme');
    });
  });

  describe('invoke — system prompt fallback', () => {
    it('uses default system prompt when definition.context is empty', async () => {
      const defNoContext: AgentDefinition = { ...mockDefinition, context: '' };
      const context = createMockExecutionContext();

      await runner.invoke(defNoContext, context, { content: 'hello' });

      const call = mockLlmService.generateUnifiedResponse.mock.calls[0]?.[0];
      expect(call?.systemPrompt).toContain('Blog Writer');
    });
  });

  describe('invoke — string LLM response', () => {
    it('handles a plain string response from LLM service', async () => {
      mockLlmService.generateUnifiedResponse.mockResolvedValueOnce('plain string response');
      const context = createMockExecutionContext();

      const output = await runner.invoke(mockDefinition, context, { content: 'test' });

      expect(output.content).toBe('plain string response');
    });
  });
});
