jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn(),
}));

import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ProtocolFactory } from '../../factory';
import { registerAllProviders } from '../factory-registration';
import { PROTOCOL_PRESETS } from '@agent-communication/shared-types';

describe('A2A preset load', () => {
  const tmpDataDir = join(process.cwd(), '.tmp-a2a-preset-tests');
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
    if (originalCdpKeyId === undefined) {
      delete process.env.CDP_API_KEY_ID;
    } else {
      process.env.CDP_API_KEY_ID = originalCdpKeyId;
    }
    if (originalCdpPrivateKey === undefined) {
      delete process.env.CDP_API_KEY_PRIVATE_KEY;
    } else {
      process.env.CDP_API_KEY_PRIVATE_KEY = originalCdpPrivateKey;
    }
    if (originalCdpWalletNetwork === undefined) {
      delete process.env.CDP_WALLET_NETWORK;
    } else {
      process.env.CDP_WALLET_NETWORK = originalCdpWalletNetwork;
    }
  });

  it('loads a2a-full and resolves all configured providers', () => {
    const factory = new ProtocolFactory();
    registerAllProviders(factory, { dataDir: tmpDataDir });

    const preset = PROTOCOL_PRESETS.find((item) => item.id === 'a2a-full');
    if (!preset) {
      throw new Error('a2a-full preset is missing');
    }

    const config = factory.mergeConfig(preset.config);
    expect(factory.resolveWith('discovery', config).providerId).toBe('a2a-agent-card');
    expect(factory.resolveWith('transport', config).providerId).toBe('a2a-jsonrpc');
    expect(factory.resolveWith('negotiation', config).providerId).toBe('a2a-skill-negotiation');
    expect(factory.resolveWith('trust', config).providerId).toBe('a2a-jws-trust');
    expect(factory.resolveWith('orchestration', config).providerId).toBe('a2a-task-lifecycle');
  });

  it('loads a2a-ap2 with x402 + coinbase composition', () => {
    const factory = new ProtocolFactory();
    registerAllProviders(factory, { dataDir: tmpDataDir });

    const preset = PROTOCOL_PRESETS.find((item) => item.id === 'a2a-ap2');
    if (!preset) {
      throw new Error('a2a-ap2 preset is missing');
    }

    const config = factory.mergeConfig(preset.config);
    expect(factory.resolveWith('payment', config).providerId).toBe('x402-usdc');
    expect(factory.resolveWith('wallet', config).providerId).toBe('coinbase-cdp');
  });
});
