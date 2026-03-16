import { AgntcyCryptoIdentityProvider } from '../agntcy-crypto-identity.provider';

describe('AgntcyCryptoIdentityProvider', () => {
  it('generates identity and verifies signatures', async () => {
    const provider = new AgntcyCryptoIdentityProvider();
    const identity = await provider.generateIdentity();
    const signature = await provider.sign('hello-agntcy');
    const verified = await provider.verify('hello-agntcy', signature, identity.publicKey);
    expect(verified).toBe(true);
    const resolved = await provider.resolveIdentity(identity.id);
    expect(resolved?.id).toBe(identity.id);
  });
});
