import * as crypto from 'crypto';
import { AgentIdentity, IIdentityProvider } from '../identity.interface';

export class AgntcyCryptoIdentityProvider implements IIdentityProvider {
  readonly providerId = 'agntcy-crypto-identity';

  private identities = new Map<string, AgentIdentity>();
  private privateKeys = new Map<string, crypto.KeyObject>();
  private activeIdentityId: string | null = null;

  async generateIdentity(): Promise<AgentIdentity> {
    const keyPair = crypto.generateKeyPairSync('ed25519');
    const id = `agntcy-${crypto.randomUUID()}`;
    const identity: AgentIdentity = {
      id,
      publicKey: keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      algorithm: 'ed25519',
      createdAt: new Date().toISOString(),
    };
    this.identities.set(id, identity);
    this.privateKeys.set(id, keyPair.privateKey);
    this.activeIdentityId = id;
    return identity;
  }

  async sign(message: string): Promise<string> {
    if (!this.activeIdentityId) {
      await this.generateIdentity();
    }
    const activeId = this.activeIdentityId!;
    const key = this.privateKeys.get(activeId);
    if (!key) {
      throw new Error(`No private key found for active AGNTCY identity ${activeId}`);
    }
    const signature = crypto.sign(null, Buffer.from(message, 'utf8'), key);
    return signature.toString('base64');
  }

  async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
    const key = crypto.createPublicKey(publicKey);
    return crypto.verify(
      null,
      Buffer.from(message, 'utf8'),
      key,
      Buffer.from(signature, 'base64'),
    );
  }

  async resolveIdentity(id: string): Promise<AgentIdentity | null> {
    return this.identities.get(id) ?? null;
  }
}
