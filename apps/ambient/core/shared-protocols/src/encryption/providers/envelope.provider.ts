import * as crypto from 'crypto';
import { IEncryptionProvider } from '../encryption.interface';

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

const CURVE = 'prime256v1';

export class EnvelopeEncryptionProvider implements IEncryptionProvider {
  readonly providerId = 'envelope';

  private currentKeyPair: KeyPair | null = null;
  private ecdh: crypto.ECDH;
  private sharedSecretKey: Buffer | null = null;

  constructor() {
    this.ecdh = crypto.createECDH(CURVE);
    this.ecdh.generateKeys();
    this.currentKeyPair = {
      publicKey: this.ecdh.getPublicKey('hex'),
      privateKey: this.ecdh.getPrivateKey('hex'),
    };
  }

  async encrypt(message: string, recipientPublicKey: string): Promise<string> {
    // Generate an ephemeral ECDH keypair for this encryption operation
    const ephemeral = crypto.createECDH(CURVE);
    ephemeral.generateKeys();

    // Compute shared secret between ephemeral private key and recipient public key
    const sharedSecret = ephemeral.computeSecret(Buffer.from(recipientPublicKey, 'hex'));

    // Derive AES-256 key from shared secret
    const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();

    // Encrypt with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(message, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope = JSON.stringify({
      algorithm: 'AES-256-GCM',
      ephemeralPublicKey: ephemeral.getPublicKey('hex'),
      iv: iv.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      authTag: authTag.toString('hex'),
    });

    return Buffer.from(envelope).toString('base64');
  }

  async decrypt(ciphertext: string, privateKey: string): Promise<string> {
    const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'));

    // Reconstruct ECDH with the provided private key
    const ecdh = crypto.createECDH(CURVE);
    ecdh.setPrivateKey(Buffer.from(privateKey, 'hex'));

    // Compute shared secret using our private key + the ephemeral public key from the envelope
    const sharedSecret = ecdh.computeSecret(Buffer.from(envelope.ephemeralPublicKey, 'hex'));

    // Derive AES key
    const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();

    // Decrypt with AES-256-GCM
    const iv = Buffer.from(envelope.iv, 'hex');
    const encrypted = Buffer.from(envelope.ciphertext, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf-8');
  }

  async establishSharedSecret(peerPublicKey: string): Promise<string> {
    if (!this.currentKeyPair) {
      throw new Error('No key pair available. Call rotateKeys() first.');
    }

    // Compute real ECDH shared secret
    const sharedSecret = this.ecdh.computeSecret(Buffer.from(peerPublicKey, 'hex'));

    // Derive a usable AES key from the shared secret
    this.sharedSecretKey = crypto.createHash('sha256').update(sharedSecret).digest();

    return this.sharedSecretKey.toString('hex');
  }

  async rotateKeys(): Promise<KeyPair> {
    this.ecdh = crypto.createECDH(CURVE);
    this.ecdh.generateKeys();
    this.currentKeyPair = {
      publicKey: this.ecdh.getPublicKey('hex'),
      privateKey: this.ecdh.getPrivateKey('hex'),
    };
    this.sharedSecretKey = null;
    return { ...this.currentKeyPair };
  }
}
