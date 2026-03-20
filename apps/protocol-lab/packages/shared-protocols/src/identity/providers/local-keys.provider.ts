import * as crypto from 'crypto';
import { IIdentityProvider, AgentIdentity } from '../identity.interface';

export class LocalKeysIdentityProvider implements IIdentityProvider {
  readonly providerId = 'local-keys';

  private keyPair: { publicKey: string; privateKey: string } | null = null;
  private identity: AgentIdentity | null = null;
  private knownIdentities: Map<string, AgentIdentity> = new Map();

  async generateIdentity(): Promise<AgentIdentity> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.keyPair = { publicKey, privateKey };

    this.identity = {
      id: crypto.randomUUID(),
      publicKey,
      algorithm: 'Ed25519',
      createdAt: new Date().toISOString(),
    };

    this.knownIdentities.set(this.identity.id, this.identity);
    return this.identity;
  }

  async sign(message: string): Promise<string> {
    if (!this.keyPair) {
      throw new Error('No identity generated. Call generateIdentity() first.');
    }
    const sign = crypto.createSign('SHA256');
    // Ed25519 doesn't use a digest, so we use the raw sign
    const signature = crypto.sign(null, Buffer.from(message), this.keyPair.privateKey);
    return signature.toString('base64');
  }

  async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      return crypto.verify(null, Buffer.from(message), publicKey, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }

  async resolveIdentity(id: string): Promise<AgentIdentity | null> {
    return this.knownIdentities.get(id) ?? null;
  }

  registerIdentity(identity: AgentIdentity): void {
    this.knownIdentities.set(identity.id, identity);
  }
}
