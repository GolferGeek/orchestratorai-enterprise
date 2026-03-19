import * as crypto from 'crypto';
import { IIdentityProvider, AgentIdentity } from '../identity.interface';

export class X509IdentityProvider implements IIdentityProvider {
  readonly providerId = 'x509';

  private privateKeyPem: string | null = null;
  private publicKeyPem: string | null = null;
  private certificates: Map<string, AgentIdentity> = new Map();

  async generateIdentity(): Promise<AgentIdentity> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.publicKeyPem = publicKey;
    this.privateKeyPem = privateKey;

    // Compute SHA-256 fingerprint of the DER-encoded public key
    const publicKeyDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
    const hash = crypto.createHash('sha256').update(publicKeyDer).digest();
    const formattedFingerprint = `SHA-256:${Array.from(hash).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':')}`;

    const identity: AgentIdentity = {
      id: formattedFingerprint,
      publicKey: publicKey,
      algorithm: 'RSA-2048',
      createdAt: new Date().toISOString(),
    };

    this.certificates.set(formattedFingerprint, identity);
    return identity;
  }

  async sign(message: string): Promise<string> {
    if (!this.privateKeyPem) {
      throw new Error('No identity generated. Call generateIdentity() first.');
    }

    const signature = crypto.sign('sha256', Buffer.from(message), this.privateKeyPem);
    return signature.toString('base64');
  }

  async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
    const storedIdentity = Array.from(this.certificates.values()).find(
      (id) => id.publicKey === publicKey,
    );

    if (!storedIdentity) {
      return false;
    }

    const signatureBuffer = Buffer.from(signature, 'base64');
    return crypto.verify('sha256', Buffer.from(message), publicKey, signatureBuffer);
  }

  async resolveIdentity(id: string): Promise<AgentIdentity | null> {
    return this.certificates.get(id) ?? null;
  }
}
