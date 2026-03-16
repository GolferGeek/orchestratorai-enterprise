import { X402UsdcPaymentProvider } from '../x402-usdc.provider';

jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn().mockImplementation(() => ({
    evm: {},
  })),
}));

describe('X402UsdcPaymentProvider discovery extension metadata', () => {
  const originalKeyId = process.env.CDP_API_KEY_ID;
  const originalPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;

  beforeAll(() => {
    process.env.CDP_API_KEY_ID = 'test-cdp-key-id';
    process.env.CDP_API_KEY_PRIVATE_KEY = 'test-cdp-private-key';
  });

  afterAll(() => {
    if (originalKeyId === undefined) delete process.env.CDP_API_KEY_ID;
    else process.env.CDP_API_KEY_ID = originalKeyId;
    if (originalPrivateKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
    else process.env.CDP_API_KEY_PRIVATE_KEY = originalPrivateKey;
  });

  it('returns x402 v2 extension metadata', () => {
    const provider = new X402UsdcPaymentProvider();
    const metadata = provider.getDiscoveryExtensionMetadata();
    expect(metadata).toMatchObject({
      protocol: 'x402',
      version: '2.0',
      delegatedPaymentSpec: true,
      smartWalletInterop: true,
    });
  });
});
