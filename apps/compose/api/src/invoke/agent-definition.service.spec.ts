/**
 * AgentDefinitionService unit tests
 *
 * Tests agent resolution from DB by org-scoped lookup, global fallback,
 * and normalizing agent type strings to AgentFamily values.
 */

import { AgentDefinitionService } from './agent-definition.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

/** Build a fluent QueryBuilder mock that resolves with a canned result. */
function buildQueryBuilder(result: { data: Record<string, unknown> | null; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  const chain = () => builder as never;

  builder['select'] = jest.fn().mockReturnValue(builder);
  builder['eq'] = jest.fn().mockReturnValue(builder);
  builder['is'] = jest.fn().mockReturnValue(builder);
  builder['single'] = jest.fn().mockReturnValue({
    ...builder,
    then: (resolve: (v: typeof result) => void) => resolve(result),
  });

  return builder;
}

const baseRow: Record<string, unknown> = {
  id: 'agent-1',
  slug: 'my-context-agent',
  name: 'My Context Agent',
  description: 'A test agent',
  agent_type: 'context',
  status: 'active',
  output_type: 'text',
  organization_slug: 'acme',
  llm_config: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
};

describe('AgentDefinitionService', () => {
  let service: AgentDefinitionService;
  let mockDb: { from: jest.Mock };

  beforeEach(() => {
    mockDb = { from: jest.fn() };
    service = new AgentDefinitionService(mockDb as never);
  });

  describe('resolve — org-scoped lookup', () => {
    it('returns a mapped AgentDefinitionV2 when the org-scoped row is found', async () => {
      const queryBuilder = buildQueryBuilder({ data: baseRow, error: null });
      mockDb.from.mockReturnValue(queryBuilder);

      const result = await service.resolve('my-context-agent', 'acme');

      expect(result).not.toBeNull();
      expect(result!.slug).toBe('my-context-agent');
      expect(result!.agentType).toBe('context');
      expect(result!.llmConfig?.provider).toBe('anthropic');
    });
  });

  describe('resolve — global fallback', () => {
    it('falls back to global (null org) agent when org-scoped lookup fails', async () => {
      const failedBuilder = buildQueryBuilder({ data: null, error: { message: 'not found' } });
      const globalBuilder = buildQueryBuilder({ data: { ...baseRow, organization_slug: null }, error: null });

      mockDb.from
        .mockReturnValueOnce(failedBuilder)
        .mockReturnValueOnce(globalBuilder);

      const result = await service.resolve('my-context-agent', 'unknown-org');

      expect(result).not.toBeNull();
      expect(result!.slug).toBe('my-context-agent');
    });

    it('returns null when neither org-scoped nor global agent is found', async () => {
      const failedBuilder = buildQueryBuilder({ data: null, error: { message: 'not found' } });
      mockDb.from.mockReturnValue(failedBuilder);

      const result = await service.resolve('ghost-agent', 'acme');

      expect(result).toBeNull();
    });
  });

  describe('normalizeFamily', () => {
    it('normalizes legacy agent_type strings with suffixes to family names', async () => {
      const ragRow = { ...baseRow, agent_type: 'rag-runner', slug: 'rag-agent' };
      const queryBuilder = buildQueryBuilder({ data: ragRow, error: null });
      mockDb.from.mockReturnValue(queryBuilder);

      const result = await service.resolve('rag-agent', 'acme');

      expect(result!.agentType).toBe('rag');
    });
  });
});
