import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ProtocolFactory } from '../../factory';
import { registerAllProviders } from '../factory-registration';

jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn(),
}));

describe('Commerce ACP preset load', () => {
  const tmpDataDir = join(process.cwd(), '.tmp-commerce-preset-tests');
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

  it('loads commerce-acp preset and resolves commerce providers', () => {
    const factory = new ProtocolFactory();
    registerAllProviders(factory, { dataDir: tmpDataDir });

    const config = factory.mergeConfig({
      discovery: 'well-known',
      transport: 'http-rest',
      negotiation: 'commerce-cart-negotiation',
      identity: 'oauth-jwt',
      payment: 'commerce-checkout',
      wallet: 'local-keypair',
      trust: 'allowlist',
      encryption: 'tls-mutual',
      resilience: 'retry',
      observability: 'opentelemetry',
      orchestration: 'commerce-checkout-fsm',
      audit: 'hash-chain',
    });
    expect(factory.resolveWith('negotiation', config).providerId).toBe('commerce-cart-negotiation');
    expect(factory.resolveWith('payment', config).providerId).toBe('commerce-checkout');
    expect(factory.resolveWith('orchestration', config).providerId).toBe('commerce-checkout-fsm');
  });
});
