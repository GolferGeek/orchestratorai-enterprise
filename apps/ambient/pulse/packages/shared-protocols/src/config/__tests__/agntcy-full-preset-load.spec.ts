import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ProtocolFactory } from '../../factory';
import { registerAllProviders } from '../factory-registration';

jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn(),
}));

describe('AGNTCY preset load', () => {
  const tmpDataDir = join(process.cwd(), '.tmp-agntcy-preset-tests');
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

  it('resolves AGNTCY providers with agntcy-full composition', () => {
    const factory = new ProtocolFactory();
    registerAllProviders(factory, { dataDir: tmpDataDir });

    const config = factory.mergeConfig({
      discovery: 'agntcy-oasf',
      transport: 'http-rest',
      negotiation: 'capability-card',
      identity: 'agntcy-crypto-identity',
      payment: 'mock',
      wallet: 'local-keypair',
      trust: 'reputation',
      encryption: 'agntcy-slim',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'pipeline',
      audit: 'hash-chain',
    });

    expect(factory.resolveWith('discovery', config).providerId).toBe('agntcy-oasf');
    expect(factory.resolveWith('identity', config).providerId).toBe('agntcy-crypto-identity');
    expect(factory.resolveWith('encryption', config).providerId).toBe('agntcy-slim');
  });
});
