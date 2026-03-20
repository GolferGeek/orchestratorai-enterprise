import * as crypto from 'crypto';
import { IEncryptionProvider } from '../encryption.interface';

export class AgntcySlimEncryptionProvider implements IEncryptionProvider {
  readonly providerId = 'agntcy-slim';

  private keyPair = crypto.generateKeyPairSync('x25519');

  async encrypt(message: string, recipientPublicKey: string): Promise<string> {
    const nonce = crypto.randomBytes(12);
    const symmetricKey = this.deriveSymmetricKey(recipientPublicKey);
    const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, nonce);
    const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      protocol: 'agntcy-slim-v1',
      nonce: nonce.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    });
  }

  async decrypt(ciphertext: string, privateKey: string): Promise<string> {
    const parsed = JSON.parse(ciphertext) as {
      nonce: string;
      authTag: string;
      ciphertext: string;
    };
    const keyObject = crypto.createPrivateKey(privateKey);
    const symmetricKey = crypto
      .createHash('sha256')
      .update(
        crypto.diffieHellman({
          privateKey: keyObject,
          publicKey: this.keyPair.publicKey,
        }),
      )
      .digest();

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      symmetricKey,
      Buffer.from(parsed.nonce, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  async establishSharedSecret(peerPublicKey: string): Promise<string> {
    const secret = crypto.diffieHellman({
      privateKey: this.keyPair.privateKey,
      publicKey: crypto.createPublicKey(peerPublicKey),
    });
    return secret.toString('base64');
  }

  async rotateKeys(): Promise<{ publicKey: string; privateKey: string }> {
    this.keyPair = crypto.generateKeyPairSync('x25519');
    return {
      publicKey: this.keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      privateKey: this.keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    };
  }

  private deriveSymmetricKey(recipientPublicKey: string): Buffer {
    const sharedSecret = crypto.diffieHellman({
      privateKey: this.keyPair.privateKey,
      publicKey: crypto.createPublicKey(recipientPublicKey),
    });
    return crypto.createHash('sha256').update(sharedSecret).digest();
  }
}
