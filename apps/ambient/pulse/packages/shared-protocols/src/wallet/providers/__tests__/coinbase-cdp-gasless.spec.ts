import { CoinbaseCdpWalletProvider } from '../coinbase-cdp.provider';

jest.mock('@coinbase/cdp-sdk', () => ({
  CdpClient: jest.fn().mockImplementation(() => ({
    evm: {
      createAccount: jest.fn().mockResolvedValue({ address: '0xabc' }),
      listTokenBalances: jest.fn().mockResolvedValue({ balances: [] }),
      signTransaction: jest.fn().mockResolvedValue({ signature: '0xsig' }),
      signMessage: jest.fn().mockResolvedValue({ signature: '0xmsgsig' }),
    },
  })),
}));

describe('CoinbaseCdpWalletProvider gasless support', () => {
  const originalKeyId = process.env.CDP_API_KEY_ID;
  const originalPrivateKey = process.env.CDP_API_KEY_PRIVATE_KEY;
  const originalNetwork = process.env.CDP_WALLET_NETWORK;

  beforeAll(() => {
    process.env.CDP_API_KEY_ID = 'test-cdp-key-id';
    process.env.CDP_API_KEY_PRIVATE_KEY = 'test-cdp-private-key';
    process.env.CDP_WALLET_NETWORK = 'base-sepolia';
  });

  afterAll(() => {
    if (originalKeyId === undefined) delete process.env.CDP_API_KEY_ID;
    else process.env.CDP_API_KEY_ID = originalKeyId;
    if (originalPrivateKey === undefined) delete process.env.CDP_API_KEY_PRIVATE_KEY;
    else process.env.CDP_API_KEY_PRIVATE_KEY = originalPrivateKey;
    if (originalNetwork === undefined) delete process.env.CDP_WALLET_NETWORK;
    else process.env.CDP_WALLET_NETWORK = originalNetwork;
  });

  it('declares gasless transaction support and marks payload', () => {
    const provider = new CoinbaseCdpWalletProvider();
    expect(provider.supportsGaslessTransactions()).toBe(true);
    const payload = provider.buildGaslessTransactionPayload({ to: '0x123', value: '1' });
    expect(payload).toMatchObject({
      to: '0x123',
      value: '1',
      gasless: true,
      sponsor: 'coinbase-smart-wallet',
    });
  });
});
