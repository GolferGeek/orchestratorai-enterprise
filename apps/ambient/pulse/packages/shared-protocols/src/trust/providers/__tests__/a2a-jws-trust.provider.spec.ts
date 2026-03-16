import { generateKeyPairSync, createSign } from 'crypto';
import { A2AJwsTrustProvider } from '../a2a-jws-trust.provider';

describe('A2AJwsTrustProvider', () => {
  it('verifies signed card payloads and updates trust score', async () => {
    const provider = new A2AJwsTrustProvider();
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const card = { id: 'agent-trust', name: 'Trust Agent' };
    const signer = createSign('RSA-SHA256');
    signer.update(JSON.stringify(card));
    signer.end();
    const signature = signer.sign(privateKey, 'base64url');

    const valid = provider.verifySignedAgentCard({ card, signature }, publicKey);
    expect(valid).toBe(true);

    await provider.recordInteraction('agent-trust', 'success');
    const score = await provider.getTrustScore('agent-trust');
    expect(score.level).toBe('trusted');
  });

  it('accepts TLS 1.2+ and rejects lower versions', () => {
    const provider = new A2AJwsTrustProvider();
    expect(provider.validateTlsVersion('TLS1.2')).toBe(true);
    expect(provider.validateTlsVersion('TLS1.3')).toBe(true);
    expect(provider.validateTlsVersion('TLS1.1')).toBe(false);
  });
});
