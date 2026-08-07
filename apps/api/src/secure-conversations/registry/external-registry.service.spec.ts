import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { OriginValidatorService } from '../security/origin-validator.service';
import { OutboundUrlValidatorService } from '../security/outbound-url-validator.service';
import { ExternalRegistryService } from './external-registry.service';

const storedAgent = {
  org_slug: 'acme',
  agent_id: 'agent-1',
  name: 'Agent One',
  description: 'Test agent',
  url: 'https://agent.example',
  a2a_endpoint: 'https://agent.example/invoke',
  protocols: ['json-rpc-2.0'],
  api_key: 'must-not-leak',
  version: '1.0.0',
  capabilities: ['invoke'],
  status: 'online' as const,
  last_heartbeat: new Date().toISOString(),
  trust_score: 80,
  trust_level: 'trusted' as const,
  interactions_count: 10,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  agent_card: {},
  allowed_origin: true,
};

describe('ExternalRegistryService secret handling', () => {
  const originValidator = {} as OriginValidatorService;
  const urlValidator = {} as OutboundUrlValidatorService;
  const db = {
    getAgent: jest.fn(async () => storedAgent),
  } as unknown as SecureConversationsDatabaseService;
  const service = new ExternalRegistryService(
    originValidator,
    urlValidator,
    db,
  );

  it('never returns API keys from the controller-facing agent lookup', async () => {
    const agent = await service.getAgent('agent-1', 'acme');
    expect(agent).not.toHaveProperty('apiKey');
    expect(JSON.stringify(agent)).not.toContain('must-not-leak');
  });

  it('makes the API key available only to internal outbound dispatch', async () => {
    await expect(
      service.getAgentConnection('agent-1', 'acme'),
    ).resolves.toMatchObject({ apiKey: 'must-not-leak' });
  });
});
