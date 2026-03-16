import { AgntcyOasfDiscoveryProvider } from '../agntcy-oasf.provider';
import { AgentCard } from '@agent-communication/shared-types';

describe('AgntcyOasfDiscoveryProvider', () => {
  it('publishes and discovers OASF-enriched cards', async () => {
    const provider = new AgntcyOasfDiscoveryProvider();
    const card: AgentCard = {
      id: 'agntcy-agent',
      name: 'AGNTCY Agent',
      description: 'federated',
      url: 'http://localhost:9999',
      version: '1.0.0',
      capabilities: [],
      endpoints: [],
      protocols: {
        discovery: ['agntcy-oasf'],
        transport: ['http-rest'],
        negotiation: ['capability-card'],
        identity: ['agntcy-crypto-identity'],
        payment: ['mock'],
        wallet: ['local-keypair'],
        trust: ['reputation'],
        encryption: ['agntcy-slim'],
        resilience: ['retry'],
        observability: ['opentelemetry'],
        orchestration: ['pipeline'],
      },
    };

    await provider.publishCard(card);
    const discovered = await provider.discoverAgent('agntcy');
    expect(discovered?.id).toBe('agntcy-agent');
    expect((discovered?.metadata?.oasf as { schema?: string })?.schema).toBe('agntcy-oasf-v1');
  });
});
