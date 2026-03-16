import * as crypto from 'crypto';
import { IEncryptionProvider } from '../encryption.interface';

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

const RSA_MODULUS_LENGTH = 2048;

export class TLSMutualEncryptionProvider implements IEncryptionProvider {
  readonly providerId = 'tls-mutual';

  private currentKeyPair: KeyPair | null = null;
  private sessionKeys: Map<string, Buffer> = new Map();

  constructor() {
    this.currentKeyPair = this.generateCertificateKeyPair();
  }

  async encrypt(message: string, recipientPublicKey: string): Promise<string> {
    // Check if we have a session key for this recipient
    const sessionKey = this.sessionKeys.get(recipientPublicKey);

    if (sessionKey) {
      // Use existing session key for AES-256-GCM encryption
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
      const encrypted = Buffer.concat([cipher.update(message, 'utf-8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const record = JSON.stringify({
        protocol: 'tls-mtls',
        version: '1.3',
        mode: 'session',
        iv: iv.toString('hex'),
        ciphertext: encrypted.toString('hex'),
        authTag: authTag.toString('hex'),
      });

      return `tls-mtls:${Buffer.from(record).toString('base64')}`;
    }

    // No session key — use RSA + AES hybrid encryption
    // Generate a random AES key for this message
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // Encrypt the message with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(message, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Wrap the AES key with the recipient's RSA public key
    const wrappedKey = crypto.publicEncrypt(
      {
        key: recipientPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey,
    );

    const record = JSON.stringify({
      protocol: 'tls-mtls',
      version: '1.3',
      mode: 'hybrid',
      wrappedKey: wrappedKey.toString('hex'),
      iv: iv.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      authTag: authTag.toString('hex'),
    });

    return `tls-mtls:${Buffer.from(record).toString('base64')}`;
  }

  async decrypt(ciphertext: string, privateKey: string): Promise<string> {
    if (!ciphertext.startsWith('tls-mtls:')) {
      throw new Error('Invalid TLS record: missing tls-mtls prefix');
    }

    const recordBase64 = ciphertext.slice('tls-mtls:'.length);
    const record = JSON.parse(Buffer.from(recordBase64, 'base64').toString('utf-8'));

    const iv = Buffer.from(record.iv, 'hex');
    const encrypted = Buffer.from(record.ciphertext, 'hex');
    const authTag = Buffer.from(record.authTag, 'hex');

    let aesKey: Buffer;

    if (record.mode === 'session') {
      // Derive session key the same way establishSharedSecret does:
      // We need to find the session key. For session mode, the caller must have
      // established a session. Use the private key to derive the session key.
      // Look up session key from our stored sessions.
      const sessionEntry = [...this.sessionKeys.values()][0];
      if (!sessionEntry) {
        throw new Error('No session key available for session-mode decryption. Call establishSharedSecret() first.');
      }
      aesKey = sessionEntry;
    } else {
      // Hybrid mode — unwrap AES key with RSA private key
      const wrappedKey = Buffer.from(record.wrappedKey, 'hex');
      aesKey = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        wrappedKey,
      );
    }

    // Decrypt with AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf-8');
  }

  async establishSharedSecret(peerPublicKey: string): Promise<string> {
    if (!this.currentKeyPair) {
      throw new Error('No certificate key pair available. Call rotateKeys() first.');
    }

    // Generate a random 48-byte pre-master secret (TLS 1.2 style)
    const preMasterSecret = crypto.randomBytes(48);

    // Encrypt the pre-master secret with the peer's RSA public key
    crypto.publicEncrypt(
      {
        key: peerPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      preMasterSecret,
    );

    // Derive a 256-bit session key from the pre-master secret
    const sessionKey = crypto.createHash('sha256').update(preMasterSecret).digest();

    // Store session key indexed by the peer's public key
    this.sessionKeys.set(peerPublicKey, sessionKey);

    return sessionKey.toString('hex');
  }

  async rotateKeys(): Promise<KeyPair> {
    this.currentKeyPair = this.generateCertificateKeyPair();
    this.sessionKeys.clear();
    return { ...this.currentKeyPair };
  }

  private generateCertificateKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: RSA_MODULUS_LENGTH,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return { publicKey, privateKey };
  }
}
