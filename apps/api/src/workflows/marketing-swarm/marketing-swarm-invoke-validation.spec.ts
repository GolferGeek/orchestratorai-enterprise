import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { validateMarketingSwarmInvoke } from './marketing-swarm-invoke-validation';

function request(overrides: Record<string, unknown> = {}) {
  const context = createMockExecutionContext({
    orgSlug: 'acme',
    userId: 'user-1',
    agentSlug: 'marketing-swarm',
    agentType: 'workflow',
  });
  return {
    jsonrpc: '2.0',
    id: 'workflow-1',
    method: 'invoke',
    params: {
      context,
      data: {
        contentType: 'json',
        content: {
          contentTypeSlug: 'blog-post',
          promptData: {
            topic: 'Hardening',
            audience: 'Developers',
            goal: 'Explain the work',
            keyPoints: ['Access control'],
            tone: 'Direct',
          },
          config: {
            writers: [
              {
                agentSlug: 'writer',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            editors: [
              {
                agentSlug: 'editor',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            evaluators: [
              {
                agentSlug: 'evaluator',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            execution: {
              maxLocalConcurrent: 1,
              maxCloudConcurrent: 5,
              maxEditCycles: 2,
              topNForFinalRanking: 1,
              topNForDeliverable: 1,
            },
          },
        },
      },
    },
    ...overrides,
  };
}

describe('Marketing Swarm A2A validation', () => {
  it('accepts a strict workflow invoke and preserves the context capsule', () => {
    const body = request();
    const result = validateMarketingSwarmInvoke(body, 'user-1', 'acme');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.input.context).toBe(body.params.context);
      expect(result.input.taskId).toBe(body.params.context.conversationId);
    }
  });

  it('rejects cross-tenant and wrong-workflow contexts', () => {
    const body = request();
    body.params.context.orgSlug = 'other-org';
    body.params.context.agentSlug = 'other-workflow';

    expect(validateMarketingSwarmInvoke(body, 'user-1', 'acme').valid).toBe(
      false,
    );
  });

  it('rejects ignored or out-of-bounds workflow fields', () => {
    const body = request();
    Object.assign(body.params.data.content.config, { legacyDefault: true });

    expect(validateMarketingSwarmInvoke(body, 'user-1', 'acme')).toEqual(
      expect.objectContaining({ valid: false, message: 'config is invalid' }),
    );
  });
});
