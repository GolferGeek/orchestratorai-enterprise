import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ProtocolFactory } from '../../factory';
import { registerAllProviders } from '../factory-registration';

jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn(),
}));

describe('Mixed suite config load', () => {
  const tmpDataDir = join(process.cwd(), '.tmp-mixed-suite-tests');
  const originalCdpKeyId = process.env.CDP_API_KEY_ID;
  const originalCdpPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;
  const originalCdpWalletNetwork = process.env.CDP_WALLET_NETWORK;

  beforeAll(() => {
    mkdirSync(tmpDataDir, { recursive: true });
    process.env.CDP_API_KEY_ID = 'test-cdp-key-id';
    process.env.CDP_API_KEY_PRIVATE_KEY = 'test-cdp-private-key';
    process.env.CDP_WALLET_NETWORK = 'base-sepolia';
  });

  afterAll(() => {
    rmSync(tmpDataDir, { recursive: true, force: true });
    if (originalCdpKeyId === undefined) delete process.env.CDP_API_KEY_ID;
    else process.env.CDP_API_KEY_ID = originalCdpKeyId;
    if (originalCdpPrivateKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
    else process.env.CDP_API_KEY_PRIVATE_KEY = originalCdpPrivateKey;
    if (originalCdpWalletNetwork === undefined) delete process.env.CDP_WALLET_NETWORK;
    else process.env.CDP_WALLET_NETWORK = originalCdpWalletNetwork;
  });

  it('loads A2A discovery + x402 payment + AGNTCY encryption composition', () => {
    const factory = new ProtocolFactory();
    registerAllProviders(factory, { dataDir: tmpDataDir });

    const config = factory.mergeConfig({
      discovery: 'a2a-agent-card',
      transport: 'a2a-jsonrpc',
      negotiation: 'a2a-skill-negotiation',
      identity: 'agntcy-crypto-identity',
      payment: 'x402-usdc',
      wallet: 'coinbase-cdp',
      trust: 'a2a-jws-trust',
      encryption: 'agntcy-slim',
      resilience: 'circuit-breaker',
      observability: 'opentelemetry',
      orchestration: 'a2a-task-lifecycle',
      audit: 'hash-chain',
    });

    expect(factory.resolveWith('discovery', config).providerId).toBe('a2a-agent-card');
    expect(factory.resolveWith('payment', config).providerId).toBe('x402-usdc');
    expect(factory.resolveWith('encryption', config).providerId).toBe('agntcy-slim');
    expect(factory.resolveWith('orchestration', config).providerId).toBe('a2a-task-lifecycle');
  });
});
