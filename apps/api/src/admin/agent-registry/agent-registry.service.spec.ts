import { BadRequestException } from '@nestjs/common';
import type { DatabaseService } from '@orchestrator-ai/transport-types';
import type { AgentDefinitionService } from '../../agents/invoke/agent-definition.service';
import { AgentRegistryService } from './agent-registry.service';

/** The agent row and catalog row the fake database answers with, and what it was asked to write. */
function fakeDb(agent: Record<string, unknown> | null, catalog: { model_type: string; is_active: boolean } | null) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    from: (_schema: string | null, table: string) => {
      let update: Record<string, unknown> | null = null;
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (values: Record<string, unknown>) => ((update = values), updates.push(values), builder),
        maybeSingle: async () => ({ data: table === 'agents' ? agent : catalog, error: null }),
        single: async () => ({ data: { ...agent, ...update }, error: null }),
      };
      return builder;
    },
  };
  return { db: db as unknown as DatabaseService, updates };
}

const mediaAgent = {
  slug: 'infographic-agent',
  name: 'Infographic',
  agent_type: 'media',
  organization_slug: ['marketing'],
  llm_config: { provider: 'openai', model: 'gpt-image-1' },
  metadata: { status: 'active', mediaType: 'image' },
  updated_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
};

describe('AgentRegistryService', () => {
  const loads = { validateRow: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  it('sets a media agent\'s model to an active catalog model that makes images', async () => {
    const { db, updates } = fakeDb(mediaAgent, { model_type: 'image-generation', is_active: true });
    const service = new AgentRegistryService(db, loads as unknown as AgentDefinitionService);
    await service.updateAgentModel('infographic-agent', { provider: 'openrouter', model: 'recraft/recraft-v4.1-vector' });
    expect(updates[0]).toMatchObject({ llm_config: { provider: 'openrouter', model: 'recraft/recraft-v4.1-vector' } });
    expect(loads.validateRow).toHaveBeenCalledWith(expect.objectContaining({ llm_config: { provider: 'openrouter', model: 'recraft/recraft-v4.1-vector' } }));
  });

  it('refuses a model that is missing, withdrawn, or makes the wrong thing', async () => {
    const attempt = (catalog: { model_type: string; is_active: boolean } | null) =>
      new AgentRegistryService(fakeDb(mediaAgent, catalog).db, loads as unknown as AgentDefinitionService).updateAgentModel('infographic-agent', { provider: 'openrouter', model: 'x/y' });
    await expect(attempt(null)).rejects.toThrow('openrouter x/y is not in the model catalog');
    await expect(attempt({ model_type: 'image-generation', is_active: false })).rejects.toThrow('no longer offered');
    await expect(attempt({ model_type: 'text-generation', is_active: true })).rejects.toThrow('x/y makes text-generation; agent infographic-agent needs image-generation');
    await expect(
      new AgentRegistryService(fakeDb(mediaAgent, null).db, loads as unknown as AgentDefinitionService).updateAgentModel('infographic-agent', { provider: '', model: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a config the agent loader would not load, and writes nothing', async () => {
    const { db, updates } = fakeDb(mediaAgent, null);
    loads.validateRow.mockImplementationOnce(() => {
      throw new Error('agent.metadata.mediaType is invalid');
    });
    await expect(new AgentRegistryService(db, loads as unknown as AgentDefinitionService).updateAgentConfig('infographic-agent', { config: { status: 'active' } })).rejects.toThrow(
      'The agent would not load: agent.metadata.mediaType is invalid',
    );
    expect(updates).toEqual([]);
  });

  it('lists an agent whose llm_config holds only generation settings as having no model of its own', async () => {
    const rows = [
      { ...mediaAgent, slug: 'general-assistant', agent_type: 'context', llm_config: { maxTokens: 4000, temperature: 0.7 } },
      mediaAgent,
      { ...mediaAgent, slug: 'no-config', llm_config: null },
    ];
    const listing = (agents: Array<Record<string, unknown>>) => {
      const db = { from: () => ({ select: () => ({ order: async () => ({ data: agents, error: null }) }) }) };
      return new AgentRegistryService(db as unknown as DatabaseService, loads as unknown as AgentDefinitionService).listAgents();
    };
    const { agents } = await listing(rows);
    expect(agents.map((a) => [a.slug, a.llmConfig])).toEqual([
      ['general-assistant', null],
      ['infographic-agent', { provider: 'openai', model: 'gpt-image-1' }],
      ['no-config', null],
    ]);
    await expect(listing([{ ...mediaAgent, llm_config: { provider: 'openai' } }])).rejects.toThrow('must name both provider and model, or neither');
  });
});
