import * as crypto from 'crypto';
import { AgntcySlimEncryptionProvider } from '../agntcy-slim.provider';

describe('AgntcySlimEncryptionProvider', () => {
  it('encrypts and decrypts with peer key material', async () => {
    const provider = new AgntcySlimEncryptionProvider();
    const peer = crypto.generateKeyPairSync('x25519');
    const peerPublic = peer.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const peerPrivate = peer.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

    const ciphertext = await provider.encrypt('secure-message', peerPublic);
    const plaintext = await provider.decrypt(ciphertext, peerPrivate);
    expect(plaintext).toBe('secure-message');
  });

  it('establishes shared secret and rotates keys', async () => {
    const provider = new AgntcySlimEncryptionProvider();
    const peer = crypto.generateKeyPairSync('x25519');
    const peerPublic = peer.publicKey.export({ format: 'pem', type: 'spki' }).toString();

    const secret = await provider.establishSharedSecret(peerPublic);
    expect(secret.length).toBeGreaterThan(0);

    const rotated = await provider.rotateKeys();
    expect(rotated.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(rotated.privateKey).toContain('BEGIN PRIVATE KEY');
  });
});
